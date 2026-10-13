import { resolveEntitlement } from '../lib/entitlement.js';
import { licenseFailureText, verifyLicenseKey } from '../lib/license.js';

const keyInput = document.querySelector('#key');
const keyMessage = document.querySelector('#key-message');
const forgetMessage = document.querySelector('#forget-message');
const diagMessage = document.querySelector('#diag-message');
const lastImport = document.querySelector('#last-import');

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab));
}

document.querySelector('#save').addEventListener('click', async () => {
  const key = keyInput.value.trim();
  const result = await verifyLicenseKey(key);
  if (!result.valid) {
    keyMessage.textContent = licenseFailureText(result.reason);
    return;
  }
  await chrome.storage.local.set({ licenseKey: key });
  keyMessage.textContent = '已激活';
  await refresh();
});

document.querySelector('#clear').addEventListener('click', async () => {
  await chrome.storage.local.remove('licenseKey');
  keyInput.value = '';
  keyMessage.textContent = '已清除激活码';
  await refresh();
});

document.querySelector('#forget').addEventListener('click', async () => {
  await chrome.storage.local.set({ forgetImageFolder: true });
  forgetMessage.textContent = '已记下。回到编辑页后，下次导入会重新选择文件夹。';
});

document.querySelector('#diag').addEventListener('click', diagnoseEditor);

refresh();

async function diagnoseEditor() {
  diagMessage.textContent = '正在检查…';
  const tabs = await chrome.tabs.query({ url: 'https://mp.weixin.qq.com/*' });
  const edit = tabs.find((tab) => /appmsg_edit/i.test(tab.url || ''));
  if (!edit?.id) {
    diagMessage.textContent = '没有找到打开的图文编辑页标签。请先打开一篇草稿。';
    return;
  }
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: edit.id },
    world: 'MAIN',
    func: () => ({
      href: location.href,
      api: !!window.__MP_Editor_JSAPI__,
      main: !!window.__WMP_MAIN__,
      panel: !!document.getElementById('wmp-panel'),
      mirrors: document.querySelectorAll('.ProseMirror').length,
      boot: window.__WMP_BOOT_VERSION || '',
    }),
  });
  diagMessage.textContent = `编辑页：ProseMirror ${result.mirrors} 个，官方 API ${result.api ? '有' : '无'}，扩展面板 ${result.panel ? '已挂载' : '未挂载'}，main ${result.main ? '已注入' : '未注入'}。`;
}

function selectTab(name) {
  for (const tab of document.querySelectorAll('.tab')) {
    const on = tab.dataset.tab === name;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  }
  document.querySelector('#panel-import').hidden = name !== 'import';
  document.querySelector('#panel-member').hidden = name !== 'member';
}

async function refresh() {
  if (!globalThis.chrome?.storage?.local) return;
  const data = await chrome.storage.local.get(['trialStartedAt', 'licenseKey']);
  if (!data.trialStartedAt) {
    data.trialStartedAt = Date.now();
    await chrome.storage.local.set({ trialStartedAt: data.trialStartedAt });
  }
  const entitlement = await resolveEntitlement(data, verifyLicenseKey);
  paint(entitlement);
  const last = await chrome.storage.local.get(['lastImportLog', 'lastImportAt']);
  if (last.lastImportLog) {
    const when = last.lastImportAt ? new Date(last.lastImportAt).toLocaleString('zh-CN') : '';
    lastImport.textContent = `最近一次导入（${when}）：${last.lastImportLog.split('\n').slice(-3).join(' / ')}`;
  } else {
    lastImport.textContent = '';
  }
  if (data.licenseKey && !entitlement.license.valid) {
    keyMessage.textContent = licenseFailureText(entitlement.license.reason);
  }
}

function paint(entitlement) {
  const badge = document.querySelector('#badge');
  badge.className = 'badge';
  if (entitlement.plan === 'trial') {
    badge.classList.add('trial');
    badge.textContent = `试用 · 剩 ${entitlement.daysLeft} 天`;
    document.querySelector('#tier').textContent = `Pro 试用中（剩 ${entitlement.daysLeft} 天）`;
    document.querySelector('#images').textContent = '无限';
    document.querySelector('#folder').textContent = '可用';
    document.querySelector('#footer-state').textContent = '无（试用）';
    return;
  }
  if (entitlement.plan === 'pro') {
    badge.classList.add('pro');
    badge.textContent = 'Pro';
    document.querySelector('#tier').textContent = 'Pro';
    document.querySelector('#images').textContent = '无限';
    document.querySelector('#folder').textContent = '可用';
    document.querySelector('#footer-state').textContent = '无（Pro）';
    return;
  }
  badge.classList.add('free');
  badge.textContent = '免费版';
  document.querySelector('#tier').textContent = '免费版';
  document.querySelector('#images').textContent = '最多 3 张';
  document.querySelector('#folder').textContent = '不可用';
  document.querySelector('#footer-state').textContent = '有';
}
