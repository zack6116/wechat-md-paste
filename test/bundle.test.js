import assert from 'node:assert/strict';
import test from 'node:test';
import { describeBundle, folderFromEntries, omitLocalImages, relativeToMarkdown } from '../src/lib/bundle.js';

test('a lone markdown file does not bring a picture directory', () => {
  const described = describeBundle([{ name: 'post.md', relativePath: 'post.md' }]);
  assert.equal(described.mode, 'markdown');
  assert.equal(described.markdownPath, 'post.md');
});

test('a directory resolves images next to the markdown', async () => {
  const entries = [
    { name: 'post.md', relativePath: '文章目录/post.md' },
    { name: '01.png', relativePath: '文章目录/images/01.png', bytes: new Uint8Array([1, 2, 3]) },
    { name: 'notes.txt', relativePath: '文章目录/notes.txt' },
    { name: 'other.md', relativePath: '文章目录/drafts/other.md' },
  ];
  const described = describeBundle(entries);
  assert.equal(described.mode, 'directory');
  assert.equal(described.markdownPath, '文章目录/post.md');
  assert.equal(described.base, '文章目录');
  assert.equal(described.notice, '目录里有多篇 Markdown，这次导入 post.md。');
  assert.equal(relativeToMarkdown(described.base, '文章目录/images/01.png'), 'images/01.png');

  const folder = folderFromEntries(entries, described);
  assert.deepEqual(await folder.listRelativePaths(), ['images/01.png']);
  const file = await folder.readFile('images/01.png');
  assert.equal(file.name, '01.png');
  assert.equal(file.bytes.length, 3);
});

test('markdown beside loose image files is treated as one directory', () => {
  const described = describeBundle([
    { name: 'post.md', relativePath: 'post.md' },
    { name: '01.png', relativePath: '01.png' },
  ]);
  assert.equal(described.mode, 'directory');
  assert.equal(described.base, '');
});

test('markdown only drops local images and keeps remote ones', () => {
  const prepared = omitLocalImages({
    accepted: [
      { id: 'img-1', kind: 'local', src: 'images/01.png' },
      { id: 'img-2', kind: 'remote', src: 'https://cdn.example.com/a.png' },
    ],
    skipped: [],
    needsFolder: true,
    remoteOrigins: ['https://cdn.example.com/*'],
  });
  assert.equal(prepared.needsFolder, false);
  assert.equal(prepared.accepted.length, 1);
  assert.equal(prepared.accepted[0].kind, 'remote');
  assert.match(prepared.skipped[0].reason, /没有附带图片目录/);
});
