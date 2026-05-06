"use client";
import { useState } from "react";
import CameraCapture from "../../components/CameraCapture";
import { isWithinGeofence } from "../../utils/geofence";

interface AttendanceActionProps {
  shiftId: string;
  targetLat: number;
  targetLng: number;
  geofenceRadius: number; // in meters, e.g., 50
  onComplete: () => void;
}

export default function AttendanceAction({
  shiftId,
  targetLat,
  targetLng,
  geofenceRadius,
  onComplete,
}: AttendanceActionProps) {
  const [step, setStep] = useState<"IDLE" | "LOCATING" | "CAMERA" | "SYNCING">(
    "IDLE"
  );
  const [error, setError] = useState<string | null>(null);

  const startVerification = () => {
    setError(null);
    setStep("LOCATING");

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setStep("IDLE");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const isApproved = isWithinGeofence(
          latitude,
          longitude,
          targetLat,
          targetLng,
          geofenceRadius
        );

        if (isApproved) {
          setStep("CAMERA");
        } else {
          setError(
            "Verification Failed: You are outside the authorized geofence radius."
          );
          setStep("IDLE");
        }
      },
      (err) => {
        console.error("GPS Error:", err);
        setError("Failed to get location. Please ensure GPS permissions are allowed.");
        setStep("IDLE");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleCapture = async (base64Photo: string) => {
    setStep("SYNCING");

    try {
      // PHASE 2, STEP 2: IndexedDB / Supabase Sync Logic goes here.
      // For now, we simulate the successful offline/online save:
      console.log("Check-in payload ready:", {
        shiftId,
        photoLength: base64Photo.length,
      });

      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      onComplete();
    } catch (err) {
      setError("Failed to save check-in data. Please try again.");
      setStep("CAMERA"); // Let them retake the photo if save fails
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      {step === "IDLE" && (
        <button
          onClick={startVerification}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-5 rounded-xl shadow-lg transition-all active:scale-95 text-lg"
        >
          Check In to Post
        </button>
      )}

      {step === "LOCATING" && (
        <div className="w-full bg-gray-100 text-gray-600 font-bold py-5 rounded-xl text-center border-2 border-gray-200 animate-pulse">
          Acquiring GPS Satellite Lock...
        </div>
      )}

      {step === "CAMERA" && <CameraCapture onCapture={handleCapture} />}

      {step === "SYNCING" && (
        <div className="w-full bg-indigo-600 text-white font-bold py-5 rounded-xl text-center shadow-lg animate-pulse">
          Encrypting & Syncing Data...
        </div>
      )}
    </div>
  );
}

