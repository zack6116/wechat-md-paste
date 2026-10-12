const DB_NAME = 'wechat-md-paste';
const STORE = 'kv';
const HANDLE_KEY = 'image-dir';

export async function saveDirectoryHandle(handle) {
  const db = await openDb();
  await requestToPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).put(handle, HANDLE_KEY));
}

export async function loadDirectoryHandle() {
  const db = await openDb();
  return requestToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).get(HANDLE_KEY));
}

export async function deleteDirectoryHandle() {
  const db = await openDb();
  await requestToPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(HANDLE_KEY));
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
