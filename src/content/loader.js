(function loadWechatMdPaste() {
  if (globalThis.__WMP_LOADED) return;
  globalThis.__WMP_LOADED = true;
  import(chrome.runtime.getURL('src/content/bridge.js')).catch((error) => {
    console.error('[公众号 MD Paste] 启动失败', error);
  });
})();
