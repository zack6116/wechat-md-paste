// 本地校验用的密钥。扩展包里能看到它，所以这只是前期防手误，不能当作防破解。
// 服务端校验计划中。生成 Key：npm run license -- --days 365
const LICENSE_SECRET = new Uint8Array([
  87, 33, 223, 139, 233, 212, 132, 107, 37, 220, 119, 3, 200, 133, 120, 161, 190, 189, 172, 120,
  99, 137, 202, 121, 0, 11, 36, 39, 14, 84, 45, 83,
]);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function createLicenseKey({ exp = 0, seats = 5, id = '' }) {
  const payload = {
    v: 1,
    plan: 'pro',
    exp: Number(exp) || 0,
    seats: Number(seats) || 5,
    id: id || randomId(),
  };
  const data = encoder.encode(JSON.stringify(payload));
  const sig = await hmac(data);
  return `WMP1.${toBase64Url(data)}.${toBase64Url(sig)}`;
}

export async function verifyLicenseKey(key, now = Date.now()) {
  const trimmed = String(key || '').trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3 || parts[0] !== 'WMP1') {
    return { valid: false, reason: 'format' };
  }
  let data;
  let sig;
  try {
    data = fromBase64Url(parts[1]);
    sig = fromBase64Url(parts[2]);
  } catch {
    return { valid: false, reason: 'format' };
  }
  const expected = await hmac(data);
  if (!timingSafeEqual(expected, sig)) {
    return { valid: false, reason: 'signature' };
  }
  let payload;
  try {
    payload = JSON.parse(decoder.decode(data));
  } catch {
    return { valid: false, reason: 'payload' };
  }
  if (payload?.v !== 1 || payload?.plan !== 'pro') {
    return { valid: false, reason: 'payload' };
  }
  if (payload.exp && now / 1000 > payload.exp) {
    return { valid: false, reason: 'expired', payload };
  }
  return { valid: true, payload };
}

export function licenseFailureText(reason) {
  if (reason === 'expired') return '这个 License Key 已过期';
  if (reason === 'signature' || reason === 'payload' || reason === 'format') {
    return 'License Key 无效';
  }
  return '请输入 License Key';
}

async function hmac(data) {
  const key = await crypto.subtle.importKey(
    'raw',
    LICENSE_SECRET,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function randomId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
