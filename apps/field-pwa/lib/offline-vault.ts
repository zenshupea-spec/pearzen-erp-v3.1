export interface OfflinePing {
  id: string;
  emp_number: string;
  action_type: 'CHECK_IN' | 'CHECK_OUT';
  latitude: number;
  longitude: number;
  sync_type: 'OFFLINE_CACHE';
  device_time: string;
  /** Stored image (data URL or base64) for replay when the network returns. */
  photo_base64: string;
}

const DB_NAME = 'PearzenVault';
const STORE_NAME = 'attendance_pings';
const DB_VERSION = 1;

export async function openVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePingToVault(ping: OfflinePing): Promise<void> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(ping);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getPingsFromVault(): Promise<OfflinePing[]> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function clearPingFromVault(id: string): Promise<void> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
