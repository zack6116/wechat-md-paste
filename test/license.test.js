import assert from 'node:assert/strict';
import test from 'node:test';
import { createLicenseKey, verifyLicenseKey } from '../src/lib/license.js';

test('round-trips a license and rejects tampering or expiry', async () => {
  const key = await createLicenseKey({ exp: 0, seats: 5 });
  const ok = await verifyLicenseKey(key);
  assert.equal(ok.valid, true);
  assert.equal(ok.payload.seats, 5);

  const broken = await verifyLicenseKey(`${key.slice(0, -2)}aa`);
  assert.equal(broken.valid, false);

  const expiring = await createLicenseKey({ exp: 100, seats: 1 });
  const expired = await verifyLicenseKey(expiring, 101 * 1000);
  assert.equal(expired.reason, 'expired');
  const still = await verifyLicenseKey(expiring, 50 * 1000);
  assert.equal(still.valid, true);
});
