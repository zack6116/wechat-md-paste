import { formatPlan, resolveEntitlement } from '../lib/entitlement.js';
import { verifyLicenseKey } from '../lib/license.js';

const plan = document.querySelector('#plan');
const data = await chrome.storage.local.get(['trialStartedAt', 'licenseKey']);
if (!data.trialStartedAt) {
  data.trialStartedAt = Date.now();
  await chrome.storage.local.set({ trialStartedAt: data.trialStartedAt });
}
plan.textContent = formatPlan(await resolveEntitlement(data, verifyLicenseKey));
document.querySelector('#options').addEventListener('click', () => chrome.runtime.openOptionsPage());
