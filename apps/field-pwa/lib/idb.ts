import { openDB, DBSchema, IDBPDatabase } from "idb";

const DB_NAME = "field_pwa_offline_db";
const STORE_NAME = "attendance_logs";

interface FieldDB extends DBSchema {
  attendance_logs: {
    key: number;
    value: {
      id?: number;
      emp_number: string;
      action: "CHECK_IN" | "CHECK_OUT";
      payload: any; // Will hold GPS, Photo, etc. in Step 4
      timestamp: number;
      time_flag: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<FieldDB>> | null = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<FieldDB>(DB_NAME, 1, {
      upgrade(db: IDBPDatabase<FieldDB>) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        }
      },
    });
  }
  return dbPromise;
};

export const saveLogLocally = async (
  logData: Omit<FieldDB["attendance_logs"]["value"], "id">
) => {
  const db = await getDB();
  await db.add(STORE_NAME, logData);
  console.log("💾 Log saved locally to IndexedDB.");
};

export const getLocalLogs = async () => {
  const db = await getDB();
  return await db.getAll(STORE_NAME);
};

export const clearLocalLog = async (id: number) => {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
};

