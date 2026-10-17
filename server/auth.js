import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createMiniMothAdapter, ProviderError } from './provider.js'

const COOKIE = 'campus360_session'
const hash = (value) => createHash('sha256').update(value).digest('hex')

export function publicUser(user) {
  if (!user) return null
  const parse = (value) => {
    try { const result = JSON.parse(value || '[]'); return Array.isArray(result) ? result : [] } catch { return [] }
  }
  const parseObject = value => { try { const result = JSON.parse(value || '{}'); return result && typeof result === 'object' && !Array.isArray(result) ? result : {} } catch { return {} } }
  return {
    id: user.id, name: user.name, phone: user.phone, classId: user.class_id,
    role: user.role, membership: user.membership, subjects: parse(user.subjects),
    interests: parse(user.interests), phoneVerified: Boolean(user.phone_verified),
    onboarding: Boolean(user.onboarding),
    demo: Boolean(user.demo), academicDetails: parseObject(user.academic_details), contactPreferences: parseObject(user.contact_preferences),
  }
}

function sessionId(req) {
  const value = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null
}

function normalizedPhone(value) {
  if (typeof value !== 'string') return null
  const phone = value.trim()
  if (/^[6-9]\d{9}$/.test(phone)) return `+91${phone}`
  return /^\+91[6-9]\d{9}$/.test(phone) ? phone : null
}

export function installAuth(app, db, config) {
  const now = config.now || Date.now
  const provider = createMiniMothAdapter({ apiKey: config.apiKey, fetchImpl: config.fetchImpl, now })
  const demo = config.authMode === 'demo'
  const lifetime = Math.max(1, Math.min(Number(config.sessionHours) || 8, 720)) * 3600000
  const cookieOptions = `; Path=/; HttpOnly; SameSite=Lax${config.cookieSecure ? '; Secure' : ''}`
  const refreshes = new Map()
  const attempts = new Map()
  const cooldowns = new Map()

  const clearCookie = (res) => res.setHeader('Set-Cookie', `${COOKIE}=${cookieOptions}; Max-Age=0`)
  const getSession = (req) => {
    const id = sessionId(req)
    return id ? db.prepare('SELECT * FROM sessions WHERE id_hash = ?').get(hash(id)) : undefined
  }
  const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  const revoke = (idHash) => db.prepare('UPDATE sessions SET revoked = 1, provider_access = NULL, provider_refresh = NULL WHERE id_hash = ?').run(idHash)
  const respondError = (res, error) => {
    if (error instanceof ProviderError) {
      if (error.status === 429) res.setHeader('Retry-After', '60')
      return res.status(error.status).json({ error: error.message, code: error.code })
    }
    return res.status(500).json({ error: 'Authentication could not be completed. Please retry.', code: 'AUTH_ERROR' })
  }
  const route = (handler) => async (req, res) => {
    try { await handler(req, res) } catch (error) { respondError(res, error) }
  }

  function limited(req, res, scope, maximum, windowMs = 15 * 60000, identity) {
    const timestamp = now()
    // Keep the in-memory abuse guard bounded; application authorization remains in SQLite.
    if (attempts.size > 2000) for (const [key, value] of attempts) if (value.until <= timestamp) attempts.delete(key)
    if (attempts.size > 10000) {
      res.setHeader('Retry-After', '60')
      res.status(429).json({ error: 'Authentication is busy. Please retry later.', code: 'AUTH_RATE_LIMITED' })
      return true
    }
    const key = `${scope}:${identity || req.ip || req.socket.remoteAddress}`
    let record = attempts.get(key)
    if (!record || record.until <= timestamp) record = { count: 0, until: timestamp + windowMs }
    record.count += 1
    attempts.set(key, record)
    if (record.count > maximum) {
      res.setHeader('Retry-After', String(Math.ceil((record.until - timestamp) / 1000)))
      res.status(429).json({ error: 'Too many authentication attempts. Please wait before retrying.', code: 'AUTH_RATE_LIMITED' })
      return true
    }
    return false
  }

  function createSession(res, userId, tokens) {
    const id = randomBytes(32).toString('base64url')
    db.prepare(`INSERT INTO sessions
      (id_hash,user_id,expires_at,provider_access,provider_refresh,provider_expires,revoked)
      VALUES (?,?,?,?,?,?,0)`).run(hash(id), userId, now() + lifetime, tokens?.accessToken || null, tokens?.refreshToken || null, tokens?.expiresAt || null)
    res.setHeader('Set-Cookie', `${COOKIE}=${id}${cookieOptions}; Max-Age=${Math.floor(lifetime / 1000)}`)
  }

  async function refreshedSession(session) {
    if (!refreshes.has(session.id_hash)) {
      const pending = (async () => {
        const current = db.prepare('SELECT * FROM sessions WHERE id_hash = ?').get(session.id_hash)
        if (!current || current.revoked || current.expires_at <= now()) {
          throw new ProviderError('Your session expired. Please sign in again.', 401, 'AUTH_INVALID')
        }
        if (current.provider_expires > now()) return current
        if (!current.provider_refresh) throw new ProviderError('Your session expired. Please sign in again.', 401, 'AUTH_INVALID')
        const tokens = await provider.refresh(current.provider_refresh)
        db.prepare('UPDATE sessions SET provider_access = ?, provider_refresh = ?, provider_expires = ? WHERE id_hash = ? AND revoked = 0')
          .run(tokens.accessToken, tokens.refreshToken, tokens.expiresAt, session.id_hash)
        // Return the rotated pair even if logout concurrently revoked local storage,
        // so logout can still revoke the provider session with the latest access token.
        return { ...current, provider_access: tokens.accessToken, provider_refresh: tokens.refreshToken, provider_expires: tokens.expiresAt }
      })()
      refreshes.set(session.id_hash, pending)
      pending.finally(() => refreshes.delete(session.id_hash)).catch(() => {})
    }
    return refreshes.get(session.id_hash)
  }

  const requireAuth = async (req, res, next) => {
    let session = getSession(req)
    if (!session || session.revoked || session.expires_at <= now()) {
      if (session && !session.revoked) revoke(session.id_hash)
      clearCookie(res)
      return res.status(401).json({ error: 'Please sign in to continue.', code: 'AUTH_REQUIRED' })
    }
    try {
      let user = getUser(session.user_id)
      if (!user || (demo ? Boolean(user.provider_id) : !user.provider_id)) {
        revoke(session.id_hash)
        clearCookie(res)
        return res.status(401).json({ error: 'Please sign in again.', code: 'AUTH_REQUIRED' })
      }
      if (!demo) {
        if (session.provider_expires <= now()) session = await refreshedSession(session)
        const result = await provider.validate(session.provider_access)
        if (!result.valid || (result.identityId && result.identityId !== user.provider_id)) {
          throw new ProviderError('Your provider session is invalid. Please sign in again.', 401, 'AUTH_INVALID')
        }
        // Logout may happen while a provider request is in flight.
        const current = db.prepare('SELECT revoked, expires_at FROM sessions WHERE id_hash = ?').get(session.id_hash)
        if (!current || current.revoked || current.expires_at <= now()) {
          throw new ProviderError('Your session expired. Please sign in again.', 401, 'AUTH_INVALID')
        }
        // A moderator may change membership during the provider network round trip.
        // Authorize the operation using the current local profile, not that earlier snapshot.
        const currentUser = getUser(session.user_id)
        if (!currentUser || currentUser.provider_id !== user.provider_id) {
          throw new ProviderError('Your account changed. Please sign in again.', 401, 'AUTH_INVALID')
        }
        user = currentUser
      }
      req.user = publicUser(user)
      req.authSession = session
      next()
    } catch (error) {
      if (error instanceof ProviderError && error.status === 401) { revoke(session.id_hash); clearCookie(res) }
      respondError(res, error)
    }
  }

  const requireModerator = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.', code: 'AUTH_REQUIRED' })
    if (req.user.role !== 'moderator') return res.status(403).json({ error: 'A class moderator must perform this action.' })
    next()
  }
  const requireApproved = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.', code: 'AUTH_REQUIRED' })
    if (req.user.membership !== 'approved') return res.status(403).json({ error: 'Request campus membership approval from a moderator before using rides.', code: 'MEMBERSHIP_REQUIRED' })
    next()
  }

  app.get('/api/auth/status', (_req, res) => res.json({
    authMode: demo ? 'demo' : 'provider', configured: demo || Boolean(config.apiKey),
    demoAccounts: demo ? db.prepare('SELECT id, name, demo,role,class_id FROM users WHERE provider_id IS NULL ORDER BY demo DESC,name,id').all().map(user => ({id:user.id,name:user.name,demo:Boolean(user.demo),role:user.role,classId:user.class_id})) : [],
    demoToolsEnabled: Boolean(config.demoToolsEnabled),
    demoStatus: config.demoToolsEnabled ? config.demoStatus?.() : undefined,
  }))

  app.post('/api/auth/demo', route(async (req, res) => {
    if (!demo) return res.status(404).json({ error: 'Local account selection is disabled.' })
    if (limited(req, res, 'demo', 30)) return
    const user = typeof req.body?.userId === 'string' ? getUser(req.body.userId) : null
    if (!user || user.provider_id) return res.status(400).json({ error: 'Choose a listed local account.' })
    const prior = getSession(req)
    if (prior) revoke(prior.id_hash)
    createSession(res, user.id)
    res.json({ user: publicUser(user), authMode: 'demo' })
  }))

  app.post('/api/auth/otp/send', route(async (req, res) => {
    if (demo) return res.status(409).json({ error: 'This workspace uses local accounts. Select an account to continue.', code: 'DEMO_MODE' })
    if (limited(req, res, 'send', 10)) return
    const phone = normalizedPhone(req.body?.phone)
    if (!phone) return res.status(400).json({ error: 'Enter a valid Indian mobile number, optionally prefixed by +91.' })
    if (limited(req, res, 'send-phone', 5, 15 * 60000, phone)) return
    const remaining = (cooldowns.get(phone) || 0) - now()
    if (remaining > 0) {
      res.setHeader('Retry-After', String(Math.ceil(remaining / 1000)))
      return res.status(429).json({ error: 'Wait before requesting another code.', code: 'OTP_COOLDOWN' })
    }
    if (cooldowns.size > 2000) for (const [key, expires] of cooldowns) if (expires <= now()) cooldowns.delete(key)
    cooldowns.set(phone, now() + 60000)
    const result = await provider.send(phone)
    res.json({ sent: true, expiresAt: result.expiresAt, retryAfter: 60 })
  }))

  app.post('/api/auth/otp/verify', route(async (req, res) => {
    if (demo) return res.status(409).json({ error: 'Phone verification is unavailable for local accounts.', code: 'DEMO_MODE' })
    if (limited(req, res, 'verify', 30)) return
    const phone = normalizedPhone(req.body?.phone)
    if (!phone || typeof req.body?.code !== 'string' || !/^\d{6}$/.test(req.body.code)) {
      return res.status(400).json({ error: 'Enter a valid mobile number and six-digit code.' })
    }
    if (limited(req, res, 'verify-phone', 10, 15 * 60000, phone)) return
    const tokens = await provider.verify(phone, req.body.code)
    const validation = await provider.validate(tokens.accessToken)
    if (!validation.valid || (validation.identityId && validation.identityId !== tokens.identityId)) {
      throw new ProviderError('The verified provider identity could not be validated.', 401, 'AUTH_INVALID')
    }
    let user = db.prepare('SELECT * FROM users WHERE provider_id = ?').get(tokens.identityId)
    if (!user) {
      const id = randomUUID()
      db.prepare(`INSERT OR IGNORE INTO users
        (id,provider_id,phone,name,class_id,role,membership,subjects,interests,phone_verified,onboarding)
        VALUES (?,?,?,'New student','fe-a','student','unverified','[]','[]',1,0)`).run(id, tokens.identityId, phone)
      user = db.prepare('SELECT * FROM users WHERE provider_id = ?').get(tokens.identityId)
    }
    // The provider is the authority for phone ownership, never for class membership or role.
    db.prepare('UPDATE users SET phone = ?, phone_verified = 1 WHERE id = ?').run(phone, user.id)
    const prior = getSession(req)
    if (prior) revoke(prior.id_hash)
    createSession(res, user.id, tokens)
    res.json({ user: publicUser(getUser(user.id)), authMode: 'provider' })
  }))

  app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.user }))

  app.post('/api/auth/logout', route(async (req, res) => {
    const session = getSession(req)
    clearCookie(res)
    if (!session || session.revoked) return res.json({ loggedOut: true, providerRevoked: demo ? null : false })
    // Local logout is guaranteed even if revocation cannot reach MiniMoth.
    revoke(session.id_hash)
    if (demo) return res.json({ loggedOut: true, providerRevoked: null })
    try {
      // Finish any already-started refresh before using its rotated token for revocation.
      const pending = refreshes.get(session.id_hash)
      const latest = pending ? await pending : session
      let accessToken = latest.provider_access
      if (latest.provider_expires <= now()) accessToken = (await provider.refresh(latest.provider_refresh)).accessToken
      await provider.logout(accessToken)
      res.json({ loggedOut: true, providerRevoked: true })
    } catch {
      res.status(502).json({ loggedOut: true, providerRevoked: false, error: 'Signed out locally. Provider revocation could not be confirmed; the local session cannot be reused.' })
    }
  }))

  return { requireAuth, requireModerator, requireApproved }
}
