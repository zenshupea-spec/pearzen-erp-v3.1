"use client";

import { useState } from "react";

import { processPayrollForPeriod } from "../../actions/payrollActions";

export default function FinancialManagerDashboard() {
  const [payrollData, setPayrollData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const runEngine = async () => {
    if (loading) return;

    setLoading(true);
    setErrorMessage("");

    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const end = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      ).toISOString();

      const data = await processPayrollForPeriod(start, end);
      setPayrollData(Array.isArray(data) ? data : []);
    } catch (error) {
      setErrorMessage(error?.message || "Error running payroll engine.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-2">Financial Engine</h1>
      <p className="text-gray-500 mb-6">
        Payroll Processing & Compensation Mathematics
      </p>

      <button
        onClick={runEngine}
        disabled={loading}
        className="bg-black text-white px-6 py-2 rounded mb-8 disabled:bg-gray-400 font-bold"
      >
        {loading ? "Processing Math..." : "Run Compensation Engine"}
      </button>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        {errorMessage ? (
          <div className="p-4 text-sm text-red-700 bg-red-50 border-b border-red-200">
            {errorMessage}
          </div>
        ) : null}
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Shift Origin Date</th>
              <th className="px-4 py-3">Total Hours</th>
              <th className="px-4 py-3">Gross Pay (LKR)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {payrollData.length === 0 ? (
              <tr>
                <td colSpan="4" className="p-8 text-center text-gray-500">
                  No data processed. Click run.
                </td>
              </tr>
            ) : (
              payrollData.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">{row.date}</td>
                  <td className="px-4 py-3">{row.hours}</td>
                  <td className="px-4 py-3 font-mono font-bold text-green-700">
                    LKR {row.pay}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
