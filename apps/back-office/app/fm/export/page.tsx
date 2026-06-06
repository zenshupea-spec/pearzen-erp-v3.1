'use client';

import React, { useState, useEffect } from 'react';
import { fetchBankExportData } from './actions';

export default function BulkBankExportPage() {
  const [payrollData, setPayrollData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    const result = await fetchBankExportData();
    if (result.success) {
      setPayrollData(result.data);
    }
    setIsLoading(false);
  };

  const handleDownloadCSV = () => {
    if (payrollData.length === 0) return alert("No data to export.");

    const headers = ["Account Number", "Amount", "Reference", "Beneficiary Name", "Bank Name"];
    const csvRows = [headers.join(",")];

    payrollData.forEach(row => {
      const csvRow = [
        row.account_number,
        row.net_pay,
        row.reference,
        `"${row.beneficiary}"`, // Quoted to handle spaces in names
        `"${row.bank_name}"`
      ];
      csvRows.push(csvRow.join(","));
    });

    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `PEARZEN_BANK_EXPORT_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0e] text-slate-200 font-sans pb-20">
      {/* Header */}
      <div className="bg-[#111118] border-b border-blue-500/20 sticky top-0 z-50 px-6 py-5 shadow-lg flex justify-between items-center">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight uppercase">Finance Manager: Bank Export</h1>
          <p className="text-[10px] text-blue-400 font-mono font-bold uppercase tracking-widest mt-1">
            Review payroll destinations and generate the bank transfer file.
          </p>
        </div>
        <button 
          onClick={handleDownloadCSV}
          disabled={isLoading || payrollData.length === 0}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all uppercase tracking-wider shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download .CSV
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Ledger Table */}
        <div className="bg-[#111118] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#0a0a0e] text-slate-500 font-bold border-b border-slate-800 text-xs tracking-wider">
                <tr>
                  <th className="px-6 py-4">EMP ID</th>
                  <th className="px-6 py-4">BENEFICIARY</th>
                  <th className="px-6 py-4">BANK NAME</th>
                  <th className="px-6 py-4">ACCOUNT NUMBER</th>
                  <th className="px-6 py-4 text-right">NET PAY (LKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 font-mono animate-pulse">
                      Compiling payroll ledger...
                    </td>
                  </tr>
                ) : payrollData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 font-medium">
                      No active employees found to export.
                    </td>
                  </tr>
                ) : (
                  payrollData.map((row, index) => (
                    <tr key={index} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-white">{row.emp_id}</td>
                      <td className="px-6 py-4 font-bold text-slate-300">{row.beneficiary}</td>
                      <td className="px-6 py-4">
                        {/* Blueprint Rule: Flag non-Commercial Bank accounts in YELLOW */}
                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${
                          row.is_commercial_bank 
                            ? 'bg-slate-800 text-slate-400 border border-slate-700' 
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {row.bank_name}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-400">{row.account_number}</td>
                      <td className="px-6 py-4 font-mono text-emerald-400 text-right font-bold">
                        {row.net_pay.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
