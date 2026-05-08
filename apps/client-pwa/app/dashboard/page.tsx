"use client";

import { useState } from "react";

export default function DashboardPage() {
  // Mock data for the client's site metrics - will be wired to Supabase later
  const [metrics] = useState({
    activeGuards: 12,
    incidentsToday: 0,
    coverage: "100%",
    lastPatrol: "12 mins ago",
  });

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-md mx-auto space-y-6">
        
        {/* Header */}
        <div className="bg-gray-900 text-white p-6 rounded-3xl shadow-xl flex justify-between items-center border border-gray-800">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Site Command</h1>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">
              Live Security Metrics
            </p>
          </div>
          <div className="h-12 w-12 bg-blue-600 rounded-full flex items-center justify-center font-bold text-xl shadow-inner">
            C
          </div>
        </div>

        {/* EMERGENCY ACTION BUTTON */}
        <a
          href="tel:+94112345678" 
          className="w-full bg-red-500 hover:bg-red-600 active:scale-95 transition-all text-white p-4 rounded-2xl flex items-center justify-center font-bold text-sm tracking-wider shadow-md border border-red-400"
        >
          <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          EMERGENCY: CALL DUTY MANAGER
        </a>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
              Active Guards
            </p>
            <p className="text-3xl font-black mt-1 text-gray-900">
              {metrics.activeGuards}
            </p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
              Site Coverage
            </p>
            <p className="text-3xl font-black mt-1 text-green-600">
              {metrics.coverage}
            </p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
              Incidents Today
            </p>
            <p className="text-3xl font-black mt-1 text-gray-900">
              {metrics.incidentsToday}
            </p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
              Last Patrol
            </p>
            <p className="text-lg font-black mt-2 text-gray-900">
              {metrics.lastPatrol}
            </p>
          </div>
        </div>

        {/* Live Activity Feed */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
              Live Activity Feed
            </h2>
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3 border-b border-gray-50 pb-4">
              <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shadow-sm" />
              <div>
                <p className="text-sm font-bold text-gray-900">
                  Main Gate Check-in Verified
                </p>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  Profile ID: G-442 - 10:42 AM
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 border-b border-gray-50 pb-4">
              <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shadow-sm" />
              <div>
                <p className="text-sm font-bold text-gray-900">
                  Perimeter Patrol Completed
                </p>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  Sector 4 - 10:15 AM
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-gray-400 mt-1.5 shadow-sm" />
              <div>
                <p className="text-sm font-bold text-gray-900">Shift Handover</p>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  Night Shift Logged Out - 08:00 AM
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}