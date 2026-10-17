import test from 'node:test'
import assert from 'node:assert/strict'
import { devFrontendPort, apiPort, apiConnectionURL, resolvePublicOrigins } from '../shared/origins.js'
import { readConfig } from './config.js'
import { createApp } from './app.js'
import { openDatabase, seedDatabase } from './db.js'

const development = { NODE_ENV: 'development', AUTH_MODE: 'demo' }
const localOrigins = (ports) => ports.flatMap((port) => [`http://localhost:${port}`, `http://127.0.0.1:${port}`])

async function fixture(t, env = development) {
  const db = openDatabase(':memory:')
  seedDatabase(db, '2026-10-16')
  const config = readConfig(env)
  const servers = []
  t.after(async () => {
    for (const server of servers) {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
    db.close()
  })
  const start = async () => {
    const app = createApp(db, config)
    const server = await new Promise((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
    })
    servers.push(server)
    const address = `http://127.0.0.1:${server.address().port}`
    return async (path, { method = 'GET', body, origin, cookie } = {}) => {
      const response = await fetch(`${address}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(origin !== undefined ? { Origin: origin } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
      return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') }
    }
  }
  return { db, start, request: await start() }
}

test('development origins include both loopback names on the current and prior Vite ports', () => {
  assert.equal(devFrontendPort(), 5174)
  assert.equal(apiPort(), 4000)
  assert.deepEqual(new Set(resolvePublicOrigins(development)), new Set(localOrigins([5173, 5174, 4000])))
})

test('explicit development and API ports merge with configured origins and existing local defaults', () => {
  const env = { ...development, DEV_FRONTEND_PORT: '5201', PORT: '4101', PUBLIC_ORIGIN: 'https://campus.example,http://localhost:5173' }
  assert.equal(devFrontendPort(env), 5201)
  assert.equal(apiPort(env), 4101)
  const origins = resolvePublicOrigins(env)
  for (const origin of [...localOrigins([5173, 5174, 5201, 4101]), 'https://campus.example']) {
    assert.ok(origins.includes(origin), `Missing allowed origin: ${origin}`)
  }
  assert.equal(origins.length, new Set(origins).size)
})

test('a copied older PUBLIC_ORIGIN setting does not exclude the actual development port', () => {
  const env = { ...development, PUBLIC_ORIGIN: localOrigins([5173, 4000]).join(',') }
  const config = readConfig(env)
  for (const origin of localOrigins([5174])) assert.ok(config.publicOrigin.split(',').includes(origin))
})

test('configured ports must be valid TCP port numbers', () => {
  for (const invalid of ['0', '-1', '65536', 'invalid', '5174x', '5174.5']) {
    assert.throws(() => devFrontendPort({ DEV_FRONTEND_PORT: invalid }), `DEV_FRONTEND_PORT accepted ${invalid}`)
    assert.throws(() => apiPort({ PORT: invalid }), `PORT accepted ${invalid}`)
  }
})

test('the development API proxy matches explicit IPv4, localhost and IPv6 bindings', () => {
  assert.equal(apiConnectionURL(), 'http://127.0.0.1:4000')
  assert.equal(apiConnectionURL({ HOST: 'localhost', PORT: '4101' }), 'http://localhost:4101')
  assert.equal(apiConnectionURL({ HOST: '::1', PORT: '4101' }), 'http://[::1]:4101')
  for (const HOST of ['0.0.0.0', '::']) assert.equal(apiConnectionURL({ HOST }), 'http://127.0.0.1:4000')
  assert.ok(resolvePublicOrigins({ ...development, HOST: '::1', DEV_FRONTEND_PORT: '5201' }).includes('http://[::1]:5201'))
  assert.deepEqual(resolvePublicOrigins({ NODE_ENV: 'production', HOST: '::1', PUBLIC_ORIGIN: 'https://campus.example' }), ['https://campus.example'])
})

test('configured origin values reject wildcards, paths, credentials and non-HTTP schemes', () => {
  for (const invalid of ['*', 'null', 'https://*.example.com', 'http://localhost:5174/login', 'https://user:password@campus.example', 'https://campus.example?query=1', 'https://campus.example#fragment', 'file:///campus', 'not-an-origin']) {
    assert.throws(() => resolvePublicOrigins({ ...development, PUBLIC_ORIGIN: invalid }), `Accepted invalid PUBLIC_ORIGIN: ${invalid}`)
  }
})

test('production accepts only explicit HTTPS origins and never adds development loopback origins', () => {
  const env = { NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://campus.example,https://other.example:8443', DEV_FRONTEND_PORT: '5201', PORT: '4101' }
  assert.deepEqual(resolvePublicOrigins(env), ['https://campus.example', 'https://other.example:8443'])
  const config = readConfig(env)
  assert.equal(config.authMode, 'provider')
  assert.equal(config.cookieSecure, true)
  assert.equal(config.publicOrigin, env.PUBLIC_ORIGIN)
  for (const invalid of [undefined, '', 'http://localhost:5174', 'http://campus.example', 'https://campus.example/login', 'https://user@campus.example', '*']) {
    assert.throws(() => readConfig({ ...env, PUBLIC_ORIGIN: invalid }), `Accepted invalid production PUBLIC_ORIGIN: ${invalid}`)
  }
})

test('production keeps the explicit demo-login and secure-cookie safeguards', () => {
  const env = { NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://campus.example' }
  assert.throws(() => readConfig({ ...env, AUTH_MODE: 'demo' }), /ALLOW_DEMO/)
  assert.throws(() => readConfig({ ...env, COOKIE_SECURE: 'false' }), /COOKIE_SECURE/)
  assert.equal(readConfig({ ...env, AUTH_MODE: 'demo', ALLOW_DEMO: 'true' }).cookieSecure, true)
})

test('demo login works on both local names at 5174 and other explicitly approved development ports', async (t) => {
  const env = { ...development, DEV_FRONTEND_PORT: '5201', PORT: '4101' }
  const f = await fixture(t, env)
  assert.equal((await f.request('/api/me')).status, 401)
  for (const origin of localOrigins([5173, 5174, 5201, 4101])) {
    const login = await f.request('/api/auth/demo', { method: 'POST', origin, body: { userId: 'student-a' } })
    assert.equal(login.status, 200, `${origin}: ${JSON.stringify(login.data)}`)
    assert.match(login.cookie, /HttpOnly; SameSite=Lax/)
    assert.doesNotMatch(login.cookie, /; Secure/)
    const cookie = login.cookie.split(';')[0]
    const me = await f.request('/api/me', { cookie })
    assert.equal(me.status, 200)
    assert.equal(me.data.user.id, 'student-a')
  }
})

test('missing, null, foreign and near-match origins cannot create sessions', async (t) => {
  const f = await fixture(t)
  for (const origin of [undefined, 'null', 'https://attacker.example', 'http://localhost:5175', 'http://127.0.0.1:5175', 'http://localhost.attacker.example:5174', 'http://127.0.0.1.attacker.example:5174', 'https://127.0.0.1:5174', 'http://127.0.0.1:5174/login']) {
    const login = await f.request('/api/auth/demo', { method: 'POST', origin, body: { userId: 'student-a' } })
    assert.equal(login.status, 403, `Origin ${origin} bypassed validation`)
    assert.match(login.data.error, /Origin not allowed/)
    assert.equal(login.cookie, null)
    assert.equal(f.db.prepare('SELECT COUNT(*) count FROM sessions').get().count, 0)
  }
})

test('origin protection still applies to authenticated mutations and does not revoke a valid session', async (t) => {
  const f = await fixture(t)
  const login = await f.request('/api/auth/demo', { method: 'POST', origin: 'http://127.0.0.1:5174', body: { userId: 'student-a' } })
  const cookie = login.cookie.split(';')[0]
  for (const origin of [undefined, 'null', 'https://attacker.example']) {
    assert.equal((await f.request('/api/auth/logout', { method: 'POST', origin, cookie, body: {} })).status, 403)
    assert.equal((await f.request('/api/me', { cookie })).status, 200)
  }
  assert.equal((await f.request('/api/auth/logout', { method: 'POST', origin: 'http://127.0.0.1:5174', cookie, body: {} })).status, 200)
  assert.equal((await f.request('/api/me', { cookie })).status, 401)
})

test('the demo session survives a fresh app instance using the same database', async (t) => {
  const f = await fixture(t)
  const login = await f.request('/api/auth/demo', { method: 'POST', origin: 'http://127.0.0.1:5174', body: { userId: 'student-a' } })
  const cookie = login.cookie.split(';')[0]
  const newAppRequest = await f.start()
  const me = await newAppRequest('/api/me', { cookie })
  assert.equal(me.status, 200)
  assert.equal(me.data.user.id, 'student-a')
  assert.equal((await newAppRequest('/api/me')).status, 401)
})

test('production rejects local origins before login and keeps demo authentication disabled', async (t) => {
  const f = await fixture(t, { NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://campus.example', DEV_FRONTEND_PORT: '5201' })
  for (const origin of localOrigins([5173, 5174, 5201, 4000])) {
    assert.equal((await f.request('/api/auth/demo', { method: 'POST', origin, body: { userId: 'student-a' } })).status, 403)
  }
  assert.equal((await f.request('/api/auth/demo', { method: 'POST', origin: 'https://campus.example', body: { userId: 'student-a' } })).status, 404)
  assert.equal(f.db.prepare('SELECT COUNT(*) count FROM sessions').get().count, 0)
})
