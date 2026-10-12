import { loadDirectoryHandle, saveDirectoryHandle } from './folder-store.js';

const mode = new URLSearchParams(location.search).get('mode');
const button = document.querySelector('#pick');
const error = document.querySelector('#error');
let finished = false;

if (mode === 'regrant') {
  document.querySelector('#lead').textContent = '需要再确认一次图片文件夹的读取权限。';
  button.textContent = '允许读取';
}

button.addEventListener('click', async () => {
  button.disabled = true;
  error.textContent = '';
  try {
    let handle = await loadDirectoryHandle();
    if (mode === 'regrant' && handle) {
      const permission = await handle.requestPermission({ mode: 'read' });
      if (permission !== 'granted') throw new Error('没有获得文件夹读取权限');
    } else {
      handle = await showDirectoryPicker({ mode: 'read', id: 'wechat-md-paste-images' });
      await saveDirectoryHandle(handle);
    }
    finished = true;
    await chrome.runtime.sendMessage({ type: 'folder-ready', ok: true });
    window.close();
  } catch (caught) {
    button.disabled = false;
    if (caught?.name === 'AbortError') return;
    error.textContent = caught instanceof Error ? caught.message : '选择文件夹失败';
  }
});

window.addEventListener('pagehide', () => {
  if (finished) return;
  chrome.runtime.sendMessage({ type: 'folder-ready', ok: false });
});
