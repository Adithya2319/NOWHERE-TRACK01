/** Generate record IDs without requiring the secure-context-only randomUUID API. */
export function generateUUID() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === 'function') {
    // getRandomValues also works when serving Vite over HTTP on a LAN.
    cryptoApi.getRandomValues(bytes);
  } else if (import.meta.env.DEV) {
    // Development-only fallback for local record IDs, never secrets or tokens.
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  } else {
    throw new Error('Secure record ID generation is unavailable. Use a browser with Web Crypto support.');
  }

  // UUID v4 version and RFC variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}
