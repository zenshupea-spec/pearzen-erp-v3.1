'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, RotateCcw, Play, Pause } from 'lucide-react';

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function VoiceRecorder({
  label,
  required,
  onRecorded,
}: {
  label: string;
  required?: boolean;
  onRecorded: (blob: Blob | null) => void;
}) {
  type Phase = 'idle' | 'recording' | 'done';
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [micError, setMicError] = useState('');

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );

  const start = useCallback(async () => {
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        onRecorded(blob);
        setPhase('done');
      };

      mr.start(100);
      mrRef.current = mr;
      setSeconds(0);
      setPhase('recording');
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setMicError('Microphone access denied. Please allow mic access and try again.');
    }
  }, [onRecorded]);

  const stop = useCallback(() => {
    mrRef.current?.stop();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reRecord = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setPlaying(false);
    setSeconds(0);
    onRecorded(null);
    setPhase('idle');
  }, [audioUrl, onRecorded]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current || !audioUrl) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying((p) => !p);
  }, [playing, audioUrl]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          {label}
        </span>
        {required && <span className="text-xs font-bold text-amber-700">Required</span>}
      </div>

      {phase === 'idle' && (
        <div className="flex flex-col items-center gap-3 py-6">
          {micError && (
            <p className="px-4 text-center text-xs font-medium text-rose-600">{micError}</p>
          )}
          <button
            type="button"
            onClick={start}
            className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-amber-300/80 bg-amber-50 text-amber-700 transition-all hover:border-amber-400 hover:bg-amber-100 active:scale-95"
          >
            <Mic className="h-8 w-8" />
          </button>
          <p className="text-sm font-medium text-slate-500">Tap to record</p>
        </div>
      )}

      {phase === 'recording' && (
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-amber-600"
                style={{
                  height: `${12 + Math.sin(i * 1.2) * 8}px`,
                  animation: `bounce ${0.5 + i * 0.07}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 60}ms`,
                }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-600" />
            <span className="font-mono text-sm tabular-nums text-amber-800">{fmt(seconds)}</span>
          </div>
          <button
            type="button"
            onClick={stop}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-600 text-white shadow-lg shadow-amber-600/30 transition-all active:scale-95"
          >
            <Square className="h-5 w-5 fill-white" />
          </button>
          <p className="text-sm font-medium text-slate-500">Tap to stop</p>
        </div>
      )}

      {phase === 'done' && audioUrl && (
        <div className="flex items-center gap-3 px-4 py-4">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio
            ref={audioRef}
            src={audioUrl}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-300/80 bg-amber-50 text-amber-700 transition-all active:scale-95"
          >
            {playing ? (
              <Pause className="h-4 w-4 fill-amber-700" />
            ) : (
              <Play className="h-4 w-4 fill-amber-700" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-full bg-slate-300"
                  style={{ height: `${4 + Math.abs(Math.sin(i * 0.8 + 1)) * 10}px` }}
                />
              ))}
            </div>
            <p className="font-mono text-sm text-slate-500">{fmt(seconds)}</p>
          </div>
          <button
            type="button"
            onClick={reRecord}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-all hover:text-slate-800 active:scale-95"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
