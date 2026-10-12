import { createLicenseKey } from '../src/lib/license.js';

const args = process.argv.slice(2);
let days = 365;
let seats = 5;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--lifetime') days = 0;
  if (args[i] === '--days') days = Number(args[++i]);
  if (args[i] === '--seats') seats = Number(args[++i]);
}

if (!Number.isFinite(days) || days < 0) {
  console.error('用法: npm run license -- --days 365');
  console.error('      npm run license -- --lifetime');
  process.exit(1);
}
if (!Number.isInteger(seats) || seats < 1 || seats > 5) {
  console.error('席位需要是 1 到 5 的整数');
  process.exit(1);
}

const exp = days === 0 ? 0 : Math.floor(Date.now() / 1000) + days * 86400;
const key = await createLicenseKey({ exp, seats });
console.log(key);
