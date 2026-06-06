'use client'

import { useState, useTransition, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, Mic, Square, RotateCcw, Play, Pause, ChevronDown } from 'lucide-react';
import { reportIncidentAction } from './actions';
import type { SMAssignmentOption } from '../../../lib/sm-assignments';

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const selectClassName =
  'w-full bg-white border-2 border-slate-200 text-slate-900 px-4 py-3 rounded-xl font-mono focus:outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10 transition-all appearance-none';

function GuardsMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: SMAssignmentOption[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter(v => v !== value)
        : [...selected, value],
    );
  };

  const triggerLabel =
    selected.length === 0
      ? 'Select guards…'
      : selected.length === 1
        ? options.find(o => o.value === selected[0])?.label ?? selected[0]
        : `${selected.length} guards selected`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`${selectClassName} text-left pr-11 ${selected.length === 0 ? 'text-slate-400' : 'text-slate-900'}`}
      >
        <span className="block truncate">{triggerLabel}</span>
      </button>
      <ChevronDown
        className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
      />

      {open && (
        <ul
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-20 mt-2 w-full max-h-52 overflow-y-auto rounded-xl border-2 border-slate-200 bg-white shadow-xl shadow-black/40 py-1"
        >
          {options.map(guard => {
            const isSelected = selected.includes(guard.value);
            return (
              <li key={guard.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => toggle(guard.value)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-mono transition-colors ${
                    isSelected
                      ? 'bg-red-500/15 text-red-300'
                      : 'text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      isSelected
                        ? 'border-red-500 bg-red-500 text-white'
                        : 'border-slate-800 bg-slate-800 text-white'
                    }`}
                  >
                    {isSelected && (
                      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-current" aria-hidden>
                        <path d="M10.2 2.4 4.8 8.4 2 5.6l1.2-1.2 1.6 1.6 4.2-4.8z" />
                      </svg>
                    )}
                  </span>
                  <span className="truncate">{guard.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map(epf => {
            const label = options.find(o => o.value === epf)?.label ?? epf;
            return (
              <span
                key={epf}
                className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-mono text-red-300"
              >
                {label.split(' — ')[0]}
                <button
                  type="button"
                  onClick={() => toggle(epf)}
                  className="text-red-600/80 hover:text-red-200 leading-none"
                  aria-label={`Remove ${epf}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VoiceRecorder({
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

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const start = useCallback(async () => {
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
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
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch {
      setMicError('Microphone access denied. Please allow mic access and try again.');
    }
  }, [onRecorded]);

  const stop = useCallback(() => {
    mrRef.current?.stop();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
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
    setPlaying(p => !p);
  }, [playing, audioUrl]);

  return (
    <div className="bg-white/80 border-2 border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200">
        <span className="text-sm font-black text-slate-500 uppercase tracking-widest">{label}</span>
        {required && <span className="text-red-500 text-xs font-bold">Required</span>}
      </div>

      {phase === 'idle' && (
        <div className="flex flex-col items-center gap-3 py-6">
          {micError && <p className="text-xs text-red-600 font-mono text-center px-4">{micError}</p>}
          <button
            type="button"
            onClick={start}
            className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500/40 flex items-center justify-center text-red-600 active:scale-95 transition-all hover:bg-red-500/20 hover:border-red-500/60"
          >
            <Mic className="w-8 h-8" />
          </button>
          <p className="text-sm text-slate-500 font-mono">Tap to record</p>
        </div>
      )}

      {phase === 'recording' && (
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-red-500"
                style={{
                  height: `${12 + Math.sin(i * 1.2) * 8}px`,
                  animation: `bounce ${0.5 + i * 0.07}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 60}ms`,
                }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-600 font-mono text-sm tabular-nums">{fmt(seconds)}</span>
          </div>
          <button
            type="button"
            onClick={stop}
            className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center text-white active:scale-95 transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)]"
          >
            <Square className="w-5 h-5 fill-white" />
          </button>
          <p className="text-sm text-slate-500 font-mono">Tap to stop</p>
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
            className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/40 flex items-center justify-center text-red-600 active:scale-95 transition-all shrink-0"
          >
            {playing ? <Pause className="w-4 h-4 fill-red-400" /> : <Play className="w-4 h-4 fill-red-400" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-1">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-full bg-slate-300"
                  style={{ height: `${4 + Math.abs(Math.sin(i * 0.8 + 1)) * 10}px` }}
                />
              ))}
            </div>
            <p className="text-sm text-slate-500 font-mono">{fmt(seconds)}</p>
          </div>
          <button
            type="button"
            onClick={reRecord}
            className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 active:scale-95 transition-all shrink-0"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

const INCIDENT_TYPES = [
  { value: 'SECURITY_BREACH', label: 'Security Breach' },
  { value: 'GUARD_MISCONDUCT', label: 'Guard Misconduct' },
  { value: 'EQUIPMENT_FAILURE', label: 'Equipment Failure' },
  { value: 'MEDICAL_EMERGENCY', label: 'Medical Emergency' },
  { value: 'THEFT', label: 'Theft' },
  { value: 'TRESPASSING', label: 'Trespassing' },
  { value: 'PROPERTY_DAMAGE', label: 'Property Damage' },
  { value: 'CLIENT_COMPLAINT', label: 'Client Complaint' },
  { value: 'NATURAL_DISASTER', label: 'Natural Disaster' },
  { value: 'OTHER', label: 'Other' },
];

export default function ReportIncidentClient({
  sites,
  guards,
}: {
  sites: SMAssignmentOption[];
  guards: SMAssignmentOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState('');
  const [done, setDone] = useState(false);
  const [incidentType, setIncidentType] = useState('');
  const [descriptionBlob, setDescriptionBlob] = useState<Blob | null>(null);
  const [actionBlob, setActionBlob] = useState<Blob | null>(null);
  const [selectedSite, setSelectedSite] = useState(sites[0]?.value ?? '');
  const [selectedGuards, setSelectedGuards] = useState<string[]>([]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');

    if (!descriptionBlob) {
      setErrorMsg('A voice recording for the description is required.');
      return;
    }

    if (!selectedSite) {
      setErrorMsg('Please select a site from your assigned list.');
      return;
    }

    const fd = new FormData(e.currentTarget);
    fd.set('incident_type', incidentType);
    fd.set('site_name', selectedSite);
    fd.set('guards_involved', selectedGuards.join(','));

    const ext = descriptionBlob.type.includes('mp4') ? 'mp4' : 'webm';
    fd.set('description_audio', new File([descriptionBlob], `description.${ext}`, { type: descriptionBlob.type }));
    if (actionBlob) {
      const aExt = actionBlob.type.includes('mp4') ? 'mp4' : 'webm';
      fd.set('action_audio', new File([actionBlob], `action.${aExt}`, { type: actionBlob.type }));
    }

    startTransition(async () => {
      const result = await reportIncidentAction(fd);
      if (result?.error) {
        setErrorMsg(result.error);
      } else {
        setDone(true);
      }
    });
  };

  if (done) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <div className="h-20 w-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-red-600" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Incident Reported</h2>
          <p className="text-sm text-slate-500">Report filed. Operations team notified.</p>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="w-full max-w-xs bg-red-500 hover:bg-red-400 text-white font-black py-4 rounded-xl uppercase tracking-widest transition-all active:scale-95"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const canSubmit = Boolean(incidentType && selectedSite && sites.length > 0);

  return (
    <div className="flex-1 flex flex-col p-5 space-y-6">
      <header className="flex items-center gap-3 pt-2">
        <button onClick={() => router.back()} className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Report Incident</h1>
          <p className="text-sm text-slate-500 font-mono">File a site incident report</p>
        </div>
        <div className="ml-auto p-3 bg-red-500/10 rounded-xl border border-red-500/20">
          <AlertTriangle className="w-5 h-5 text-red-600" />
        </div>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">

        <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">Incident Type <span className="text-red-500">*</span></h2>
          <div className="grid grid-cols-2 gap-2">
            {INCIDENT_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setIncidentType(t.value)}
                className={`p-3 rounded-xl border text-xs font-bold text-left transition-all active:scale-95 ${
                  incidentType === t.value
                    ? 'bg-red-500/15 border-red-500/50 text-red-600'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white/90 border border-slate-200/60 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">Details</h2>
          <div>
            <label className="block text-sm font-bold text-slate-600 uppercase mb-2 tracking-wider">
              Site <span className="text-red-500">*</span>
            </label>
            {sites.length === 0 ? (
              <p className="text-sm text-amber-600/90 font-mono bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                No sites are assigned to you yet. Contact operations to assign sites before filing a report.
              </p>
            ) : (
              <div className="relative">
                <select
                  name="site_name"
                  required
                  value={selectedSite}
                  onChange={e => setSelectedSite(e.target.value)}
                  className={selectClassName}
                >
                  <option value="" disabled>Select a site</option>
                  {sites.map(site => (
                    <option key={site.value} value={site.value}>{site.label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
            )}
          </div>
          <VoiceRecorder
            label="Description"
            required
            onRecorded={setDescriptionBlob}
          />
          <div>
            <label className="block text-sm font-bold text-slate-600 uppercase mb-2 tracking-wider">
              Guards Involved
            </label>
            {guards.length === 0 ? (
              <p className="text-sm text-slate-500 font-mono bg-white/80 border border-slate-200 rounded-xl px-4 py-3">
                No guards are assigned to you. You can still submit without selecting guards.
              </p>
            ) : (
              <GuardsMultiSelect
                options={guards}
                selected={selectedGuards}
                onChange={setSelectedGuards}
              />
            )}
          </div>
          <VoiceRecorder
            label="Immediate Action Taken"
            onRecorded={setActionBlob}
          />
        </div>

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-600 p-3 rounded-xl text-sm text-center font-bold">
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || !canSubmit}
          className="w-full bg-red-500 hover:bg-red-400 text-white font-black py-4 rounded-xl uppercase tracking-widest text-base shadow-[0_8px_20px_rgba(239,68,68,0.25)] transition-all active:scale-95 disabled:opacity-40"
        >
          {isPending ? 'Submitting...' : 'Submit Incident Report'}
        </button>
      </form>
    </div>
  );
}
