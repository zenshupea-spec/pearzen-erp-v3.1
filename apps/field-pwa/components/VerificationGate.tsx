'use client';

import { useState } from 'react';
import { calculateDistance, scanSiteNFC } from '../lib/location-verification';
import CameraCapture from './CameraCa;
import CheckInButton from './CheckInButton';

const ALLOWED_RADIUS_METERS = 200;

export default function VerificationGate({ siteCoords, locationId, empNumber }: { siteCoords: { lat: number, lng: number }, locationId: string, empNumber: string }) {
  const [locationVerified, setLocationVerified] = useState(false);
  const [selfieData, setSelfieData] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  const verifyGPS = () => {
    setStatusMsg('CHECKING GPS RADIUS...');
    if (!navigator.geolocation) return setStatusMsg('GPS NOT SUPPORTED');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, siteCoords.lat, siteCoords.lng);
        if (dist <= ALLOWED_RADIUS_METERS) {
          setLocationVerified(true);
          setStatusMsg('LOCATION VERIFIED VIA GPS');
        } else {
          setStatusMsg(`OUT OF RANGE: ${Math.round(dist)}m AWAY`);
        }
      },
      (err) => setStatusMsg(`GPS ERROR: ${err.message}`),
      { enableHighAccuracy: true }
    );
  };

  const verifyNFC = async () => {
    try {
      setStatusMsg('READY TO SCAN NFC TAG...');
      const tagData = await scanSiteNFC();
      if (tagData) {
        setLocationVerified(true);
        setStatusMsg('LOCATION VERIFIED VIA NFC');
      }
    } catch (err: any) {
      setStatusMsg(`NFC ERROR: ${err.message}`);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* STEP 1: LOCATION */}
      <div className={`p-4 rounded-xl border ${locationVerified ? 'bg-green-900/20 border-green-500' : 'bg-gray-900 border-gray-700'}`}>
        <h3 className="text-gray-400 font-bold mb-4 uppercase tracking-widest text-sm">Step 1: Site Presence</h3>
        
        {!locationVerified ? (
          <div className="space-y-3">
            <button onClick={verifyGPS} className="w-full bg-gray-800 text-white font-bold py-3 rounded-lg uppercase border border-gray-600 hover:bg-gray-700">
              Verify via GPS
            </button>
            <button onClick={verifyNFC} className="w-full bg-indigo-900 text-white font-bold py-3 rounded-lg uppercase border border-indigo-700 hover:bg-indigo-800">
              Scan NFC Tag
            </button>
          </div>
        ) : (
          <p className="text-green-400 font-mono font-bold uppercase text-center">✔ PRESENCE CONFIRMED</p>
        )}
        
        {statusMsg && <p className="text-center text-xs mt-3 font-mono text-gray-500 uppercase">{statusMsg}</p>}
      </div>

      {/* STEP 2: CAMERA (LOCKED UNTIL LOCATION VERIFIED) */}
      <div className={`transition-opacity ${locationVerified ? 'opacity-100' : 'opacity-50 pointer-events-none grayscale'}`}>
        {!selfieData ? (
          <CameraCapture onCapture={(data) => setSelfieData(data)} />
        ) : (
          <div className="p-4 bg-green-900/20 border border-green-500 rounded-xl text-center">
            <h3 className="text-green-400 font-bold uppercase tracking-widest text-sm mb-2">✔ IDTY CONFIRMED</h3>
            <img src={selfieData} alt="Selfie" className="w-24 h-24 object-cover rounded-full mx-auto border-2 border-green-500" />
          </div>
        )}
      </div>

      {/* STEP 3: CHECK IN (LOCKED UNTIL SELFIE CAPTURED) */}
      <div className={`transition-opacity ${selfieData ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
        <CheckInButton empNumber={empNumber} locationId={locationId} />
      </div>
    </div>
  );
}
