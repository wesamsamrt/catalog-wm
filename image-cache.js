(() => {
  const DB_NAME = 'wesam-shop-image-cache';
  const STORE_NAME = 'product-thumbnails';
  const VERSION = 1;
  const FRESH_FOR = 7 * 24 * 60 * 60 * 1000;
  let dbPromise;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(resolve => {
      if (!('indexedDB' in window)) return resolve(null);
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return dbPromise;
  }

  async function get(id) {
    try {
      const db = await openDb();
      if (!db) return null;
      return await new Promise(resolve => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(String(id));
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
    } catch { return null; }
  }

  async function put(id, blob) {
    try {
      const db = await openDb();
      if (!db || !(blob instanceof Blob)) return false;
      return await new Promise(resolve => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ blob, savedAt: Date.now() }, String(id));
        tx.oncomplete = () => resolve(true);
        tx.onerror = tx.onabort = () => resolve(false);
      });
    } catch { return false; }
  }

  function isFresh(entry) {
    return !!entry?.blob && Date.now() - Number(entry.savedAt || 0) < FRESH_FOR;
  }

  async function toThumbnail(urls, maxSide = 900, quality = 0.76) {
    const candidates = [...new Set((urls || []).filter(Boolean))];
    for (const url of candidates) {
      try {
        const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
        if (!response.ok) continue;
        const source = await response.blob();
        if (!source.type.startsWith('image/')) continue;
        if (!('createImageBitmap' in window)) return source;
        const bitmap = await createImageBitmap(source);
        const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        const thumbnail = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
        return thumbnail || source;
      } catch { /* Try the original URL if a transformed or cross-origin URL fails. */ }
    }
    return null;
  }

  window.WesamImageCache = { get, put, isFresh, toThumbnail };
})();
