const DEMO_PASSWORD = 'Campus360@123';

const MOCK_USER = {
  id: 'student-001',
  name: 'Aarav Shah',
  phone: '+91 98765 43210',
  college: 'VESIT',
  className: 'FE',
  division: 'A',
  department: 'Electronics and Telecommunication Engineering',
};

const baseUrl = import.meta.env.VITE_MINIMOTH_BASE_URL || 'https://api.minimoth.dev';

function readSession() {
  try {
    return JSON.parse(localStorage.getItem('campus360-session') || 'null');
  } catch { return null; }
}

function writeSession(session) {
  localStorage.setItem('campus360-session', JSON.stringify(session));
}

export async function sendOtp(phone) {
  if (!phone || !/^\+?[0-9\s-]{8,15}$/.test(phone)) {
    throw new Error('Valid phone number required.');
  }

  if (import.meta.env.DEV || !navigator.onLine) {
    return {
      ok: true,
      mock: true,
      message: 'Mock OTP sent to ' + phone + '. Use 123456 in demo mode.',
    };
  }

  const response = await fetch(`${baseUrl}/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });

  if (!response.ok) {
    throw new Error('MiniMoth OTP service unavailable.');
  }

  return response.json();
}

export function getDemoPassword() {
  return DEMO_PASSWORD;
}

export async function loginWithPassword(phone, password) {
  if (!phone || !password) {
    throw new Error('Phone and password are required.');
  }

  const normalizedPhone = phone.replace(/\s+/g, '').trim();
  const isDemoUser = normalizedPhone === '+919876543210' || normalizedPhone === '9876543210';
  if (!isDemoUser || password !== DEMO_PASSWORD) {
    throw new Error('Invalid phone or password.');
  }

  const session = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    user: MOCK_USER,
    expiresAt: Date.now() + 1000 * 60 * 60 * 6,
  };
  writeSession(session);
  return { ok: true, mock: true, session };
}

export async function verifyOtp(phone, otp) {
  if (import.meta.env.DEV || !navigator.onLine || otp === '123456') {
    const session = {
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      user: MOCK_USER,
      expiresAt: Date.now() + 1000 * 60 * 60 * 6,
    };
    writeSession(session);
    return { ok: true, mock: true, session };
  }

  const response = await fetch(`${baseUrl}/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, otp }),
  });

  if (!response.ok) {
    throw new Error('OTP verification failed.');
  }

  const payload = await response.json();
  if (payload.session) {
    writeSession(payload.session);
  }
  return payload;
}

export async function validateSession() {
  const session = readSession();
  if (!session) return { valid: false, mock: true };

  if (session.expiresAt && Date.now() > session.expiresAt) {
    return { valid: false, mock: true, expired: true };
  }

  return { valid: true, mock: true, session };
}

export async function refreshToken() {
  const session = readSession();
  if (!session) {
    return { ok: false, reason: 'No active session.' };
  }

  const refreshed = {
    ...session,
    accessToken: 'mock-access-token-refreshed',
    expiresAt: Date.now() + 1000 * 60 * 60 * 6,
  };
  writeSession(refreshed);
  return { ok: true, mock: true, session: refreshed };
}

export function logout() {
  localStorage.removeItem('campus360-session');
  return true;
}
