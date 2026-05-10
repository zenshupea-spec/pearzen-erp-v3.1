export const verifyTimeIntegrity = (deviceTime: string, gpsTime: string) => {
    const dTime = new Date(deviceTime).getTime();
    const gTime = new Date(gpsTime).getTime();
    
    // 5-minute (300,000ms) threshold
    const diff = Math.abs(dTime - gTime);
    
    if (diff > 300000) {
      return { valid: false, reason: 'TAMPERING_DETECTED' };
    }
    return { valid: true };
  };