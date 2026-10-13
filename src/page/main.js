// 公众号编辑器改版时，优先改本文件里的选择器。适配版本：2026-10-14b
// 正文写入顺序：官方 __MP_Editor_JSAPI__（含同源 iframe），再退回正文节点。
// 不点击发表、群发或保存。封面只走官方接口。
(function initWechatMdPasteMain() {
  if (window.__WMP_MAIN__) return;
  window.__WMP_MAIN__ = true;

  const SOURCE = 'wechat-md-paste';
  const ADAPTER_VERSION = '2026-10-14e';
  let cachedBodyEditor = null;
  const TITLE_SELECTORS = [
    '#title',
    '#js_appmsg_title',
    'textarea#js_title',
    'textarea[name="title"]',
    '.js_title_input textarea',
    '#js_title_main textarea',
  ];
  const SURFACE_SELECTOR = '.ProseMirror, #ueditor_0, .rich_media_content, [contenteditable]';

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
      else if (data.type === 'focus-body') payload = focusBody();
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
    const api = editorApi();
    return {
      adapter: ADAPTER_VERSION,
      hasApi: !!api,
      imagePost: isImagePostEditor(),
      isEditor:
        !!api ||
        editorDocuments().some((doc) => {
          try {
            return !!doc.querySelector('.ProseMirror, #ueditor_0, #js_appmsg_title, textarea#title');
          } catch {
            return false;
          }
        }),
    };
  }

  async function insertHtml(html) {
    if (!html) throw new Error('没有可插入的内容');
    if (isImagePostEditor()) {
      throw new Error('只支持「文章」图文，不支持贴图编辑页（createType=8）。');
    }
    focusBody();
    const viaApi = await insertViaApi(html);
    if (viaApi) return viaApi;
    return insertViaDom(html);
  }

  function focusBody() {
    if (isImagePostEditor()) {
      throw new Error('只支持「文章」图文，不支持贴图编辑页（createType=8）。');
    }
    if (editorApi()) return { focused: true, via: 'mp_editor_api' };
    const target = findEditable();
    if (!target) throw new Error('找不到正文编辑区。请先在正文里点一下，或刷新编辑页后再导入。');
    focusElement(target);
    return { focused: true };
  }

  function focusElement(target) {
    target.focus();
    const doc = target.ownerDocument;
    const view = doc.defaultView;
    if (view?.getSelection && doc.createRange) {
      const range = doc.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      const selection = view.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    target.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  }

  async function insertViaApi(html) {
    if (!editorApi()) return null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        const ready = await invoke('mp_editor_get_isready');
        if (ready?.isNew && ready?.isReady === false) {
          await sleep(350);
          continue;
        }
        if (ready?.isNew !== false) {
          await invoke('mp_editor_insert_html', { html, isSelect: false });
          return { via: 'mp_editor_insert_html' };
        }
        break;
      } catch {
        await sleep(350);
      }
    }
    try {
      await invoke('mp_editor_insert_html', { html, isSelect: false });
      return { via: 'mp_editor_insert_html' };
    } catch {
      // Fall through to set_content or DOM insertion.
    }
    try {
      const current = await invoke('mp_editor_get_content');
      const merged = `${current?.content || ''}${html}`;
      await invoke('mp_editor_set_content', { content: merged });
      return { via: 'mp_editor_set_content' };
    } catch {
      return null;
    }
  }

  function insertViaDom(html) {
    const target = findEditable();
    if (!target) {
      throw new Error('找不到正文编辑区。请确认光标在正文里，或刷新编辑页后再导入。');
    }
    focusElement(target);
    return insertHtmlIntoElement(target, html);
  }

  function insertHtmlIntoElement(target, html) {
    const doc = target.ownerDocument;
    if (doc.execCommand('insertHTML', false, html)) return { via: 'execCommand' };
    target.insertAdjacentHTML('beforeend', html);
    target.dispatchEvent(new InputEvent('input', { bubbles: true }));
    target.dispatchEvent(new InputEvent('change', { bubbles: true }));
    return { via: 'insertAdjacentHTML' };
  }

  function findEditable() {
    if (cachedBodyEditor?.isConnected && isEditableSurface(cachedBodyEditor) && !isTitleSurface(cachedBodyEditor)) {
      return cachedBodyEditor;
    }
    const target = findEditableUncached();
    cachedBodyEditor = target;
    return target;
  }

  function findEditableUncached() {
    const mirrors = queryEditors('.ProseMirror').filter(isEditableSurface);
    const bodyMirrors = mirrors.filter((element) => !isTitleSurface(element));
    const picked = pickBodyMirror(bodyMirrors);
    if (picked) return picked;

    const found = [];
    for (const element of queryEditors(SURFACE_SELECTOR)) considerSurface(element, found);
    found.sort((a, b) => surfaceArea(b) - surfaceArea(a));
    return found.find((element) => !isTitleSurface(element)) || null;
  }

  function pickBodyMirror(bodyMirrors) {
    if (!bodyMirrors.length) return null;
    if (bodyMirrors.length === 1) return bodyMirrors[0];
    const ordered = [...bodyMirrors].sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    return ordered[1] || ordered[0];
  }

  function isImagePostEditor() {
    return /(?:^|[?&])createType=8(?:&|$)/.test(location.search);
  }

  function considerSurface(element, found) {
    if (!element || found.includes(element)) return;
    if (element.tagName === 'IFRAME' || element.tagName === 'FRAME') {
      if (element.id === 'wmp-panel') return;
      try {
        const body = element.contentDocument?.body;
        if (body && (isEditableSurface(body) || /ueditor/i.test(element.id || ''))) found.push(body);
      } catch {
        // Cross-origin frames are not the editor body we can write.
      }
      return;
    }
    if (isEditableSurface(element)) found.push(element);
  }

  function isEditableSurface(element) {
    if (!element || element.nodeType !== 1) return false;
    if (element.classList?.contains('ProseMirror')) return true;
    const flag = String(element.getAttribute?.('contenteditable') || '').toLowerCase();
    if (flag === 'false') return false;
    if (element.isContentEditable) return true;
    if (flag === 'true' || flag === 'plaintext-only') return true;
    return element.hasAttribute?.('contenteditable') && flag === '';
  }

  function isTitleSurface(element) {
    return [element, element.parentElement].filter(Boolean).some((node) => /title|标题/i.test(surfaceText(node)));
  }

  function surfaceText(element) {
    const className = typeof element.className === 'string' ? element.className : '';
    return [
      element.id,
      className,
      element.getAttribute?.('data-placeholder') || '',
      element.getAttribute?.('placeholder') || '',
      element.getAttribute?.('aria-label') || '',
    ].join(' ');
  }

  function surfaceArea(element) {
    const rect = element.getBoundingClientRect?.();
    if (!rect) return 0;
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }

  function editorDocuments() {
    const docs = [];
    const visit = (doc, depth) => {
      if (!doc?.querySelectorAll || docs.includes(doc) || depth > 10) return;
      docs.push(doc);
      for (const frame of doc.querySelectorAll('iframe, frame')) {
        if (frame.id === 'wmp-panel') continue;
        try {
          if (!frame.contentDocument) continue;
          visit(frame.contentDocument, depth + 1);
        } catch {
          // Cross-origin frames are not part of this editor page.
        }
      }
    };
    visit(document, 0);
    return docs;
  }

  function shadowRoots() {
    const roots = [];
    const visit = (root) => {
      let elements = [];
      try {
        elements = root.querySelectorAll('*');
      } catch {
        return;
      }
      for (const element of elements) {
        if (!element.shadowRoot || roots.includes(element.shadowRoot)) continue;
        roots.push(element.shadowRoot);
        visit(element.shadowRoot);
      }
    };
    for (const doc of editorDocuments()) visit(doc);
    return roots;
  }

  function queryEditors(selector) {
    const result = [];
    const seen = new Set();
    const add = (nodes) => {
      for (const element of nodes) {
        if (seen.has(element)) continue;
        seen.add(element);
        result.push(element);
      }
    };
    for (const root of [...editorDocuments(), ...shadowRoots()]) {
      try {
        add(root.querySelectorAll(selector));
      } catch {
        // A frame can detach while the page is still loading.
      }
    }
    return result;
  }

  function editorApi() {
    const seen = new Set();
    const pick = (win) => {
      if (!win || seen.has(win)) return null;
      seen.add(win);
      try {
        const api = win.__MP_Editor_JSAPI__;
        if (api?.invoke) return api;
        if (win.parent && win.parent !== win) return pick(win.parent);
      } catch {
        // Cross-origin parent frames cannot be read.
      }
      return null;
    };
    const topApi = pick(window);
    if (topApi) return topApi;
    for (const doc of editorDocuments()) {
      const api = doc.defaultView?.__MP_Editor_JSAPI__;
      if (api?.invoke) return api;
    }
    return null;
  }

  function setTitle(title) {
    const text = String(title || '').trim().slice(0, 64);
    if (!text) return { updated: false, reason: 'empty' };
    for (const selector of TITLE_SELECTORS) {
      const element = queryEditors(selector).find((node) => node.tagName === 'INPUT' || node.tagName === 'TEXTAREA');
      if (!element) continue;
      if (String(element.value || '').trim()) return { updated: false, reason: 'exists' };
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { updated: true };
    }
    const editable = queryEditors('[contenteditable], .ProseMirror').find(
      (element) => isEditableSurface(element) && isTitleSurface(element),
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
    if (!editorApi()) return { updated: false, reason: 'no-api' };
    await invoke('mp_editor_change_cover', { oriImgUrl: url });
    return { updated: true };
  }

  function coverAlreadySet() {
    const area = queryEditors('#js_cover_area, .js_cover_area_inner, #js_cover_preview')[0];
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

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function invoke(apiName, apiParam) {
    return new Promise((resolve, reject) => {
      const api = editorApi();
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
