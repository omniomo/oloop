// Media blobs live in the extension's IndexedDB so large videos survive
// closing the side panel. Shared by the side panel and the background worker.

const DB_NAME = 'oloop-publisher';
const STORE = 'media';
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

/** rec: { id, name, type, size, blob, addedAt } */
export const putMedia = (rec) => run('readwrite', (s) => s.put(rec));
export const getMedia = (id) => run('readonly', (s) => s.get(id));
export const deleteMedia = (id) => run('readwrite', (s) => s.delete(id));
export const clearMedia = () => run('readwrite', (s) => s.clear());
