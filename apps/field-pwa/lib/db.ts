import { openDB } from 'idb';

const DB_NAME = 'PearzenFieldDB';
const STORE_NAME = 'offline_queue';

export const initDB = async () => {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    },
  });
};

export const saveToQueue = async (data: any) => {
  const db = await initDB();
  await db.add(STORE_NAME, { ...data, timestamp: Date.now() });
};