// 公众号编辑器改版时，优先改本文件里的选择器。适配版本：2026-10-12
// 正文写入顺序：官方 __MP_Editor_JSAPI__，旧编辑器再退回正文节点。
// 不点击发表、群发或保存。封面只走官方接口。
(function initWechatMdPasteMain() {
  if (window.__WMP_MAIN__) return;
  window.__WMP_MAIN__ = true;

  const SOURCE = 'wechat-md-paste';
  const ADAPTER_VERSION = '2026-10-12';
  const TITLE_SELECTORS = [
    '#title',
    '#js_appmsg_title',
    'textarea#js_title',
    'textarea[name="title"]',
    '.js_title_input textarea',
    '#js_title_main textarea',
  ];
  const EDITABLE_SELECTORS = [
    '.ProseMirror',
    '#ueditor_0',
    '#js_editor_area [contenteditable="true"]',
    '.rich_media_content',
  ];

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE || data.direction === 'response' || !data.id || !data.type) return;
    handle(data);
  });

  async function handle(data) {
    try {
      let payload;
      if (data.type === 'ping') payload = ping();
      else if (data.type === 'upload-image') payload = await uploadImage(data.payload || {});
      else if (data.type === 'insert-html') payload = await insertHtml(data.payload?.html);
      else if (data.type === 'set-title') payload = setTitle(data.payload?.title);
      else if (data.type === 'set-cover') payload = await setCover(data.payload?.url);
      else return;
      reply(data.id, { ok: true, payload });
    } catch (error) {
      reply(data.id, { ok: false, error: error instanceof Error ? error.message : '编辑器操作失败' });
    }
  }

  function ping() {
    return {
      adapter: ADAPTER_VERSION,
      hasApi: !!window.__MP_Editor_JSAPI__,
      isEditor:
        !!window.__MP_Editor_JSAPI__ ||
        !!document.querySelector('.ProseMirror, #ueditor_0, #js_appmsg_title, textarea#title'),
    };
  }

  async function insertHtml(html) {
    if (!html) throw new Error('没有可插入的内容');
    if (window.__MP_Editor_JSAPI__) {
      const ready = await invoke('mp_editor_get_isready');
      if (ready?.isNew) {
        if (ready.isReady === false) throw new Error('编辑器还在加载，请等正文区域出现后再导入');
        await invoke('mp_editor_insert_html', { html, isSelect: false });
        return { via: 'mp_editor_insert_html' };
      }
    }
    return insertViaDom(html);
  }

  function insertViaDom(html) {
    const target = findEditable();
    if (!target) {
      throw new Error('找不到正文编辑区。公众号改版后，请更新 src/page/main.js 里的选择器。');
    }
    target.focus();
    const doc = target.ownerDocument;
    if (doc.execCommand('insertHTML', false, html)) return { via: 'execCommand' };
    target.insertAdjacentHTML('beforeend', html);
    target.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return { via: 'insertAdjacentHTML' };
  }

  function findEditable() {
    for (const selector of EDITABLE_SELECTORS) {
      const element = document.querySelector(selector);
      if (!element) continue;
      if (element.tagName === 'IFRAME') {
        const body = element.contentDocument?.body;
        if (body) return body;
      }
      if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') return element;
    }
    return [...document.querySelectorAll('[contenteditable="true"]')].find(
      (element) => !/title/i.test(`${element.id} ${element.className}`),
    );
  }

  function setTitle(title) {
    const text = String(title || '').trim().slice(0, 64);
    if (!text) return { updated: false, reason: 'empty' };
    for (const selector of TITLE_SELECTORS) {
      const element = document.querySelector(selector);
      if (!element || (element.tagName !== 'INPUT' && element.tagName !== 'TEXTAREA')) continue;
      if (String(element.value || '').trim()) return { updated: false, reason: 'exists' };
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { updated: true };
    }
    const editable = [...document.querySelectorAll('[contenteditable="true"]')].find((element) =>
      /title/i.test(`${element.id} ${element.className} ${element.getAttribute('data-placeholder') || ''}`),
    );
    if (!editable) return { updated: false, reason: 'missing' };
    if (editable.textContent.trim()) return { updated: false, reason: 'exists' };
    editable.textContent = text;
    editable.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return { updated: true };
  }

  async function setCover(url) {
    if (!/^https?:\/\//i.test(url || '')) return { updated: false, reason: 'invalid' };
    if (coverAlreadySet()) return { updated: false, reason: 'exists' };
    if (!window.__MP_Editor_JSAPI__) return { updated: false, reason: 'no-api' };
    await invoke('mp_editor_change_cover', { oriImgUrl: url });
    return { updated: true };
  }

  function coverAlreadySet() {
    const area = document.querySelector('#js_cover_area, .js_cover_area_inner, #js_cover_preview');
    if (!area) return false;
    if (/mmbiz\.qpic\.cn|background-image\s*:\s*url\(/i.test(area.innerHTML || '')) return true;
    const image = area.querySelector('img');
    return !!(image && image.src && !image.src.startsWith('data:'));
  }

  async function uploadImage({ base64, mime, filename }) {
    const token = readToken();
    if (!token) throw new Error('没有在当前页找到编辑器 token，请从公众号后台重新打开图文编辑页');
    const file = new File([base64ToBytes(base64)], sanitizeName(filename, mime), { type: mime || 'image/jpeg' });
    const ticket = readTicket();
    let lastError = '上传失败';
    for (const scene of ['8', '1']) {
      const params = new URLSearchParams({
        action: 'upload_material',
        f: 'json',
        scene,
        writetype: 'doublewrite',
        groupid: '1',
        token,
        lang: 'zh_CN',
      });
      if (ticket.ticket) params.set('ticket', ticket.ticket);
      if (ticket.user) params.set('ticket_id', ticket.user);
      const body = new FormData();
      body.append('id', `WU_FILE_${Date.now()}`);
      body.append('name', file.name);
      body.append('type', file.type);
      body.append('lastModifiedDate', new Date().toString());
      body.append('size', String(file.size));
      body.append('file', file);
      const response = await fetch(`/cgi-bin/filetransfer?${params}`, {
        method: 'POST',
        body,
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      const url = data.cdn_url || data.url || '';
      const ret = data.base_resp?.ret ?? data.ret;
      if (url && (ret === 0 || ret == null)) return { url };
      lastError = data.base_resp?.err_msg || data.err_msg || `上传失败（${ret ?? response.status}）`;
    }
    throw new Error(`${lastError}。请确认这篇草稿仍打开，并且公众号后台已登录。`);
  }

  function readToken() {
    return (
      new URLSearchParams(location.search).get('token') ||
      window.wx?.cgiData?.token ||
      window.wx?.data?.t ||
      ''
    );
  }

  function readTicket() {
    const bags = [window.wx?.commonData?.data, window.wx?.commonData, window.wx?.data, window.wx?.cgiData];
    for (const bag of bags) {
      if (!bag) continue;
      const ticket = bag.ticket || bag.t || '';
      const user = bag.user_name || bag.userName || '';
      if (ticket || user) return { ticket: String(ticket || ''), user: String(user || '') };
    }
    return { ticket: '', user: '' };
  }

  function invoke(apiName, apiParam) {
    return new Promise((resolve, reject) => {
      const api = window.__MP_Editor_JSAPI__;
      if (!api?.invoke) {
        reject(new Error('当前页面没有公众号编辑器接口'));
        return;
      }
      const timer = setTimeout(() => reject(new Error('编辑器接口超时')), 8000);
      api.invoke({
        apiName,
        apiParam,
        sucCb: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        errCb: (err) => {
          clearTimeout(timer);
          reject(new Error(describeEditorError(err)));
        },
      });
    });
  }

  function reply(id, body) {
    window.postMessage({ source: SOURCE, direction: 'response', id, ...body }, location.origin);
  }

  function describeEditorError(err) {
    const text = typeof err === 'string' ? err : err?.err_msg || err?.errMsg || err?.message || err?.msg;
    return text ? String(text) : '编辑器接口拒绝了这次操作';
  }

  function base64ToBytes(value) {
    const binary = atob(value || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function sanitizeName(filename, mime) {
    const clean = String(filename || '').replace(/[^\w.\-\u4e00-\u9fff]+/g, '_').slice(-80);
    if (/\.(png|jpe?g|gif|webp)$/i.test(clean)) return clean;
    const ext = mime === 'image/png' ? 'png' : mime === 'image/gif' ? 'gif' : mime === 'image/webp' ? 'webp' : 'jpg';
    return `image.${ext}`;
  }
})();
