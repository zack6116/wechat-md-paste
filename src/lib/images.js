import { inspectRemoteImageUrl, isWechatCdnUrl } from './urls.js';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;

export function classifyImageSrc(src) {
  const value = String(src || '').trim();
  if (!value) return { kind: 'empty' };
  if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(value)) return { kind: 'data' };
  if (/^(javascript|vbscript|file):/i.test(value)) return { kind: 'blocked' };
  if (/^https?:\/\//i.test(value)) {
    if (isWechatCdnUrl(value)) return { kind: 'wechat' };
    const remote = inspectRemoteImageUrl(value);
    if (!remote.ok) return { kind: 'blocked', reason: remote.reason };
    return { kind: 'remote' };
  }
  if (/^[a-z]+:/i.test(value)) return { kind: 'blocked' };
  return { kind: 'local' };
}

export function selectImages({ bodyImages, coverSrc, entitlement }) {
  const items = [];
  const cover = String(coverSrc || '').trim();
  if (cover && !bodyImages.some((image) => image.src === cover)) {
    items.push({ id: 'cover', role: 'cover', src: cover, alt: '' });
  }
  for (const image of bodyImages) items.push(image);

  const accepted = [];
  const skipped = [];
  for (const item of items) {
    const classified = classifyImageSrc(item.src);
    if (classified.kind === 'empty' || classified.kind === 'blocked') {
      skipped.push({ ...item, reason: classified.reason || '不支持的图片地址' });
      continue;
    }
    if (classified.kind === 'local' && !entitlement.allowLocalFolder) {
      skipped.push({ ...item, reason: '免费版不支持本地图片，试用或 Pro 可以把图片和 Markdown 放在同一目录里上传' });
      continue;
    }
    if (accepted.length >= entitlement.imageLimit) {
      skipped.push({ ...item, reason: '免费版每篇最多 3 张图片' });
      continue;
    }
    accepted.push({ ...item, kind: classified.kind });
  }

  const remoteOrigins = [];
  for (const item of accepted) {
    if (item.kind !== 'remote') continue;
    const origin = `${new URL(item.src).origin}/*`;
    if (!remoteOrigins.includes(origin)) remoteOrigins.push(origin);
  }

  return {
    accepted,
    skipped,
    needsFolder: accepted.some((item) => item.kind === 'local'),
    remoteOrigins,
  };
}

export function normalizePath(src) {
  let path = String(src || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the raw path when it is not valid percent-encoding.
  }
  return path.toLowerCase();
}

export function indexRelativePaths(paths) {
  const byPath = new Map();
  const byName = new Map();
  for (const raw of paths) {
    const norm = normalizePath(raw);
    if (!norm || !IMAGE_EXT.test(norm)) continue;
    byPath.set(norm, raw);
    const base = norm.split('/').pop();
    const list = byName.get(base) || [];
    list.push(raw);
    byName.set(base, list);
  }
  return { byPath, byName };
}

export function matchLocalPath(src, index) {
  const norm = normalizePath(src);
  if (index.byPath.has(norm)) return { path: index.byPath.get(norm) };
  const suffix = [];
  for (const [path, original] of index.byPath) {
    if (path.endsWith(`/${norm}`)) suffix.push(original);
  }
  if (suffix.length === 1) return { path: suffix[0] };
  if (suffix.length > 1) return { ambiguous: true };
  const base = norm.split('/').pop();
  const names = index.byName.get(base) || [];
  if (names.length === 1) return { path: names[0] };
  if (names.length > 1) return { ambiguous: true };
  return { missing: true };
}

export function sniffImageMime(bytes) {
  if (!bytes || bytes.length < 12) return '';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return '';
}

export function extensionForMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export function filenameForImage(src, mime) {
  const clean = String(src || '').split('?')[0].split('#')[0];
  const base = decodeSafe(clean.split('/').pop() || '');
  if (IMAGE_EXT.test(base)) return base.slice(-80);
  return `image.${extensionForMime(mime)}`;
}

function decodeSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
