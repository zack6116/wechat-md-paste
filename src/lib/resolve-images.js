import { HARD_IMAGE_BYTES, SOFT_IMAGE_BYTES } from './constants.js';
import { parseDataImage } from './bytes.js';
import { filenameForImage, matchLocalPath, sniffImageMime } from './images.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export async function resolveImages(accepted, { readLocal, fetchRemote, upload, onProgress }) {
  const results = {};
  const warnings = [];
  for (let index = 0; index < accepted.length; index += 1) {
    const item = accepted[index];
    onProgress?.({ index, total: accepted.length, item });
    try {
      results[item.id] = { url: await resolveOne(item, { readLocal, fetchRemote, upload, warnings }) };
    } catch (error) {
      results[item.id] = { error: error instanceof Error ? error.message : '图片处理失败' };
    }
  }
  return { results, warnings };
}

async function resolveOne(item, { readLocal, fetchRemote, upload, warnings }) {
  if (item.kind === 'wechat') return item.src;

  let bytes;
  let filename;
  if (item.kind === 'data') {
    const parsed = parseDataImage(item.src);
    if (!parsed) throw new Error('图片数据无法解析');
    bytes = parsed.bytes;
    filename = filenameForImage(item.alt || 'image', sniffImageMime(bytes) || parsed.mime);
  } else if (item.kind === 'remote') {
    const downloaded = await fetchRemote(item.src);
    bytes = downloaded.bytes;
    filename = filenameForImage(item.src, sniffImageMime(bytes) || downloaded.mime);
  } else {
    const file = await readLocal(item.src);
    bytes = file.bytes;
    filename = filenameForImage(file.name || item.src, sniffImageMime(bytes) || '');
  }

  const mime = sniffImageMime(bytes);
  if (!ALLOWED_MIME.has(mime)) throw new Error('只支持 JPG、PNG、GIF、WebP');
  if (bytes.length > HARD_IMAGE_BYTES) throw new Error('图片超过 8MB，已跳过');
  if (bytes.length > SOFT_IMAGE_BYTES) warnings.push(`${filename} 大于 1MB，公众号可能会压缩或拒绝`);
  const url = await upload({ bytes, mime, filename });
  if (!/^https?:\/\//i.test(url || '')) throw new Error('上传后没有返回可用的图片地址');
  return url;
}

export function localLookupError(src, index, place = '已授权的文件夹') {
  const matched = matchLocalPath(src, index);
  if (matched.path) return null;
  const name = String(src || '').trim().split(/[\\/]/).pop() || '这张图片';
  if (matched.ambiguous) return `找到多个同名图片（${name}），请在 Markdown 里写成相对路径`;
  if (!index.byPath.size) return `${place}里没有图片文件，找不到 ${name}`;
  return `在${place}里没有找到 ${name}`;
}
