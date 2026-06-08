'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Camera, CheckCircle2, Clock, Eye, Trash2, XCircle } from 'lucide-react';

import { ExecutiveGlassCard } from '../executive/ExecutiveVaultShell';
import { getCafeFrontTasks, uploadCafeTaskProof } from '../../app/cafe-front/actions';

type TaskRow = {
  id: string;
  name: string;
  freq: 'DAILY' | 'WEEKLY';
  assignedTo: string;
  dueTime?: string;
  status: 'COMPLETE' | 'PENDING' | 'OVERDUE';
  proofUploadedAt?: string;
  proofUrl?: string;
};

const STATUS_META = {
  COMPLETE: { label: 'Complete', cls: 'bg-emerald-100/90 text-emerald-900 border-emerald-200', Icon: CheckCircle2 },
  PENDING: { label: 'Pending', cls: 'bg-amber-100/90 text-amber-900 border-amber-200', Icon: Clock },
  OVERDUE: { label: 'Overdue', cls: 'bg-rose-100/90 text-rose-900 border-rose-200', Icon: XCircle },
};

export function ComplianceDeskPanel() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [proofTask, setProofTask] = useState<TaskRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadTaskId, setUploadTaskId] = useState<string | null>(null);

  const reload = () => {
    void getCafeFrontTasks().then((rows) => {
      setTasks(rows as TaskRow[]);
      setLoading(false);
    });
  };

  useEffect(() => {
    reload();
  }, []);

  const complete = tasks.filter((t) => t.status === 'COMPLETE').length;
  const overdue = tasks.filter((t) => t.status === 'OVERDUE').length;
  const compliancePct = tasks.length ? Math.round((complete / tasks.length) * 100) : 0;

  const handleCapture = (taskId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      startTransition(async () => {
        const result = await uploadCafeTaskProof({ taskId, photoBase64: base64 });
        if (result.ok) reload();
        setUploadTaskId(null);
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <ExecutiveGlassCard className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200/80 bg-slate-50/80 px-5 py-3.5">
          <h2 className="text-lg font-bold uppercase text-slate-800">Visual Task Auditor</h2>
          <span className="rounded-full border border-emerald-200 bg-emerald-50/80 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
            {complete} Complete
          </span>
          {overdue > 0 ? (
            <span className="rounded-full border border-rose-200 bg-rose-50/80 px-2 py-0.5 text-[10px] font-bold text-rose-800">
              {overdue} Overdue
            </span>
          ) : null}
          <span className={`ml-auto text-sm font-black ${compliancePct >= 80 ? 'text-emerald-800' : 'text-amber-800'}`}>
            {compliancePct}%
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">compliance</span>
          <div className="flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/70 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
            <Trash2 className="h-2.5 w-2.5" />
            14-Day Photo Auto-Purge Active
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <p className="text-center text-sm text-slate-500">Loading tasks…</p>
          ) : tasks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200/80 bg-white/40 px-4 py-8 text-center text-xs text-slate-500">
              No compliance tasks assigned yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {tasks.map((task) => {
                const st = STATUS_META[task.status];
                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      task.status === 'COMPLETE'
                        ? 'border-emerald-200/80 bg-emerald-50/40'
                        : task.status === 'OVERDUE'
                          ? 'border-rose-200/80 bg-rose-50/40'
                          : 'border-slate-200/60 bg-white/40'
                    }`}
                  >
                    <st.Icon className="h-4 w-4 shrink-0 text-slate-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-900">{task.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {task.freq === 'DAILY' ? 'Daily' : 'Weekly'} · {task.assignedTo}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {task.proofUrl || task.proofUploadedAt ? (
                        <button
                          type="button"
                          onClick={() => setProofTask(task)}
                          className="flex items-center gap-1 rounded-lg border border-slate-200/80 bg-white/70 px-2 py-1 text-[10px] font-bold text-slate-700"
                        >
                          <Eye className="h-3 w-3" />
                          Proof
                        </button>
                      ) : (
                        <>
                          <input
                            ref={uploadTaskId === task.id ? fileRef : undefined}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleCapture(task.id, file);
                              e.target.value = '';
                            }}
                          />
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              setUploadTaskId(task.id);
                              setTimeout(() => fileRef.current?.click(), 0);
                            }}
                            className="flex items-center gap-1 rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-2 py-1 text-[10px] font-black text-emerald-800"
                          >
                            <Camera className="h-3 w-3" />
                            Upload
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ExecutiveGlassCard>

      {proofTask ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/70 bg-white p-5 shadow-2xl">
            <h3 className="text-sm font-black uppercase text-slate-900">{proofTask.name}</h3>
            {proofTask.proofUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={proofTask.proofUrl} alt="Task proof" className="mt-3 max-h-80 w-full rounded-xl object-cover" />
            ) : (
              <p className="mt-3 text-xs text-slate-500">Proof recorded on {proofTask.proofUploadedAt}</p>
            )}
            <button
              type="button"
              onClick={() => setProofTask(null)}
              className="mt-4 w-full rounded-xl border border-slate-200 py-2 text-sm font-bold text-slate-700"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
