export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function parseDataImage(src) {
  const matched = String(src).match(/^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([a-z0-9+/=\r\n]+)$/i);
  if (!matched) return null;
  const mime = matched[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : matched[1].toLowerCase();
  const bytes = base64ToBytes(matched[2].replace(/\s/g, ''));
  return { mime, bytes };
}
