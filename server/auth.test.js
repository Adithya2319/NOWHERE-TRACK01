import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createHash } from 'node:crypto'
import { openDatabase, seedDatabase } from './db.js'
import { installAuth } from './auth.js'
import { createMiniMothAdapter } from './provider.js'

const START = Date.parse('2026-10-16T07:00:00Z')
const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

async function fixture(t, options = {}) {
  const db = openDatabase(':memory:')
  seedDatabase(db, '2026-10-16')
  let timestamp = START
  const calls = []
  let behavior = options.behavior
  const config = {
    authMode: options.mode || 'demo', apiKey: options.noKey ? '' : 'server-only-test-key',
    cookieSecure: Boolean(options.secure), sessionHours: 8, now: () => timestamp,
    fetchImpl: async (url, init) => {
      assert.equal(new URL(url).origin, 'https://api.minimoth.dev')
      assert.equal(init.method, 'POST')
      assert.equal(init.headers['X-Api-Key'], 'server-only-test-key')
      const path = new URL(url).pathname
      const body = JSON.parse(init.body)
      calls.push({ path, body })
      if (behavior) {
        const response = await behavior(path, body)
        if (response !== undefined) return response
      }
      if (path === '/v1/otp/send') return jsonResponse({ otp_id: 'opaque-provider-otp', expires_at: new Date(timestamp + 600000).toISOString() })
      if (path === '/v1/otp/verify') return jsonResponse({ access_token: 'access-original', refresh_token: 'refresh-original', expires_at: new Date(timestamp + 300000).toISOString(), identity_id: 'identity-stable' })
      if (path === '/v1/session/validate') return jsonResponse({ valid: true, expires_at: new Date(timestamp + 300000).toISOString(), identity_id: 'identity-stable' })
      if (path === '/v1/session/refresh') return jsonResponse({ access_token: 'access-rotated', refresh_token: 'refresh-rotated', expires_at: new Date(timestamp + 300000).toISOString() })
      if (path === '/v1/session/logout') return jsonResponse({ revoked: true })
      throw new Error(`Unexpected provider path: ${path}`)
    },
  }
  const app = express()
  app.use(express.json())
  const auth = installAuth(app, db, config)
  app.post('/api/test/approved', auth.requireAuth, auth.requireApproved, (req, res) => res.json({ id: req.user.id }))
  app.post('/api/test/moderator', auth.requireAuth, auth.requireModerator, (req, res) => res.json({ id: req.user.id }))
  const server = await new Promise((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)) })
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); db.close() })
  const address = `http://127.0.0.1:${server.address().port}`
  const request = async (path, { method = 'GET', body, cookie } = {}) => {
    const response = await fetch(`${address}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie'), headers: response.headers }
  }
  const login = async (userId = 'student-a') => request('/api/auth/demo', { method: 'POST', body: { userId } })
  const providerLogin = async () => request('/api/auth/otp/verify', { method: 'POST', body: { phone: '9876543210', code: '493827' } })
  return { db, calls, request, login, providerLogin, setBehavior: (value) => { behavior = value }, advance: (duration) => { timestamp += duration }, config }
}

test('explicit demo login uses an opaque HttpOnly cookie and persists only its hash', async (t) => {
  const f = await fixture(t)
  const status = await f.request('/api/auth/status')
  assert.equal(status.data.authMode, 'demo')
  assert.equal(status.data.demoAccounts.length, 6)
  const login = await f.login()
  assert.equal(login.status, 200)
  assert.match(login.cookie, /HttpOnly; SameSite=Lax/)
  assert.doesNotMatch(login.cookie, /; Secure/)
  const raw = login.cookie.split(';')[0].split('=')[1]
  assert.match(raw, /^[A-Za-z0-9_-]{43}$/)
  const row = f.db.prepare('SELECT * FROM sessions').get()
  assert.equal(row.id_hash, createHash('sha256').update(raw).digest('hex'))
  assert.equal(row.provider_access, null)
  assert.equal(row.provider_refresh, null)
  const me = await f.request('/api/me', { cookie: login.cookie })
  assert.equal(me.data.user.id, 'student-a')
  assert.deepEqual(me.data.user.interests, ['robotics', 'electronics'])
  assert.equal(me.data.user.phoneVerified, false)
  assert.equal(f.calls.length, 0)
  assert.equal(JSON.stringify(me.data).includes(row.id_hash), false)
})

test('demo sessions survive a fresh middleware installation using the same database', async (t) => {
  const f = await fixture(t)
  const login = await f.login()
  const app = express()
  installAuth(app, f.db, f.config)
  const server = await new Promise((resolve) => { const value = app.listen(0, '127.0.0.1', () => resolve(value)) })
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) })
  const result = await fetch(`http://127.0.0.1:${server.address().port}/api/me`, { headers: { Cookie: login.cookie } })
  assert.equal(result.status, 200)
  assert.equal((await result.json()).user.id, 'student-a')
})

test('expired sessions and malformed cookies fail closed', async (t) => {
  const f = await fixture(t)
  const login = await f.login()
  f.advance(8 * 3600000)
  const result = await f.request('/api/me', { cookie: login.cookie })
  assert.equal(result.status, 401)
  assert.match(result.cookie, /Max-Age=0/)
  assert.equal(f.db.prepare('SELECT revoked FROM sessions').get().revoked, 1)
  assert.equal((await f.request('/api/me', { cookie: 'campus360_session=../../bad' })).status, 401)
})

test('sessions cannot cross from provider authentication into demo bypass mode', async (t) => {
  const f = await fixture(t)
  const login = await f.login()
  // Simulate reusing a database after the configured authentication mode changes.
  f.db.prepare("UPDATE users SET provider_id = 'provider-account' WHERE id = 'student-a'").run()
  assert.equal((await f.request('/api/me', { cookie: login.cookie })).status, 401)
  assert.equal((await f.login()).status, 400)
})

test('approved membership and moderator privileges are enforced through direct API calls', async (t) => {
  const f = await fixture(t)
  assert.equal((await f.request('/api/test/approved', { method: 'POST' })).status, 401)
  const student = await f.login('student-a')
  assert.equal((await f.request('/api/test/approved', { method: 'POST', cookie: student.cookie })).status, 200)
  assert.equal((await f.request('/api/test/moderator', { method: 'POST', cookie: student.cookie })).status, 403)
  const unapproved = await f.login('new-student')
  assert.equal((await f.request('/api/test/approved', { method: 'POST', cookie: unapproved.cookie })).status, 403)
  const moderator = await f.login('moderator-a')
  assert.equal((await f.request('/api/test/moderator', { method: 'POST', cookie: moderator.cookie })).status, 200)
})

test('demo OTP endpoints never pretend to deliver or verify a code', async (t) => {
  const f = await fixture(t)
  assert.equal((await f.request('/api/auth/otp/send', { method: 'POST', body: { phone: '9876543210' } })).status, 409)
  assert.equal((await f.providerLogin()).status, 409)
  assert.equal((await f.login('missing-user')).status, 400)
  assert.equal(f.calls.length, 0)
})

test('provider mode disables demo bypass and truthfully reports a missing key', async (t) => {
  const f = await fixture(t, { mode: 'provider', noKey: true })
  const status = await f.request('/api/auth/status')
  assert.deepEqual(status.data.demoAccounts, [])
  assert.equal(status.data.configured, false)
  assert.equal((await f.login()).status, 404)
  assert.equal((await f.providerLogin()).status, 503)
  assert.equal(f.calls.length, 0)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0)
})

test('provider OTP send uses documented fields, normalizes phone, and enforces cooldown', async (t) => {
  const f = await fixture(t, { mode: 'provider' })
  assert.equal((await f.request('/api/auth/otp/send', { method: 'POST', body: { phone: 'bad' } })).status, 400)
  const sent = await f.request('/api/auth/otp/send', { method: 'POST', body: { phone: '9876543210' } })
  assert.equal(sent.status, 200)
  assert.deepEqual(f.calls[0].body, { phone: '+919876543210' })
  const cooldown = await f.request('/api/auth/otp/send', { method: 'POST', body: { phone: '+919876543210' } })
  assert.equal(cooldown.status, 429)
  assert.equal(cooldown.headers.get('retry-after'), '60')
  assert.equal(f.calls.length, 1)
  f.advance(60000)
  assert.equal((await f.request('/api/auth/otp/send', { method: 'POST', body: { phone: '9876543210' } })).status, 200)
})

test('provider identity maps to a stable unverified student without leaking tokens', async (t) => {
  const f = await fixture(t, { mode: 'provider', secure: true })
  const first = await f.providerLogin()
  assert.equal(first.status, 200)
  assert.match(first.cookie, /; Secure/)
  assert.equal(first.data.user.role, 'student')
  assert.equal(first.data.user.membership, 'unverified')
  assert.equal(first.data.user.phoneVerified, true)
  assert.equal(first.data.user.onboarding, false)
  assert.equal(first.data.user.classId, 'fe-a')
  assert.deepEqual(f.calls[0], { path: '/v1/otp/verify', body: { phone: '+919876543210', code: '493827' } })
  const second = await f.providerLogin()
  assert.equal(first.data.user.id, second.data.user.id)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM users WHERE provider_id IS NOT NULL').get().n, 1)
  assert.equal(JSON.stringify(first.data).includes('access-original'), false)
  assert.equal(JSON.stringify(first.data).includes('refresh-original'), false)
  assert.equal(JSON.stringify(first.data).includes('identity-stable'), false)
  const me = await f.request('/api/me', { cookie: first.cookie })
  assert.equal(me.status, 200)
  assert.equal(f.calls.filter((call) => call.path.endsWith('/validate')).length, 3)
})

test('invalid OTP and malformed provider responses never create local sessions', async (t) => {
  const f = await fixture(t, { mode: 'provider' })
  assert.equal((await f.request('/api/auth/otp/verify', { method: 'POST', body: { phone: '9876543210', code: 123456 } })).status, 400)
  f.setBehavior((path) => path.endsWith('/verify') ? jsonResponse({ error: 'INVALID_OTP', secret: 'do-not-leak' }, 401) : undefined)
  const invalid = await f.providerLogin()
  assert.equal(invalid.status, 401)
  assert.equal(JSON.stringify(invalid.data).includes('do-not-leak'), false)
  f.setBehavior((path) => path.endsWith('/verify') ? jsonResponse({ access_token: 'untrusted-decoded-jwt' }) : undefined)
  assert.equal((await f.providerLogin()).status, 503)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0)
})

test('unvalidated or mismatched provider identities cannot authenticate', async (t) => {
  const f = await fixture(t, { mode: 'provider' })
  f.setBehavior((path) => path.endsWith('/validate') ? jsonResponse({ valid: false }) : undefined)
  assert.equal((await f.providerLogin()).status, 401)
  f.setBehavior((path) => path.endsWith('/validate') ? jsonResponse({ valid: true, identity_id: 'somebody-else', expires_at: new Date(START + 300000).toISOString() }) : undefined)
  assert.equal((await f.providerLogin()).status, 401)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0)
})

test('each provider request is validated and revocation invalidates the local session', async (t) => {
  const f = await fixture(t, { mode: 'provider' })
  const login = await f.providerLogin()
  assert.equal((await f.request('/api/me', { cookie: login.cookie })).status, 200)
  f.setBehavior((path) => path.endsWith('/validate') ? jsonResponse({ valid: false }) : undefined)
  assert.equal((await f.request('/api/me', { cookie: login.cookie })).status, 401)
  const calls = f.calls.length
  assert.equal((await f.request('/api/me', { cookie: login.cookie })).status, 401)
  assert.equal(f.calls.length, calls)
  const row = f.db.prepare('SELECT * FROM sessions').get()
  assert.equal(row.revoked, 1)
  assert.equal(row.provider_refresh, null)
})

test('provider outage denies access honestly without destroying a retryable session', async (t) => {
  const f = await fixture(t, { mode: 'provider' })
  const login = await f.providerLogin()
  f.setBehavior((path) => { if (path.endsWith('/validate')) throw new Error('network unavailable') })
  const outage = await f.request('/api/me', { cookie: login.cookie })
  assert.equal(outage.status, 503)
  assert.equal(f.db.prepare('SELECT revoked FROM sessions').get().revoked, 0)
  assert.equal(outage.cookie, null)
  f.setBehavior(undefined)
  assert.equal((await f.request('/api/me', { cookie: login.cookie })).status, 200)
})

test('membership changes during provider validation take effect before protected authorization', async (t) => {
  const f = await fixture(t, { mode: 'provider' })
  const login = await f.providerLogin()
  f.db.prepare("UPDATE users SET membership='approved' WHERE id=?").run(login.data.user.id)
  f.setBehavior((path) => {
    if (path.endsWith('/validate')) f.db.prepare("UPDATE users SET membership='rejected' WHERE id=?").run(login.data.user.id)
  })
  assert.equal((await f.request('/api/test/approved', { method: 'POST', cookie: login.cookie })).status, 403)
})

test('concurrent expired-token requests serialize refresh and persist both rotated tokens', async (t) => {
  const f = await fixture(t, { mode: 'provider' })
  const login = await f.providerLogin()
  f.advance(300001)
  let completeRefresh
  const releaseRefresh = new Promise((resolve) => { completeRefresh = resolve })
  let refreshStarted
  const started = new Promise((resolve) => { refreshStarted = resolve })
  f.setBehavior(async (path, body) => {
    if (path.endsWith('/refresh')) { refreshStarted(); await releaseRefresh; assert.equal(body.refresh_token, 'refresh-original') }
  })
  const one = f.request('/api/me', { cookie: login.cookie })
  await started
  const two = f.request('/api/me', { cookie: login.cookie })
  completeRefresh()
  const results = await Promise.all([one, two])
  assert.deepEqual(results.map((value) => value.status), [200, 200])
  assert.equal(f.calls.filter((call) => call.path.endsWith('/refresh')).length, 1)
  const row = f.db.prepare('SELECT * FROM sessions').get()
  assert.equal(row.provider_access, 'access-rotated')
  assert.equal(row.provider_refresh, 'refresh-rotated')
  assert.ok(f.calls.filter((call) => call.path.endsWith('/validate')).slice(1).every((call) => call.body.access_token === 'access-rotated'))
})

test('invalid refresh requires re-login while a refresh outage permits a retry', async (t) => {
  const f = await fixture(t, { mode: 'provider' })
  const login = await f.providerLogin()
  f.advance(300001)
  f.setBehavior((path) => path.endsWith('/refresh') ? jsonResponse({ error: 'down' }, 500) : undefined)
  assert.equal((await f.request('/api/me', { cookie: login.cookie })).status, 503)
  assert.equal(f.db.prepare('SELECT revoked FROM sessions').get().revoked, 0)
  f.setBehavior((path) => path.endsWith('/refresh') ? jsonResponse({ error: 'INVALID_REFRESH_TOKEN' }, 401) : undefined)
  assert.equal((await f.request('/api/me', { cookie: login.cookie })).status, 401)
  assert.equal(f.db.prepare('SELECT revoked FROM sessions').get().revoked, 1)
})

test('logout revokes provider session, clears the cookie, and cannot reuse the local session', async (t) => {
  const f = await fixture(t, { mode: 'provider' })
  const login = await f.providerLogin()
  const logout = await f.request('/api/auth/logout', { method: 'POST', cookie: login.cookie })
  assert.equal(logout.status, 200)
  assert.equal(logout.data.providerRevoked, true)
  assert.deepEqual(f.calls.at(-1), { path: '/v1/session/logout', body: { access_token: 'access-original' } })
  assert.match(logout.cookie, /Max-Age=0/)
  assert.equal((await f.request('/api/me', { cookie: login.cookie })).status, 401)
  assert.equal((await f.request('/api/auth/logout', { method: 'POST', cookie: login.cookie })).data.loggedOut, true)
})

test('logout refreshes an expired provider token before documented revocation', async (t) => {
  const f = await fixture(t, { mode: 'provider' })
  const login = await f.providerLogin()
  f.advance(300001)
  const logout = await f.request('/api/auth/logout', { method: 'POST', cookie: login.cookie })
  assert.equal(logout.data.providerRevoked, true)
  assert.deepEqual(f.calls.slice(-2).map((call) => call.path), ['/v1/session/refresh', '/v1/session/logout'])
  assert.deepEqual(f.calls.at(-1).body, { access_token: 'access-rotated' })
})

test('logout racing an in-flight refresh revokes the rotated provider session without restoring local access', async (t) => {
  const f = await fixture(t, { mode: 'provider' })
  const login = await f.providerLogin()
  f.advance(300001)
  let releaseRefresh, signalRefresh, signalRevoked
  const blocked = new Promise((resolve) => { releaseRefresh = resolve })
  const started = new Promise((resolve) => { signalRefresh = resolve })
  const revoked = new Promise((resolve) => { signalRevoked = resolve })
  f.db.function('test_observe_revoke', () => { signalRevoked(); return 1 })
  f.db.exec('CREATE TEMP TRIGGER observe_revoke AFTER UPDATE OF revoked ON sessions WHEN NEW.revoked=1 BEGIN SELECT test_observe_revoke(); END;')
  f.setBehavior(async (path) => { if (path.endsWith('/refresh')) { signalRefresh(); await blocked } })
  const inFlight = f.request('/api/me', { cookie: login.cookie })
  await started
  const logout = f.request('/api/auth/logout', { method: 'POST', cookie: login.cookie })
  await revoked
  releaseRefresh()
  assert.equal((await logout).data.providerRevoked, true)
  assert.equal((await inFlight).status, 401)
  assert.deepEqual(f.calls.find((call) => call.path.endsWith('/logout')).body, { access_token: 'access-rotated' })
  const session = f.db.prepare('SELECT * FROM sessions').get()
  assert.equal(session.revoked, 1)
  assert.equal(session.provider_access, null)
  assert.equal(session.provider_refresh, null)
})

test('provider logout failure reports the limitation while guaranteeing local logout', async (t) => {
  const f = await fixture(t, { mode: 'provider' })
  const login = await f.providerLogin()
  f.setBehavior((path) => { if (path.endsWith('/logout')) throw new Error('provider is offline') })
  const logout = await f.request('/api/auth/logout', { method: 'POST', cookie: login.cookie })
  assert.equal(logout.status, 502)
  assert.equal(logout.data.loggedOut, true)
  assert.equal(logout.data.providerRevoked, false)
  assert.equal(f.db.prepare('SELECT revoked FROM sessions').get().revoked, 1)
  assert.equal((await f.request('/api/me', { cookie: login.cookie })).status, 401)
})

test('OTP verification rate limits apply before further provider calls', async (t) => {
  const f = await fixture(t, { mode: 'provider' })
  f.setBehavior((path) => path.endsWith('/verify') ? jsonResponse({ error: 'INVALID_OTP' }, 401) : undefined)
  for (let attempt = 0; attempt < 10; attempt += 1) assert.equal((await f.providerLogin()).status, 401)
  assert.equal((await f.providerLogin()).status, 429)
  assert.equal(f.calls.length, 10)
})

test('the REST adapter rejects malformed JSON, false validity types, and provider throttling', async () => {
  const make = (response) => createMiniMothAdapter({ apiKey: 'test', fetchImpl: async () => response, now: () => START })
  await assert.rejects(make(new Response('not json')).validate('access'), (error) => error.status === 503)
  await assert.rejects(make(jsonResponse({ valid: 'true' })).validate('access'), (error) => error.status === 503)
  await assert.rejects(make(jsonResponse({ error: 'throttled' }, 429)).send('+919876543210'), (error) => error.status === 429)
  await make(new Response(null, { status: 204 })).logout('access')
})
