'use client'

import { generateMonthEndPayroll } from './actions';
import { useTransition } from 'react';

export default function PayrollGeneratorForm() {
  const [isPending, startTransition] = useTransition();

  const handleGenerate = (formData: FormData) => {
    startTransition(async () => {
      const result = await generateMonthEndPayroll(formData);
      if (result.success) {
        alert(`✅ Engine Complete: Successfully generated ${result.count} draft payslips.`);
      } else {
        alert("❌ Payroll generation failed. Check terminal.");
      }
    });
  };

  return (
    <form action={handleGenerate} className="w-full flex flex-col gap-3 mt-4">
      <div className="flex gap-2">
        <input 
          type="number" 
          name="month" 
          defaultValue={new Date().getMonth() + 1} 
          min="1" 
          max="12" 
          className="bg-black border border-slate-700 px-3 py-2 text-xs w text-white placeholder-slate-500 uppercase" 
          required 
        />
        <input 
          type="number" 
          name="year" 
          defaultValue={new Date().getFullYear()} 
          className="bg-black border border-slate-700 px-3 py-2 text-xs w-1/2 text-white placeholder-slate-500 uppercase" 
          required 
        />
      </div>
      <button 
        disabled={isPending} 
        className="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 text-xs font-bold uppercase transition-colors disabled:opacity-50"
      >
        {isPending ? 'PROCESSING ENGINE...' : 'GENERATE MONTH-END PAYLOAD'}
      </button>
    </form>
  );
}
