'use client';

export const openCashDrawer = async (): Promise<boolean> => {
  try {
    // Requires HTTPS or localhost to trigger Web Serial API
    const port = await (navigator as any).serial.requestPort();
    await port.open({ baudRate: 9600 });
    
    const writer = port.writable.getWriter();
    // Standard ESC/POS command to pulse pin 2 (open drawer)
    const data = new Uint8Array([27, 112, 0, 25, 250]); 
    
    await writer.write(data);
    writer.releaseLock();
    await port.close();
    
    return true;
  } catch (error) {
    console.error('Drawer trigger failed. Ensure printer is connected via USB.', error);
    alert('HARDWARE ERROR: Cannot open cash drawer.');
    return false;
  }
};