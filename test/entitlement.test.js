import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveEntitlement, formatPlan } from '../src/lib/entitlement.js';
import { TRIAL_MS } from '../src/lib/constants.js';

const verify = async (key, now) => {
  if (key === 'good') return { valid: true, payload: { exp: 0, seats: 5, plan: 'pro', v: 1 } };
  if (key === 'expired') return { valid: false, reason: 'expired', payload: { exp: 1 } };
  return { valid: false, reason: 'signature' };
};

test('fresh install is a 14 day trial', async () => {
  const now = Date.parse('2026-10-12T00:00:00Z');
  const entitlement = await resolveEntitlement({ now, trialStartedAt: now, licenseKey: '' }, verify);
  assert.equal(entitlement.plan, 'trial');
  assert.equal(entitlement.allowLocalFolder, true);
  assert.equal(entitlement.showFooter, false);
  assert.equal(entitlement.daysLeft, 14);
  assert.match(formatPlan(entitlement), /试用中/);
});

test('trial ends and a valid key becomes pro', async () => {
  const now = Date.parse('2026-10-12T00:00:00Z');
  const expired = await resolveEntitlement({ now, trialStartedAt: now - TRIAL_MS - 1, licenseKey: '' }, verify);
  assert.equal(expired.plan, 'free');
  assert.equal(expired.imageLimit, 3);
  const pro = await resolveEntitlement({ now, trialStartedAt: now - TRIAL_MS, licenseKey: 'good' }, verify);
  assert.equal(pro.plan, 'pro');
  assert.match(formatPlan(pro), /长期有效/);
});
