import { FREE_IMAGE_LIMIT, TRIAL_MS } from './constants.js';

export async function resolveEntitlement({ now = Date.now(), trialStartedAt = 0, licenseKey = '' }, verify) {
  const license = licenseKey ? await verify(licenseKey, now) : { valid: false, reason: 'empty' };
  if (license.valid) {
    return {
      plan: 'pro',
      imageLimit: Infinity,
      allowLocalFolder: true,
      showFooter: false,
      license,
    };
  }
  if (trialStartedAt && now < trialStartedAt + TRIAL_MS) {
    const left = trialStartedAt + TRIAL_MS - now;
    return {
      plan: 'trial',
      imageLimit: Infinity,
      allowLocalFolder: true,
      showFooter: false,
      trialEndsAt: trialStartedAt + TRIAL_MS,
      daysLeft: Math.max(1, Math.ceil(left / 86400000)),
      license,
    };
  }
  return {
    plan: 'free',
    imageLimit: FREE_IMAGE_LIMIT,
    allowLocalFolder: false,
    showFooter: true,
    license,
  };
}

export function formatPlan(entitlement) {
  if (entitlement.plan === 'pro') {
    const exp = entitlement.license?.payload?.exp;
    const seats = entitlement.license?.payload?.seats || 5;
    const when = exp ? `有效期至 ${formatDate(exp * 1000)}` : '长期有效';
    return `Pro · ${when} · 标注 ${seats} 台设备`;
  }
  if (entitlement.plan === 'trial') {
    return `试用中 · 剩余 ${entitlement.daysLeft} 天`;
  }
  return '免费版 · 每篇最多 3 张图片';
}

function formatDate(ms) {
  const date = new Date(ms);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
