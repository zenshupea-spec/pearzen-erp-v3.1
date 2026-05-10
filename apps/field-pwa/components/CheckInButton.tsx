'use client';

import { useState } from 'react';
import { verifyTimeIntegrity, saveToOfflineQueue } from '../lib/offline-engine';
import { supabase } from '../lib/supabase'; // Adjust this import to your actual Supabase client path

export default function CheckInButton({ empNumber, locationId }: { empNumber: string, locationId: string }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const handleAction = async (type: 'CHECK_IN' | 'CHECK_OUT') => {
    setIsProcessing(true);
    setStatusMsg('Acquiring satellite GPS...');

    if (!navigator.geolocation) {
      setStatusMsg('Geolocation is not supported by your browser.');
      setIsProcessing(false);
      return;
    }

    // 1. Get Device Time
    const deviceTime = new Date().toISOString();
    
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        // 2. Get Satellite Time & Build Payload
        const gpsTime = new Date(position.timestamp).toISOString();
        const payload = {
          emp_number: empNumber,
          location_id: locationId,
          type,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          device_time: deviceTime,
          gps_time: gpsTime,
          status: 'PENDING'
        };

        // 3. Execute Dual-Clock Tampering Failsafe
        const { valid } = verifyTimeIntegrity(deviceTime, gpsTime);
        if (!valid) {
          payload.status = 'RED'; // Flagged for OM review due to >5 min difference
        } else {
          payload.status = 'GREEN';
        }

        // 4. Attempt Real-Time Network Request
        setStatusMsg('Syncing to Head Office...');
        const { error } = await supabase.from('attendance_logs').insert([payload]);
        
        if (error) throw error;
        
        setStatusMsg(`SUCCESS: ${type} Synced via 4G`);
      } catch (networkError) {
        // 5. Intercept Network Failure & Route to Local IndexedDB/Storage
        setStatusMsg('NETWORK OFFLINE: Caching locally...');
        await saveToOfflineQueue(payload);
        setStatusMsg(`CACHED: ${type} saved offline. Will sync upon reconnection.`);
      } finally {
        setIsProcessing(false);
      }

    }, (error) => {
      setStatusMsg(`GPS Error: ${error.message}`);
      setIsProcessing(false);
    }, { 
      enableHighAccuracy: true, 
      timeout: 15000, 
      maximumAge: 0 
    });
  };

  return (
    <div className="space-y-4 w-full max-w-md mx-auto p-4">
      <button
        onClick={() => handleAction('CHECK_IN')}
        disabled={isProcessing}
        className="w-full bg-green-600 hover:bg-green-500 text-black font-bold py-5 rounded-xl transition-all disabled:opacity-50 uppercase tracking-widest shadow-[0_0_20px_rgba(34,197,94,0.4)]"
      >
        Confirm Check In
      </button>
      
      <button
        onClick={() => handleAction('CHECK_OUT')}
        disabled={isProcessing}
        className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-5 rounded-xl border border-gray-700 transition-all disabled:opacity-50 uppercase tracking-widest"
      >
        Confirm Check Out
      </button>

      {/* Live Status Beaming Text */}
      <div className="h-6 mt-4 text-center">
        {statusMsg && (
          <p className={`text-sm font-mono uppercase ${statusMsg.includes('RED') || statusMsg.includes('Error') ? 'text-red-500' : statusMsg.includes('CACHED') ? 'text-yellow-500' : 'text-green-400 animate-pulse'}`}>
            {statusMsg}
          </p>
        )}
      </div>
    </div>
  );
}