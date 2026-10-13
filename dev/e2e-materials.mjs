import fs from 'node:fs/promises';
import path from 'node:path';
import { describeBundle, folderFromEntries } from '../src/lib/bundle.js';
import { prepareImport, buildArticle } from '../src/lib/article.js';
import { indexRelativePaths, matchLocalPath } from '../src/lib/images.js';
import { localLookupError, resolveImages } from '../src/lib/resolve-images.js';

const root = process.argv[2] || '/Users/zack/Downloads/wechat-materials-20261013';

async function walk(dir, prefix = '') {
  const entries = [];
  for (const name of await fs.readdir(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const stat = await fs.stat(full);
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (stat.isDirectory()) entries.push(...(await walk(full, relativePath)));
    else {
      const bytes = await fs.readFile(full);
      entries.push({ name, relativePath, bytes: new Uint8Array(bytes) });
    }
  }
  return entries;
}

const pro = { imageLimit: Infinity, allowLocalFolder: true, showFooter: false };
const diskEntries = await walk(root);
const described = describeBundle(diskEntries.map((e) => ({ name: e.name, relativePath: e.relativePath })));
if (described.error) throw new Error(described.error);
const markdown = diskEntries.find((e) => e.relativePath === described.markdownPath);
const text = new TextDecoder().decode(markdown.bytes);
const folder = described.mode === 'directory' ? folderFromEntries(diskEntries, described) : null;
const prepared = prepareImport(text, pro);
const pathIndex = folder ? indexRelativePaths(await folder.listRelativePaths()) : null;

const uploads = [];
const resolved = await resolveImages(prepared.accepted, {
  readLocal: async (src) => {
    const error = localLookupError(src, pathIndex, '上传的目录');
    if (error) throw new Error(error);
    return folder.readFile(matchLocalPath(src, pathIndex).path);
  },
  fetchRemote: async () => {
    throw new Error('unexpected remote');
  },
  upload: async ({ filename, mime }) => {
    uploads.push({ filename, mime });
    return `https://mmbiz.qpic.cn/mock/${encodeURIComponent(filename)}`;
  },
});

const article = buildArticle(prepared, resolved.results);
const errors = Object.values(resolved.results).filter((r) => r.error);
const htmlBytes = article.html.length;

console.log(
  JSON.stringify(
    {
      root,
      mode: described.mode,
      markdown: described.markdownPath,
      accepted: prepared.accepted.length,
      skipped: prepared.skipped.length,
      imagePaths: pathIndex ? [...pathIndex.byPath.keys()] : [],
      uploads: uploads.length,
      errors: errors.map((e) => e.error),
      htmlBytes,
      title: article.title?.slice(0, 40),
      coverUrl: article.coverUrl?.slice(0, 60),
      imgTags: (article.html.match(/<img /g) || []).length,
    },
    null,
    2,
  ),
);

if (errors.length) process.exit(1);
