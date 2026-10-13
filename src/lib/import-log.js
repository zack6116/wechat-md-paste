export const IMPORT_LOG_FILENAME = 'wechat-md-paste-last-import.txt';
export const LOCAL_AGENT_LOG_URL = 'http://127.0.0.1:9765/import-log';

export async function notifyLocalAgent(body) {
  try {
    await fetch(LOCAL_AGENT_LOG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
    });
  } catch {
    // Optional dev helper: node dev/import-log-server.mjs
  }
}

export function formatImportLogBody(text, at = Date.now()) {
  return `${new Date(at).toISOString()}\n${text}`;
}

export function downloadImportLogFile(body) {
  const url = `data:text/plain;charset=utf-8,${encodeURIComponent(body)}`;
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename: IMPORT_LOG_FILENAME,
        conflictAction: 'overwrite',
        saveAs: false,
      },
      (downloadId) => {
        const err = chrome.runtime.lastError;
        if (err || downloadId == null) reject(new Error(err?.message || 'download failed'));
        else resolve(downloadId);
      },
    );
  });
}
