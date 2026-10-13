const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;
const MARKDOWN_EXT = /\.(md|markdown)$/i;

export const MARKDOWN_ONLY_IMAGE_REASON = '只上传了 Markdown，没有附带图片目录，已跳过本地图片';

export function normalizeRelative(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

export function describeBundle(entries) {
  const files = [];
  for (const entry of entries || []) {
    const relativePath = normalizeRelative(entry.relativePath || entry.name);
    if (!relativePath || isHidden(relativePath)) continue;
    files.push({ relativePath, name: entry.name || relativePath.split('/').pop() });
  }
  const markdowns = files.filter((entry) => MARKDOWN_EXT.test(entry.name));
  if (!markdowns.length) return { error: '这个目录里没有 Markdown 文件' };

  const hasTree = files.some((entry) => entry.relativePath.includes('/'));
  const hasSiblingImage = files.some((entry) => IMAGE_EXT.test(entry.name));
  if (!hasTree && !hasSiblingImage) {
    return { mode: 'markdown', markdownPath: markdowns[0].relativePath, base: '', notice: '' };
  }

  markdowns.sort((a, b) => depth(a.relativePath) - depth(b.relativePath) || a.relativePath.localeCompare(b.relativePath, 'zh'));
  const markdownPath = markdowns[0].relativePath;
  const filename = markdownPath.split('/').pop();
  return {
    mode: 'directory',
    markdownPath,
    base: parentPath(markdownPath),
    notice: markdowns.length > 1 ? `目录里有多篇 Markdown，这次导入 ${filename}。` : '',
  };
}

export function relativeToMarkdown(base, relativePath) {
  const path = normalizeRelative(relativePath);
  if (!base) return path;
  const prefix = `${base}/`;
  if (!path.startsWith(prefix)) return '';
  return path.slice(prefix.length);
}

export function folderFromEntries(entries, described) {
  const images = new Map();
  for (const entry of entries || []) {
    const rel = relativeToMarkdown(described?.base || '', entry.relativePath || entry.name);
    if (!rel || isHidden(rel) || !IMAGE_EXT.test(rel)) continue;
    images.set(rel, entry);
  }
  return {
    async listRelativePaths() {
      return [...images.keys()];
    },
    async readFile(rel) {
      const entry = images.get(rel);
      if (!entry) throw new Error(`在上传的目录里没有找到 ${rel}`);
      const bytes = entry.bytes ? new Uint8Array(entry.bytes) : new Uint8Array(await entry.file.arrayBuffer());
      return { name: entry.name || entry.file?.name || rel.split('/').pop(), bytes };
    },
  };
}

export function omitLocalImages(prepared) {
  const local = prepared.accepted.filter((item) => item.kind === 'local');
  return {
    ...prepared,
    accepted: prepared.accepted.filter((item) => item.kind !== 'local'),
    skipped: [...prepared.skipped, ...local.map((item) => ({ ...item, reason: MARKDOWN_ONLY_IMAGE_REASON }))],
    needsFolder: false,
  };
}

function parentPath(path) {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/');
}

function depth(path) {
  return path.split('/').length;
}

function isHidden(relativePath) {
  return relativePath.split('/').some((part) => !part || part.startsWith('.') || part === '__MACOSX');
}
