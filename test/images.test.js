import assert from 'node:assert/strict';
import test from 'node:test';
import { indexRelativePaths, matchLocalPath, sniffImageMime } from '../src/lib/images.js';
import { localLookupError, resolveImages } from '../src/lib/resolve-images.js';
import { inspectRemoteImageUrl } from '../src/lib/urls.js';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test('matches relative image paths and reports ambiguous names', () => {
  const index = indexRelativePaths(['photos/cover.png', 'archive/cover.png', 'only/hero.jpg']);
  assert.equal(matchLocalPath('./photos/cover.png', index).path, 'photos/cover.png');
  assert.equal(matchLocalPath('hero.jpg', index).path, 'only/hero.jpg');
  assert.equal(matchLocalPath('cover.png', index).ambiguous, true);
  assert.equal(matchLocalPath('missing.png', index).missing, true);
});

test('names the missing local image instead of asking for another grant', () => {
  const index = indexRelativePaths(['images/01.png']);
  assert.equal(localLookupError('images/01.png', index), null);
  assert.match(localLookupError('images/02.png', index), /02\.png/);
  assert.match(localLookupError('images/02.png', indexRelativePaths([])), /没有图片文件/);
});

test('rejects private and credentialed image urls', () => {
  assert.equal(inspectRemoteImageUrl('https://cdn.example.com/a.png').ok, true);
  assert.equal(inspectRemoteImageUrl('http://127.0.0.1/a.png').ok, false);
  assert.equal(inspectRemoteImageUrl('https://10.0.0.8/a.png').ok, false);
  assert.equal(inspectRemoteImageUrl('https://user:pass@cdn.example.com/a.png').ok, false);
  assert.equal(sniffImageMime(png), 'image/png');
});

test('uploads a remote image and records a wechat cdn url as-is', async () => {
  const { results, warnings } = await resolveImages(
    [
      { id: 'img-1', kind: 'remote', src: 'https://cdn.example.com/a.png', alt: '' },
      { id: 'img-2', kind: 'wechat', src: 'https://mmbiz.qpic.cn/already.jpg', alt: '' },
    ],
    {
      fetchRemote: async () => ({ bytes: png, mime: 'image/png' }),
      upload: async ({ filename, mime }) => {
        assert.equal(mime, 'image/png');
        assert.match(filename, /\.png$/);
        return 'https://mmbiz.qpic.cn/uploaded.jpg';
      },
      readLocal: async () => {
        throw new Error('should not read local');
      },
    },
  );
  assert.equal(results['img-1'].url, 'https://mmbiz.qpic.cn/uploaded.jpg');
  assert.equal(results['img-2'].url, 'https://mmbiz.qpic.cn/already.jpg');
  assert.deepEqual(warnings, []);
});
