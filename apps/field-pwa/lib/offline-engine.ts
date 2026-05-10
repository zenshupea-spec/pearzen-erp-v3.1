// apps/field-pwa/lib/offline-engine.ts

/**
 * 1. DUAL-CLOCK TAMPERING FAILSAFE
 * Compares the device's local time against a trusted GPS/Server timestamp.
 * If the difference is greater than 5 minutes (300,000 ms), it flags as RED (tampered).
 */
export function verifyTimeIntegrity(deviceTimeIso: string, trustedTimeIso: string): boolean {
    const deviceTime = new Date(deviceTimeIso).getTime();
    const trustedTime = new Date(trustedTimeIso).getTime();
    
    const differenceInMinutes = Math.abs(deviceTime - trustedTime) / (1000 * 60);
    
    // Return true if valid (difference is 5 minutes or less)
    // Return false if tampered (difference > 5 minutes)
    return differenceInMinutes <= 5;
  }
  
  /**
   * 2. OFFLINE CACHING (LOCAL STORAGE)
   * Saves shift actions (Check-in/Check-out) locally when 4G/WiFi drops.
   */
  const OFFLINE_QUEUE_KEY = "pearzen_offline_queue";
  
  export interface OfflineAction {
    id: string;
    type: "CHECK_IN" | "CHECK_OUT" | "INCIDENT";
    payload: any;
    timestamp: string;
  }
  
  // Save an action to the offline queue
  export function saveToOfflineQueue(action: Omit<OfflineAction, "id">) {
    if (typeof window === "undefined") return;
  
    const newAction: OfflineAction = {
      ...action,
      id: crypto.randomUUID(),
    };
  
    const existingQueueRaw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue: OfflineAction[] = existingQueueRaw ? JSON.parse(existingQueueRaw) : [];
    
    queue.push(newAction);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    
    console.log(`[Offline Engine] Saved ${action.type} to local device queue.`);
  }
  
  // Retrieve the current offline queue
  export function getOfflineQueue(): OfflineAction[] {
    if (typeof window === "undefined") return [];
    
    const existingQueueRaw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return existingQueueRaw ? JSON.parse(existingQueueRaw) : [];
  }
  
  // Clear specific items from the queue after successful sync
  export function removeFromOfflineQueue(actionId: string) {
    if (typeof window === "undefined") return;
  
    const queue = getOfflineQueue();
    const filteredQueue = queue.filter(action => action.id !== actionId);
    
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filteredQueue));
  }