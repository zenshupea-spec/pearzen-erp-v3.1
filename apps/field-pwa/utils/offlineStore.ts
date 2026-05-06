const DB_NAME = 'PearzenFieldDB';
const STORE_NAME = 'attendance_queue';
const DB_VERSION = 1;

export interface OfflineLog {
  id?: number;
  emp_number: string;
  action: 'CHECK_IN' | 'CHECK_OUT';
  device_timestamp: string;
  gps_timestamp: number;
  latitude: number;
  longitude: number;
  is_tampered: boolean;
  payload_data: any; // Future-proofing for selfies/battery status
}

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = (event: Event) => resolve((event.target as IDBOpenDBRequest).result);
    request.onerror = (event: Event) => reject((event.target as IDBOpenDBRequest).error);
  });
};

export const saveOfflineLog = async (log: OfflineLog): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(log);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getOfflineLogs = async (): Promise<OfflineLog[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const clearOfflineLog = async (id: number): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};