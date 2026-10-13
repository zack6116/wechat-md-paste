import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const devLog = path.join(__dirname, '.last-live-import.txt');
const downloadsLog = path.join(process.env.HOME || '', 'Downloads/wechat-md-paste-last-import.txt');
const waitSec = Number(process.argv[2] || 120);
const deadline = Date.now() + waitSec * 1000;

function pass(text) {
  return (
    /已插入正文/.test(text) &&
    !/找不到正文编辑区/.test(text) &&
    !/编辑器没有响应/.test(text)
  );
}

async function readIfPass(file) {
  try {
    const text = await fs.readFile(file, 'utf8');
    if (!pass(text)) return null;
    return { file, tail: text.trim().split('\n').slice(-10) };
  } catch {
    return null;
  }
}

while (Date.now() < deadline) {
  for (const file of [devLog, downloadsLog]) {
    const hit = await readIfPass(file);
    if (hit) {
      console.log(JSON.stringify({ ok: true, ...hit }, null, 2));
      process.exit(0);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

console.log(JSON.stringify({ ok: false, waitedSec: waitSec }, null, 2));
process.exit(1);
