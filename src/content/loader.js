(function loadWechatMdPaste() {
  let version = '';
  try {
    version = chrome.runtime.getManifest().version;
  } catch {
    return;
  }
  if (globalThis.__WMP_BOOT_VERSION === version) return;
  globalThis.__WMP_BOOT_VERSION = version;
  document.getElementById('wmp-panel')?.remove();
  import(chrome.runtime.getURL('src/content/bridge.js')).catch((error) => {
    globalThis.__WMP_BOOT_VERSION = '';
    console.error('[公众号 MD Paste] 启动失败', error);
  });
})();
