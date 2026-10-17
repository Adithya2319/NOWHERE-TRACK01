// Shared by the Node server and Vite configuration, never injected into client code.
function port(value, name, fallback) {
  const result = value == null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(result) || result < 1 || result > 65535) {
    throw new Error(`${name} must be an integer port from 1 to 65535.`);
  }
  return result;
}

export const devFrontendPort = (env = {}) => port(env.DEV_FRONTEND_PORT, 'DEV_FRONTEND_PORT', 5174);
export const apiPort = (env = {}) => port(env.PORT, 'PORT', 4000);

export function apiConnectionURL(env = {}) {
  const host = env.HOST || '127.0.0.1';
  const connectionHost = ['0.0.0.0', '::'].includes(host) ? '127.0.0.1' : host;
  return `http://${connectionHost.includes(':') ? `[${connectionHost}]` : connectionHost}:${apiPort(env)}`;
}

export function resolvePublicOrigins(env = {}, production = env.NODE_ENV === 'production') {
  const configured = env.PUBLIC_ORIGIN ? env.PUBLIC_ORIGIN.split(',').map(value => value.trim()) : [];
  if (production && !configured.length) throw new Error('Production needs an explicit HTTPS PUBLIC_ORIGIN.');
  const origins = configured.map(value => {
    let url;
    try { url = new URL(value); } catch { throw new Error('Invalid PUBLIC_ORIGIN: use a comma-separated list of HTTP(S) origins.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.hostname.includes('*')) {
      throw new Error('PUBLIC_ORIGIN entries must be HTTP(S) origins without credentials, paths or wildcards.');
    }
    if (production && url.protocol !== 'https:') throw new Error('Production needs an explicit HTTPS PUBLIC_ORIGIN.');
    return url.origin;
  });
  if (!production) {
    // Explicit local ports only. Never trust the incoming Host/Origin or arbitrary port ranges.
    for (const value of new Set([5173, 5174, devFrontendPort(env), apiPort(env)])) {
      for (const hostname of ['localhost', '127.0.0.1', ...(env.HOST === '::1' ? ['[::1]'] : [])]) origins.push(`http://${hostname}:${value}`);
    }
  }
  return [...new Set(origins)];
}
