const DB_NAME = 'contratos-web-options';
const STORE = 'entries';
const VERSION = 1;

/**
 * @param {Pick<IDBFactory, 'open'> | undefined} [indexedDB]
 * @param {{timeoutMs?: number, onClose?: () => void}} [options]
 * @returns {Promise<import('../../types/contracts.js').OptionsDatabase | null>}
 */
export function openOptionsDatabase(indexedDB = globalThis.indexedDB, { timeoutMs = 5000, onClose } = {}) {
  if (!indexedDB?.open) return Promise.resolve(null);
  return new Promise(resolve => {
    let settled = false,
      created = false;
    /** @type {IDBOpenDBRequest} */
    let request;
    try {
      request = indexedDB.open(DB_NAME, VERSION);
    } catch {
      resolve(null);
      return;
    }
    const unavailable = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    };
    const timer = setTimeout(unavailable, timeoutMs);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
        created = true;
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      clearTimeout(timer);
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      if (!created && !db.objectStoreNames?.contains?.(STORE)) {
        db.close();
        resolve(null);
        return;
      }
      db.onversionchange = () => {
        db.close();
        onClose?.();
      };
      db.onclose = () => onClose?.();
      /** @param {IDBTransactionMode} mode @param {(store: IDBObjectStore) => IDBRequest} action @returns {Promise<unknown>} */
      const run = (mode, action) =>
        new Promise((done, fail) => {
          const tx = db.transaction(STORE, mode);
          const query = action(tx.objectStore(STORE));
          /** @type {unknown} */
          let result;
          query.onsuccess = () => {
            result = query.result;
          };
          query.onerror = () => fail(query.error ?? new Error('Falha ao acessar as opções em cache.'));
          tx.oncomplete = () => done(result);
          tx.onerror = () => fail(tx.error ?? new Error('Falha na transação de opções.'));
          tx.onabort = () => fail(tx.error ?? new DOMException('Transação de opções cancelada.', 'AbortError'));
        });
      resolve({
        async get(key) {
          return (await run('readonly', store => store.get(key))) ?? null;
        },
        async set(key, value) {
          await run('readwrite', store => store.put(value, key));
        },
        async delete(key) {
          await run('readwrite', store => store.delete(key));
        },
        close() {
          db.close();
        }
      });
    };
    request.onerror = unavailable;
    request.onblocked = unavailable;
  });
}
