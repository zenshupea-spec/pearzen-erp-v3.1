'use client';

// Haversine formula to calculate distance in meters
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // Earth radius in meters
  const toRad = (val: number) => (val * Math.PI) / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
            
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// WebNFC Scanner for Android devices
export const scanSiteNFC = async (): Promise<string> => {
  if (!('NDEFReader' in window)) {
    throw new Error('NFC is not supported on this device/browser.');
  }

  try {
    // @ts-ignore - NDEFReader is an emerging web standard
    const ndef = new NDEFReader();
    await ndef.scan();
    
    return new Promise((resolve, reject) => {
      ndef.onreadingerror = () => reject(new Error('NFC Read Error'));
      ndef.onreading = (event: any) => {
        const decoder = new TextDecoder();
        for (const record of event.message.records) {
          if (record.recordType === 'text') {
            resolve(decoder.decode(record.data));
            return;
          }
        }
        resolve(event.serialNumber); // Fallback to tag serial number
      };
    });
  } catch (error) {
    throw error;
  }
};
