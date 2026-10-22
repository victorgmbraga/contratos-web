const DB_NAME = 'contratos-web-options';
const STORE = 'entries';
const VERSION = 1;

export function openOptionsDatabase(indexedDB = globalThis.indexedDB) {
  if (!indexedDB?.open) return Promise.resolve(null);
  return new Promise(resolve => {
    let request;
    try { request = indexedDB.open(DB_NAME, VERSION); }
    catch { resolve(null); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      const transaction = mode => db.transaction(STORE, mode);
      resolve({
        get(key) {
          return new Promise((done, fail) => {
            const query = transaction('readonly').objectStore(STORE).get(key);
            query.onsuccess = () => done(query.result ?? null);
            query.onerror = () => fail(query.error);
          });
        },
        set(key, value) {
          return new Promise((done, fail) => {
            const tx = transaction('readwrite');
            tx.objectStore(STORE).put(value, key);
            tx.oncomplete = () => done();
            tx.onerror = () => fail(tx.error);
          });
        },
        delete(key) {
          return new Promise((done, fail) => {
            const tx = transaction('readwrite');
            tx.objectStore(STORE).delete(key);
            tx.oncomplete = () => done();
            tx.onerror = () => fail(tx.error);
          });
        },
        close() { db.close(); },
      });
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}
