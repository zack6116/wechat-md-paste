const PRIVATE_HOSTS = new Set(['localhost', 'localhost.localdomain']);

export function isPrivateHostname(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || PRIVATE_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.local')) {
    return true;
  }
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  const mapped = host.startsWith('::ffff:') ? host.slice(7) : host;
  const v4 = ipv4ToInt(mapped);
  if (v4 == null) return false;
  return (
    inRange(v4, '0.0.0.0', '0.255.255.255') ||
    inRange(v4, '10.0.0.0', '10.255.255.255') ||
    inRange(v4, '127.0.0.0', '127.255.255.255') ||
    inRange(v4, '169.254.0.0', '169.254.255.255') ||
    inRange(v4, '172.16.0.0', '172.31.255.255') ||
    inRange(v4, '192.168.0.0', '192.168.255.255')
  );
}

export function inspectRemoteImageUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: '图片地址无法解析' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: '图片地址不能包含账号或密码' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: '只处理 http 或 https 图片' };
  }
  if (isPrivateHostname(url.hostname)) {
    return { ok: false, reason: '不会下载本机或内网图片' };
  }
  return { ok: true, url };
}

export function isWechatCdnUrl(raw) {
  try {
    const url = new URL(raw);
    return ['mmbiz.qpic.cn', 'mmbiz.qlogo.cn', 'res.wx.qq.com'].includes(url.hostname);
  } catch {
    return false;
  }
}

function ipv4ToInt(host) {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

function inRange(value, start, end) {
  return value >= ipv4ToInt(start) && value <= ipv4ToInt(end);
}
