// MiniMoth's documented REST API. Credentials and tokens stay on the server.
// https://minimoth.dev/docs/quickstart/ and https://minimoth.dev/docs/sessions/
export class ProviderError extends Error {
  constructor(message, status = 503, code = 'AUTH_UNAVAILABLE') {
    super(message)
    this.name = 'ProviderError'
    this.status = status
    this.code = code
  }
}

const isToken = (value) => typeof value === 'string' && value.length > 0 && value.length <= 16384

function tokensFrom(data, now) {
  const expiresAt = Date.parse(data.expires_at)
  if (!isToken(data.access_token) || !isToken(data.refresh_token) || !Number.isFinite(expiresAt) || expiresAt <= now()) {
    throw new ProviderError('The authentication provider returned an invalid session.')
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt }
}

export function createMiniMothAdapter({ apiKey, fetchImpl = globalThis.fetch, now = Date.now }) {
  async function request(path, payload) {
    if (!apiKey || typeof fetchImpl !== 'function') {
      throw new ProviderError('Phone login is not configured on this server.', 503, 'AUTH_NOT_CONFIGURED')
    }
    let response
    let data
    try {
      response = await fetchImpl(`https://api.minimoth.dev/v1/${path}`, {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      })
      // The documented logout call does not require a response body (204 is valid).
      data = path === 'session/logout' && response.ok ? {} : await response.json()
    } catch {
      throw new ProviderError('Phone authentication is temporarily unavailable. Please retry.')
    }
    if (response.status === 429) {
      throw new ProviderError('Too many authentication attempts. Please wait before retrying.', 429, 'AUTH_RATE_LIMITED')
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 400 || response.status === 404) {
        throw new ProviderError('The code or provider session is invalid or expired.', 401, 'AUTH_INVALID')
      }
      throw new ProviderError('Phone authentication is temporarily unavailable. Please retry.')
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new ProviderError('The authentication provider returned an invalid response.')
    }
    return data
  }

  return {
    async send(phone) {
      const data = await request('otp/send', { phone })
      if (typeof data.otp_id !== 'string' || !Number.isFinite(Date.parse(data.expires_at))) {
        throw new ProviderError('The authentication provider did not confirm OTP delivery scheduling.')
      }
      return { expiresAt: data.expires_at }
    },
    async verify(phone, code) {
      const data = await request('otp/verify', { phone, code })
      if (typeof data.identity_id !== 'string' || !data.identity_id || data.identity_id.length > 256) {
        throw new ProviderError('The authentication provider did not return a stable identity.')
      }
      return { ...tokensFrom(data, now), identityId: data.identity_id }
    },
    async validate(accessToken) {
      const data = await request('session/validate', { access_token: accessToken })
      if (typeof data.valid !== 'boolean') {
        throw new ProviderError('The authentication provider returned an invalid validation result.')
      }
      if (!data.valid) return { valid: false }
      const expiresAt = Date.parse(data.expires_at)
      if (!Number.isFinite(expiresAt) || expiresAt <= now() ||
          (data.identity_id !== undefined && (typeof data.identity_id !== 'string' || !data.identity_id))) {
        throw new ProviderError('The authentication provider returned an invalid validation result.')
      }
      return { valid: true, expiresAt, identityId: data.identity_id }
    },
    async refresh(refreshToken) {
      return tokensFrom(await request('session/refresh', { refresh_token: refreshToken }), now)
    },
    async logout(accessToken) {
      await request('session/logout', { access_token: accessToken })
    },
  }
}
