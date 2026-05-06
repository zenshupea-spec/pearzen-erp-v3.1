"use client";
import { useRef, useState, useCallback } from "react";

interface CameraCaptureProps {
  onCapture: (base64Image: string) => void;
}

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      alert("Please allow camera access to check in.");
    }
  };

  const takePhoto = useCallback(() => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const base64 = canvas.toDataURL("image/jpeg", 0.8);
      onCapture(base64);

      stream?.getTracks().forEach((track) => track.stop());
    }
  }, [onCapture, stream]);

  return (
    <div className="flex flex-col gap-4 p-4 border-2 border-gray-200 rounded-xl bg-white shadow-sm">
      <h3 className="text-lg font-bold text-gray-800">
        Visual Verification Required
      </h3>
      <p className="text-sm text-gray-500">
        You must capture a live photo of your post to check in.
      </p>

      {!stream ? (
        <button
          onClick={startCamera}
          className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl font-bold transition-colors"
        >
          Open Camera
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="rounded-xl w-full max-w-md bg-black object-cover aspect-video"
          />
          <button
            onClick={takePhoto}
            className="bg-green-600 hover:bg-green-700 text-white p-4 rounded-xl font-bold transition-colors"
          >
            Capture Photo & Verify
          </button>
        </div>
      )}
    </div>
  );
}
