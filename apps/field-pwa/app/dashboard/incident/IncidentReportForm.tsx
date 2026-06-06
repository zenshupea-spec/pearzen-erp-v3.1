'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import VoiceRecorder from './VoiceRecorder';
import { submitIncident } from './actions';

export default function IncidentReportForm() {
  const [descriptionBlob, setDescriptionBlob] = useState<Blob | null>(null);
  const [actionBlob, setActionBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!descriptionBlob) {
      setError('A voice recording for the description is required.');
      return;
    }

    const fd = new FormData();
    const descExt = descriptionBlob.type.includes('mp4') ? 'mp4' : 'webm';
    fd.set(
      'description_audio',
      new File([descriptionBlob], `description.${descExt}`, { type: descriptionBlob.type }),
    );
    if (actionBlob) {
      const actExt = actionBlob.type.includes('mp4') ? 'mp4' : 'webm';
      fd.set('action_audio', new File([actionBlob], `action.${actExt}`, { type: actionBlob.type }));
    }

    startTransition(async () => {
      const result = await submitIncident(fd);
      if (result.success) {
        router.push('/');
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to send report.');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-6">
      <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
        <VoiceRecorder label="What happened?" required onRecorded={setDescriptionBlob} />
        <VoiceRecorder label="Immediate action taken" onRecorded={setActionBlob} />
      </div>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !descriptionBlob}
        className="w-full rounded-2xl bg-amber-600 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-amber-600/25 transition-all hover:bg-amber-500 active:scale-[0.98] disabled:opacity-50"
      >
        {isPending ? 'Sending…' : 'Submit report'}
      </button>
    </form>
  );
}
