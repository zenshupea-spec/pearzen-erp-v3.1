'use client';

import { useState } from 'react';
import { openCashDrawer } from '../../lib/esc-pos';

export default function BlindFloatForm({ expectedTotal, onComplete }: { expectedTotal: number, onComplete: (variance: number) => void }) {
  const [declaredCash, setDeclaredCash] = useState<number>(0);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [variance, setVariance] = useState<number>(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const calcVariance = declaredCash - expectedTotal;
    setVariance(calcVariance);
    setIsSubmitted(true);

    // Physically pop the drawer upon logging the float
    await openCashDrawer();
    onComplete(calcVariance);
  };

  return (
    <div className="max-w-md mx-auto bg-gray-900 p-6 rounded-xl border border-gray-700 shadow-2xl">
      <h2 className="text-xl font-bold text-white mb-4 uppercase">End of Shift: Blind Float</h2>
      
      {!isSubmitted ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1 uppercase">Total Physical LKR Counted</label>
            <input
              type="number"
              required
              min="0"
              value={declaredCash || ''}
              onChange={(e) => setDeclaredCash(Number(e.target.value))}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white text-2xl font-mono focus:ring-2 focus:ring-green-500"
              placeholder="0.00"
            />
          </div>
          
          <button
            type="submit"
            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-lg transition-colors uppercase"
          >
            Lock in Float & Open Drawer
          </button>
        </form>
      ) : (
        <div className="space-y-4 animate-fade-in">
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-400 text-sm uppercase">System Expected Total</p>
            <p className="text-2xl font-mono text-white">LKR {expectedTotal.toFixed(2)}</p>
          </div>
          
          <div className={`p-4 rounded-lg ${variance === 0 ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
            <p className="text-sm uppercase font-bold">Variance</p>
            <p className="text-2xl font-mono">
              {variance > 0 ? '+' : ''}{variance.toFixed(2)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
