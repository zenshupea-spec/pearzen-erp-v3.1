"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import {
  Search, X, Users, UserCheck, UserX,
  CreditCard, User, Shield, Building2,
  Home, ArrowUpDown,
  CheckCircle2, XCircle, Clock, BadgeInfo, AlertTriangle,
  BookOpen, ClipboardList, KeyRound, UserPlus,
  ShieldAlert,
  FileText,
  Pencil,
} from "lucide-react";

import { rankSortIndex, isRankInMatrix } from "../../../../../packages/rank-pay-matrix";
import {
  canEditMnrEmployee,
  filterRanksForEditor,
  isExecutiveRank,
} from "../../../lib/executive-rank-guard";
import { getEmployees, setMaternityLeave } from "../../actions/mnrActions";
import { getRankPayMatrix } from "../../executive/settings/rank-matrix-actions";
import { getMnrAccess, saveEmployeeSection } from "./actions";
import ClearanceModal from "./ClearanceModal";
import EmployeeDocumentField from "../EmployeeDocumentField";
import EmployeeIdPhotoField from "../EmployeeIdPhotoField";
import { HR_DOCUMENT_META, HR_DOCUMENT_TYPES } from "../../../../../packages/supabase/employee-hr-documents";

const SHIFT_TRACKED_GROUPS = new Set(["GUARD", "GUARD_FIELD", "CAFE"]);

function normStatus(emp) {
  return (emp.status || "").trim();
}

function employeeEpfNo(emp) {
  return emp.epf_no ?? emp.epf_num ?? null;
}

function isHrActive(emp) {
  const s = normStatus(emp).toUpperCase();
  return s === "ACTIVE";
}

/** @deprecated alias — use isHrActive for status badge; operational buckets use helpers below */
function isActive(emp) {
  return isHrActive(emp);
}

function isResigned(emp) {
  return normStatus(emp).toLowerCase() === "resigned";
}

function isShiftTracked(emp) {
  return SHIFT_TRACKED_GROUPS.has((emp.group || "").toUpperCase());
}

function isOperationalActive(emp) {
  if (isResigned(emp) || !isHrActive(emp)) return false;
  if (emp.maternity_leave) return true;
  if (!isShiftTracked(emp)) return true;
  return Boolean(emp.has_recent_shift);
}

function isOperationalInactive(emp) {
  if (isResigned(emp) || !isHrActive(emp)) return false;
  if (emp.maternity_leave) return false;
  if (!isShiftTracked(emp)) return false;
  return !emp.has_recent_shift;
}

function daysUntilExpiry(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function vettingBucket(emp) {
  const states = [];
  const modDays = daysUntilExpiry(emp.mod_expiry);
  const polDays = daysUntilExpiry(emp.police_expiry);
  if (modDays !== null && modDays <= 45) states.push(modDays < 0 ? "expired" : "expiring");
  if (polDays !== null && polDays <= 45) states.push(polDays < 0 ? "expired" : "expiring");
  if (states.length === 0) return null;
  if (states.some((s) => s === "expired")) return "expired";
  return "expiring";
}

function isVettingExpiring(emp) {
  return isHrActive(emp) && vettingBucket(emp) === "expiring";
}

function isVettingExpired(emp) {
  return isHrActive(emp) && vettingBucket(emp) === "expired";
}

export default function MasterNominalRoll() {
  const [employees, setEmployees]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [processingIds, setProcessingIds] = useState({});

  const [searchQuery, setSearchQuery]       = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [personnelFilter, setPersonnelFilter] = useState("ALL");
  const [sortBy, setSortBy]                 = useState("name");
  const [sortDir, setSortDir]               = useState("asc");

  const [drawerEmp, setDrawerEmp]   = useState(null);
  const [drawerTab, setDrawerTab]   = useState("personal");
  const [drawerEditing, setDrawerEditing] = useState(false);
  const [canEditMnr, setCanEditMnr] = useState(false);
  const [canManageExecutive, setCanManageExecutive] = useState(false);
  const [mnrViewerRole, setMnrViewerRole] = useState(null);
  const [mnrViewerEmail, setMnrViewerEmail] = useState(null);
  const [mnrSignedIn, setMnrSignedIn] = useState(false);
  const [clearanceEmp, setClearanceEmp] = useState(null);
  const [mdRankMatrix, setMdRankMatrix] = useState([]);

  const requestIdRef = useRef(0);

  useEffect(() => {
    getRankPayMatrix().then(setMdRankMatrix).catch(() => setMdRankMatrix([]));
  }, []);

  const fetchEmployees = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await getEmployees();
      if (requestIdRef.current === requestId) setEmployees(data);
      return data;
    } catch (error) {
      if (requestIdRef.current === requestId)
        setErrorMessage(error?.message || "Failed to fetch employees.");
      return null;
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  useEffect(() => {
    getMnrAccess()
      .then(({ canEdit, role, signedIn, canManageExecutive: mdExec, viewerEmail }) => {
        setCanEditMnr(canEdit);
        setMnrViewerRole(role);
        setMnrViewerEmail(viewerEmail);
        setMnrSignedIn(Boolean(signedIn));
        setCanManageExecutive(Boolean(mdExec));
      })
      .catch(() => {
        setCanEditMnr(false);
        setMnrViewerRole(null);
        setMnrViewerEmail(null);
        setMnrSignedIn(false);
        setCanManageExecutive(false);
      });
  }, []);

  const canEditEmployee = useCallback(
    (emp) => canEditMnr && canEditMnrEmployee(mnrViewerRole, emp?.rank),
    [canEditMnr, mnrViewerRole],
  );

  const openSectionDrawer = (emp, tab, edit = false) => {
    setDrawerEmp(emp);
    setDrawerTab(tab);
    setDrawerEditing(Boolean(edit && canEditEmployee(emp)));
  };

  const openProfileDrawer = (emp) => openSectionDrawer(emp, "personal", false);

  const openEditDrawer = (emp, tab = "employment") => {
    openSectionDrawer(emp, tab, true);
  };

  const suggestions = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    return employees
      .filter(e =>
        e.full_name?.toLowerCase().includes(q) ||
        e.nic?.toLowerCase().includes(q) ||
        employeeEpfNo(e)?.toString().toLowerCase().includes(q) ||
        e.passport_no?.toLowerCase().includes(q)
      )
      .slice(0, 7);
  }, [searchQuery, employees]);

  const togglePersonnelFilter = (key) => {
    setPersonnelFilter((prev) => (prev === key ? "ALL" : key));
  };

  const filteredEmployees = useMemo(() => {
    let result = [...employees];

    if (personnelFilter === "ACTIVE") result = result.filter(isOperationalActive);
    if (personnelFilter === "INACTIVE") result = result.filter(isOperationalInactive);
    if (personnelFilter === "RESIGNED") result = result.filter(isResigned);
    if (personnelFilter === "VETTING_EXPIRING") result = result.filter(isVettingExpiring);
    if (personnelFilter === "VETTING_EXPIRED") result = result.filter(isVettingExpired);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        e.full_name?.toLowerCase().includes(q) ||
        e.nic?.toLowerCase().includes(q) ||
        employeeEpfNo(e)?.toString().toLowerCase().includes(q) ||
        e.passport_no?.toLowerCase().includes(q) ||
        e.rank?.toLowerCase().includes(q) ||
        e.site?.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") {
        cmp = (a.full_name || "").localeCompare(b.full_name || "");
      } else if (sortBy === "rank") {
        cmp = rankSortIndex(mdRankMatrix, a.rank) - rankSortIndex(mdRankMatrix, b.rank);
      } else if (sortBy === "date_joined") {
        cmp = (a.date_joined || "").localeCompare(b.date_joined || "");
      } else if (sortBy === "status") {
        cmp = (a.status || "").localeCompare(b.status || "");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [employees, personnelFilter, searchQuery, sortBy, sortDir, mdRankMatrix]);

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("asc"); }
  };

  const activePersonnelCount = employees.filter(isOperationalActive).length;
  const inactiveCount        = employees.filter(isOperationalInactive).length;
  const resignedCount        = employees.filter(isResigned).length;
  const expiringCount        = employees.filter(isVettingExpiring).length;
  const expiredCount         = employees.filter(isVettingExpired).length;

  const handleMaternityToggle = async (id, onLeave) => {
    if (processingIds[id]) return;
    setProcessingIds((prev) => ({ ...prev, [id]: true }));
    setErrorMessage("");
    try {
      await setMaternityLeave(id, onLeave);
      await fetchEmployees();
      if (drawerEmp?.id === id) {
        setDrawerEmp((prev) => (prev ? { ...prev, maternity_leave: onLeave } : null));
      }
    } catch (error) {
      setErrorMessage(error?.message || "Failed to update maternity leave.");
    } finally {
      setProcessingIds((prev) => ({ ...prev, [id]: false }));
    }
  };

  const PERSONNEL_CARDS = [
    {
      key: "ACTIVE",
      label: "Active Personnel",
      sub: "Shift in last 14 days",
      count: activePersonnelCount,
      Icon: Users,
      base: "bg-white border-slate-200 hover:border-emerald-300",
      iconWrap: "bg-emerald-50 border-emerald-200",
      iconColor: "text-emerald-600",
      countColor: "text-slate-900",
      labelColor: "text-slate-500",
      ring: "ring-2 ring-emerald-400 border-emerald-400",
    },
    {
      key: "INACTIVE",
      label: "Inactive",
      sub: "No shift 14 days · guards & café",
      count: inactiveCount,
      Icon: UserX,
      base: "bg-slate-50 border-slate-200 hover:border-slate-400",
      iconWrap: "bg-slate-100 border-slate-200",
      iconColor: "text-slate-600",
      countColor: "text-slate-900",
      labelColor: "text-slate-500",
      ring: "ring-2 ring-slate-400 border-slate-400",
    },
    {
      key: "RESIGNED",
      label: "Resigned",
      sub: "Offboarded",
      count: resignedCount,
      Icon: UserCheck,
      base: "bg-violet-50 border-violet-200 hover:border-violet-300",
      iconWrap: "bg-violet-100 border-violet-200",
      iconColor: "text-violet-700",
      countColor: "text-violet-900",
      labelColor: "text-violet-700/80",
      ring: "ring-2 ring-violet-400 border-violet-400",
    },
    {
      key: "VETTING_EXPIRING",
      label: "Vetting Expiring",
      sub: "MoD / Police ≤ 45 days",
      count: expiringCount,
      Icon: Clock,
      base: "bg-amber-50 border-amber-200 hover:border-amber-300",
      iconWrap: "bg-amber-100 border-amber-200",
      iconColor: "text-amber-700",
      countColor: "text-amber-800",
      labelColor: "text-amber-700/80",
      ring: "ring-2 ring-amber-400 border-amber-400",
    },
    {
      key: "VETTING_EXPIRED",
      label: "Vetting Expired",
      sub: "Clearance overdue",
      count: expiredCount,
      Icon: XCircle,
      base: "bg-red-50 border-red-200 hover:border-red-300",
      iconWrap: "bg-red-100 border-red-200",
      iconColor: "text-red-700",
      countColor: "text-red-800",
      labelColor: "text-red-700/80",
      ring: "ring-2 ring-red-400 border-red-400",
    },
  ];

  const STATUS_TABS = [
    { key: "ALL",      label: "All",      count: employees.length,       Icon: Users,      activeStyle: "bg-rose-50 text-rose-700 border border-rose-200" },
    { key: "ACTIVE",   label: "Active",   count: activePersonnelCount,   Icon: UserCheck,  activeStyle: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
    { key: "INACTIVE", label: "Inactive", count: inactiveCount,          Icon: UserX,      activeStyle: "bg-slate-100 text-slate-700 border border-slate-200" },
    { key: "RESIGNED", label: "Resigned", count: resignedCount,          Icon: UserX,      activeStyle: "bg-violet-50 text-violet-700 border border-violet-200" },
  ];

  const SORT_OPTIONS = [
    { key: "name",        label: "Name" },
    { key: "rank",        label: "Rank" },
    { key: "date_joined", label: "Date Joined" },
  ];

  return (
    <div className="-mx-4 md:-mx-8 min-h-full">

      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-slate-200 shadow-sm">
        <div className="max-w-[1800px] mx-auto px-4 md:px-8 py-4">

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                <BookOpen className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black uppercase tracking-widest text-slate-900">
                  Master Nominal Roll
                </h1>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                  Full Personnel Registry
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-black">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {activePersonnelCount} Active
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-black">
                  {inactiveCount} Inactive
                </span>
              </div>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-all"
              >
                <Home className="w-3.5 h-3.5" /> HQ Hub
              </Link>
            </div>
          </div>

          {!canEditMnr && !loading && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900 space-y-1">
              <p>
                View-only
                {!mnrSignedIn
                  ? " — not signed in"
                  : mnrViewerRole
                    ? ` — signed in as ${mnrViewerRole}`
                    : " — signed in, but no MNR rank (MD, OD, OM, HR, FM) on your email"}
              </p>
              <p className="font-medium text-amber-800">
                Portal access comes from <span className="font-black">MNR work email + rank</span>. Edit pencil appears when your rank is HR, MD, OD, or FM.
                {!mnrSignedIn && (
                  <>
                    {" "}
                    <Link href="/login" className="underline font-black text-amber-900 hover:text-amber-950">
                      Sign in
                    </Link>
                  </>
                )}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5 mt-4 pt-4 border-t border-slate-100">
            <span className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-black rounded-xl uppercase tracking-wider">
              <BookOpen className="w-3.5 h-3.5" /> Master Nominal Roll
            </span>
            <div className="w-px h-5 bg-slate-200 mx-0.5" />
            <Link href="/hr/onboarding" className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-all uppercase tracking-wide">
              <UserPlus className="w-3.5 h-3.5 text-rose-600" /> Onboarding
            </Link>
            <Link href="/hr/temp-roster" className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-all uppercase tracking-wide">
              <ClipboardList className="w-3.5 h-3.5 text-violet-600" /> Temp Roster
            </Link>
            <Link href="/hr/sm-portal" className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-black rounded-xl hover:bg-amber-100 transition-all uppercase tracking-wider">
              <KeyRound className="w-3.5 h-3.5" /> SM Portal
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4">
            {PERSONNEL_CARDS.map((card) => {
              const selected = personnelFilter === card.key;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => togglePersonnelFilter(card.key)}
                  className={`flex items-center gap-3 p-4 rounded-xl border transition-all group shadow-sm text-left w-full cursor-pointer ${
                    selected ? card.ring : card.base
                  }`}
                  aria-pressed={selected}
                >
                  <div className={`p-2.5 rounded-lg border shrink-0 ${card.iconWrap}`}>
                    <card.Icon className={`w-5 h-5 ${card.iconColor}`} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-bold uppercase tracking-wide truncate ${card.labelColor}`}>
                      {card.label}
                    </p>
                    <p className={`text-2xl font-black tabular-nums leading-tight ${card.countColor}`}>
                      {card.count}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide truncate mt-0.5">
                      {card.sub}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          {personnelFilter !== "ALL" && (
            <p className="text-xs text-slate-500 font-bold mt-2">
              Filtering table by{" "}
              <span className="text-rose-700">
                {PERSONNEL_CARDS.find((c) => c.key === personnelFilter)?.label ?? personnelFilter}
              </span>
              {" — "}
              <button
                type="button"
                onClick={() => setPersonnelFilter("ALL")}
                className="text-rose-600 hover:underline"
              >
                Show all
              </button>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-4">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 160)}
                placeholder="Search name, NIC, EPF No, Passport No…"
                className="w-full pl-9 pr-9 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setShowSuggestions(false); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
                  {suggestions.map(emp => (
                    <button
                      key={emp.id}
                      onMouseDown={() => { setSearchQuery(emp.full_name); setShowSuggestions(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 last:border-0"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isActive(emp) ? "bg-emerald-500" : "bg-slate-300"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-900 truncate">{emp.full_name}</p>
                        <p className="text-xs text-slate-500 font-mono truncate">
                          {emp.rank && <span className="text-slate-600 font-bold mr-1.5">{emp.rank}</span>}
                          {emp.nic && `NIC: ${emp.nic}`}
                          {employeeEpfNo(emp) && ` · EPF: ${employeeEpfNo(emp)}`}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-black px-2 py-0.5 rounded-full ${
                        isActive(emp)
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {emp.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl shadow-sm">
              {STATUS_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setPersonnelFilter(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
                    personnelFilter === tab.key ? tab.activeStyle : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <tab.Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  <span className="ml-0.5 opacity-70">({tab.count})</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-xl shadow-sm">
              <span className="px-2 text-xs font-black text-slate-400 uppercase tracking-widest">Sort</span>
              {SORT_OPTIONS.map(s => (
                <button
                  key={s.key}
                  onClick={() => toggleSort(s.key)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
                    sortBy === s.key
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {s.label}
                  {sortBy === s.key && (
                    <ArrowUpDown className={`w-3 h-3 transition-transform ${sortDir === "desc" ? "rotate-180" : ""}`} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto px-4 md:px-8 py-6">

        {errorMessage && (
          <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {errorMessage}
            <button onClick={() => setErrorMessage("")} className="ml-auto shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-rose-500 border-t-transparent animate-spin" />
            <p className="text-slate-500 text-sm font-black uppercase tracking-widest">
              Loading Personnel Registry…
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-3">
              Showing {filteredEmployees.length} of {employees.length} personnel
              {personnelFilter !== "ALL" && (
                <span className="text-rose-600 normal-case ml-1">
                  · {PERSONNEL_CARDS.find((c) => c.key === personnelFilter)?.label ?? personnelFilter}
                </span>
              )}
            </p>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs table-fixed">
                  <colgroup>
                    <col className="w-10" />
                    <col className="w-[26%]" />
                    <col className="w-[11%]" />
                    <col className="w-[18%]" />
                    <col className="w-[11%]" />
                    <col className="w-[14%]" />
                    <col className="w-[20%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-3 py-2 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">#</th>
                      <th className="px-3 py-2 text-left">
                        <button onClick={() => toggleSort("name")} className="flex items-center gap-1 text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-slate-900 transition-colors">
                          Personnel {sortBy === "name" && <ArrowUpDown className="w-3 h-3" />}
                        </button>
                      </th>
                      <th className="px-3 py-2 text-left">
                        <button onClick={() => toggleSort("rank")} className="flex items-center gap-1 text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-slate-900 transition-colors">
                          Rank {sortBy === "rank" && <ArrowUpDown className="w-3 h-3" />}
                        </button>
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-black text-slate-600 uppercase tracking-widest">Site</th>
                      <th className="px-3 py-2 text-left">
                        <button onClick={() => toggleSort("date_joined")} className="flex items-center gap-1 text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-slate-900 transition-colors">
                          Joined {sortBy === "date_joined" && <ArrowUpDown className="w-3 h-3" />}
                        </button>
                      </th>
                      <th className="px-3 py-2 text-left text-[10px] font-black text-slate-600 uppercase tracking-widest">Status</th>
                      <th className="px-3 py-2 text-right text-[10px] font-black text-slate-600 uppercase tracking-widest">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-20 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <Users className="w-12 h-12 text-slate-200" />
                            <p className="text-slate-500 font-bold text-sm">
                              {employees.length === 0
                                ? "No personnel in the registry — run npm run seed:hr-employees"
                                : "No personnel match this filter"}
                            </p>
                            {(searchQuery || personnelFilter !== "ALL") && employees.length > 0 && (
                              <div className="flex flex-wrap items-center justify-center gap-3">
                                {searchQuery && (
                                  <button onClick={() => setSearchQuery("")} className="text-rose-600 text-xs font-bold hover:underline">
                                    Clear search
                                  </button>
                                )}
                                {personnelFilter !== "ALL" && (
                                  <button onClick={() => setPersonnelFilter("ALL")} className="text-rose-600 text-xs font-bold hover:underline">
                                    Show all personnel
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredEmployees.map((emp, idx) => (
                        <tr
                          key={emp.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openProfileDrawer(emp)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openProfileDrawer(emp);
                            }
                          }}
                          className="hover:bg-slate-50 transition-colors align-middle cursor-pointer"
                        >
                          <td className="px-3 py-2 align-middle text-slate-400 font-mono text-[10px] tabular-nums">
                            {String(idx + 1).padStart(3, "0")}
                          </td>
                          <td className="px-3 py-2 align-middle min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                isOperationalActive(emp) ? "bg-emerald-500" : isResigned(emp) ? "bg-violet-400" : "bg-slate-300"
                              }`} />
                              <div className="min-w-0">
                                <p className="font-bold text-slate-900 text-xs truncate">{emp.full_name}</p>
                                <p className="text-[10px] text-slate-500 font-mono truncate">{emp.nic || "—"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <RankBadge rank={emp.rank} mdRankMatrix={mdRankMatrix} />
                          </td>
                          <td className="px-3 py-2 align-middle max-w-0">
                            <span className="block truncate text-slate-600 text-[10px] font-bold" title={emp.site || undefined}>
                              {emp.site || "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2 align-middle text-slate-600 text-[10px] font-mono whitespace-nowrap">
                            {emp.date_joined || "—"}
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide whitespace-nowrap ${
                              isResigned(emp)
                                ? "bg-violet-50 text-violet-700 border border-violet-200"
                                : emp.maternity_leave
                                  ? "bg-pink-50 text-pink-700 border border-pink-200"
                                  : isOperationalInactive(emp)
                                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                                    : isOperationalActive(emp)
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-slate-100 text-slate-600 border border-slate-200"
                            }`}>
                              {isOperationalActive(emp) ? <CheckCircle2 className="w-2.5 h-2.5 shrink-0" /> : <XCircle className="w-2.5 h-2.5 shrink-0" />}
                              <span className="truncate max-w-[5.5rem]">{emp.maternity_leave && isHrActive(emp) ? "Mat." : emp.status}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0.5 flex-nowrap">
                              {MNR_SECTIONS.map((section) => (
                                <SectionAction
                                  key={section.key}
                                  section={section}
                                  emp={emp}
                                  canEdit={canEditEmployee(emp)}
                                  onOpen={() => openSectionDrawer(emp, section.key, false)}
                                />
                              ))}
                              {canEditEmployee(emp) && (
                                <ActionBtn
                                  icon={Pencil}
                                  title="Edit employee (employment & status)"
                                  color="rose"
                                  onClick={() => openEditDrawer(emp, "employment")}
                                />
                              )}
                              {canEditMnr && isExecutiveRank(emp.rank) && !canManageExecutive && (
                                <span
                                  title="MD / OD records — MD or OD only"
                                  className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md"
                                >
                                  Exec
                                </span>
                              )}
                              <ActionBtn
                                icon={isResigned(emp) ? FileText : ShieldAlert}
                                title={
                                  isResigned(emp)
                                    ? "View clearance summary"
                                    : "Offboarding clearance"
                                }
                                color={isResigned(emp) ? "violet" : "sky"}
                                onClick={() => setClearanceEmp(emp)}
                              />
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {drawerEmp && (
        <EmployeeDrawer
          emp={drawerEmp}
          activeTab={drawerTab}
          editing={drawerEditing}
          canEdit={canEditEmployee(drawerEmp)}
          canManageExecutive={canManageExecutive}
          signedIn={mnrSignedIn}
          viewerRole={mnrViewerRole}
          viewerEmail={mnrViewerEmail}
          onTabChange={(tab) => {
            setDrawerTab(tab);
            setDrawerEditing(false);
          }}
          onClose={() => {
            setDrawerEmp(null);
            setDrawerEditing(false);
          }}
          onToggleEdit={() => setDrawerEditing((v) => !v)}
          onSaved={async () => {
            setDrawerEditing(false);
            const data = await fetchEmployees();
            if (data && drawerEmp) {
              const fresh = data.find((e) => e.id === drawerEmp.id);
              if (fresh) setDrawerEmp(fresh);
            }
          }}
          onMaternityToggle={handleMaternityToggle}
          onOpenClearanceSummary={(employee) => setClearanceEmp(employee)}
          processingIds={processingIds}
          mdRankMatrix={mdRankMatrix}
        />
      )}

      {clearanceEmp && (
        <ClearanceModal
          employee={clearanceEmp}
          summaryMode={isResigned(clearanceEmp)}
          canConfirm={canEditMnr}
          onClose={() => setClearanceEmp(null)}
          onResignationConfirmed={fetchEmployees}
        />
      )}
    </div>
  );
}

const MNR_SECTIONS = [
  { key: "personal",   icon: User,       title: "Personal Details",      color: "violet" },
  { key: "employment", icon: Building2,  title: "Employment Details",    color: "amber" },
  { key: "bank",       icon: CreditCard, title: "Bank Details",          color: "emerald" },
  { key: "vetting",    icon: Shield,     title: "Vetting & Clearance",   color: "sky" },
];

function formatSectionEdited(iso, short = false) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (short) {
    return d.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sectionEditMeta(emp, key) {
  const edits = emp?.section_edits;
  if (!edits || typeof edits !== "object" || Array.isArray(edits)) return null;
  const meta = edits[key];
  if (!meta?.at) return null;
  return meta;
}

function SectionAction({ section, emp, canEdit, onOpen }) {
  const meta = sectionEditMeta(emp, section.key);
  const whenShort = formatSectionEdited(meta?.at, true);
  const whenFull = formatSectionEdited(meta?.at);
  const tooltip = meta
    ? `${section.title}\nLast edited by ${meta.by}${whenFull ? ` — ${whenFull}` : ""}`
    : `${section.title}\nNot edited yet${canEdit ? " (editable)" : " (view only)"}`;

  return (
    <div className="flex flex-col items-center shrink-0 w-[2.125rem]" title={tooltip}>
      <ActionBtn
        icon={section.icon}
        title={tooltip}
        color={section.color}
        onClick={onOpen}
      />
      {meta && (
        <span className="mt-0.5 w-full text-center text-[7px] leading-none font-medium text-slate-400 truncate px-0.5" aria-hidden>
          {whenShort}
        </span>
      )}
    </div>
  );
}

const COLOR_MAP = {
  violet: "hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200",
  amber:  "hover:bg-amber-50  hover:text-amber-700  hover:border-amber-200",
  emerald:"hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200",
  sky:    "hover:bg-sky-50    hover:text-sky-700    hover:border-sky-200",
  rose:   "hover:bg-rose-50   hover:text-rose-700   hover:border-rose-200",
};

const HR_STATUS_OPTIONS = [
  "ACTIVE",
  "Inactive",
  "Resigned",
  "Terminated",
  "Suspended",
];

function ActionBtn({ icon: Icon, title, color, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1 rounded-md bg-white border border-slate-200 text-slate-500 transition-all shrink-0 ${COLOR_MAP[color]}`}
    >
      <Icon className="w-3 h-3" />
    </button>
  );
}

const TABS = [
  { key: "personal",   label: "Personal",   Icon: User,      },
  { key: "employment", label: "Employment",  Icon: Building2, },
  { key: "bank",       label: "Bank",        Icon: CreditCard,},
  { key: "vetting",    label: "Vetting",     Icon: Shield,    },
];

function EmployeeDrawer({
  emp,
  activeTab,
  editing,
  canEdit,
  canManageExecutive,
  signedIn,
  viewerRole,
  viewerEmail,
  onTabChange,
  onClose,
  onToggleEdit,
  onSaved,
  onMaternityToggle,
  onOpenClearanceSummary,
  processingIds,
  mdRankMatrix,
}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const today   = new Date();
  const daysDiff = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const activeMeta = sectionEditMeta(emp, activeTab);
  const activeEdited = formatSectionEdited(activeMeta?.at);

  const handleSectionSave = async (e) => {
    e.preventDefault();
    if (!canEdit || !editing) return;
    setSaving(true);
    setSaveError("");
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    try {
      await saveEmployeeSection(activeTab, emp.id, payload);
      onSaved();
    } catch (err) {
      setSaveError(err?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 outline-none";

  const isOwnRecord =
    viewerEmail &&
    emp.email &&
    viewerEmail === String(emp.email).trim().toLowerCase();
  const canUploadIdPhoto = canEdit || Boolean(isOwnRecord);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />

      <aside className="relative ml-auto w-full max-w-lg h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-white to-rose-50/40 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`w-3 h-3 rounded-full shrink-0 ${isActive(emp) ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
            <div className="min-w-0">
              <p className="font-black text-slate-900 uppercase tracking-wider text-sm truncate">{emp.full_name}</p>
              <p className="text-xs text-slate-500 font-bold truncate">
                {emp.rank && <span className="text-slate-600">{emp.rank}</span>}
                {emp.site && <span> · {emp.site}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            {canEdit ? (
              <button
                type="button"
                onClick={onToggleEdit}
                title={editing ? "Switch to view mode" : "Edit this section"}
                aria-label={editing ? "Switch to view mode" : "Edit this section"}
                className={`p-2 rounded-xl border transition-all shrink-0 ${
                  editing
                    ? "bg-violet-50 border-violet-200 text-violet-800"
                    : "bg-white border-slate-200 text-rose-600 hover:bg-rose-50 hover:border-rose-200"
                }`}
              >
                <Pencil className="w-4 h-4" />
              </button>
            ) : (
              <span
                title={
                  !signedIn
                    ? "Sign in as HR, MD, OD, or FM to edit"
                    : viewerRole
                      ? `${viewerRole} cannot edit — HR, MD, OD, or FM only`
                      : "No MNR portal rank — HR must set your work email and rank (MD, OD, OM, HR, FM)"
                }
                className="p-2 rounded-xl border border-dashed border-slate-200 text-slate-300 shrink-0 cursor-not-allowed"
                aria-hidden
              >
                <Pencil className="w-4 h-4" />
              </span>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-2 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <p className="text-[10px] font-medium text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3 shrink-0" />
            {activeMeta ? (
              <>
                Last edited by <span className="font-bold text-slate-700">{activeMeta.by}</span>
                {activeEdited ? <> — {activeEdited}</> : null}
              </>
            ) : (
              <span className="text-slate-400">This section has not been edited yet</span>
            )}
          </p>
          {!canEdit && (
            <p className="text-[10px] font-bold text-amber-700 mt-1 uppercase tracking-wide">
              {!signedIn
                ? "Read-only — sign in as HR, MD, OD, or FM (pencil is greyed out above, left of ✕)"
                : isExecutiveRank(emp.rank)
                  ? "MD / OD record — only MD or OD can edit rank or portal email"
                  : viewerRole
                    ? `Read-only — ${viewerRole} cannot edit (HR, MD, OD, FM only)`
                    : "Read-only — no MNR portal rank on your email (HR, MD, OD, FM can edit)"}
            </p>
          )}
        </div>

        <div className="flex border-b border-slate-200 px-2 pt-1 shrink-0 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-black uppercase tracking-wide border-b-2 -mb-px whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? "border-rose-500 text-rose-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <tab.Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {saveError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
              {saveError}
            </div>
          )}

          {editing && canEdit ? (
            <form onSubmit={handleSectionSave} className="space-y-4">
              {activeTab === "personal" && (
                <>
                  <EmployeeIdPhotoField
                    employeeId={emp.id}
                    photoUrl={emp.id_photo_url}
                    canUpload={canUploadIdPhoto}
                    onUploaded={onSaved}
                  />
                  <EditField label="Full Name" name="full_name" defaultValue={emp.full_name} required inputClass={inputClass} />
                  <EditField
                    label="Work Email (portal login)"
                    name="email"
                    type="email"
                    defaultValue={emp.email}
                    required
                    readOnly={isExecutiveRank(emp.rank) && !canManageExecutive}
                    inputClass={inputClass}
                  />
                  <EditField label="NIC" name="nic" defaultValue={emp.nic} required mono inputClass={inputClass} />
                  <EditField label="Passport No" name="passport_no" defaultValue={emp.passport_no} mono inputClass={inputClass} />
                  <EditField label="EPF No" name="epf_no" defaultValue={employeeEpfNo(emp)} mono inputClass={inputClass} />
                  <EditField label="Date of Birth" name="dob" type="date" defaultValue={emp.dob} inputClass={inputClass} />
                  <EditField label="Gender" name="gender" defaultValue={emp.gender} inputClass={inputClass} />
                  <EditField label="Nationality" name="nationality" defaultValue={emp.nationality} inputClass={inputClass} />
                  <EditField label="Religion" name="religion" defaultValue={emp.religion} inputClass={inputClass} />
                  <EditField label="Phone" name="phone" defaultValue={emp.phone} required mono inputClass={inputClass} />
                  <EditField label="Home Address" name="home_address" defaultValue={emp.home_address} multiline inputClass={inputClass} />
                </>
              )}

              {activeTab === "employment" && (
                <>
                  <RankSelectField
                    label="Rank"
                    name="rank"
                    defaultValue={emp.rank}
                    mdRankMatrix={mdRankMatrix}
                    canManageExecutive={canManageExecutive}
                    inputClass={inputClass}
                  />
                  <EditField label="Role" name="role" defaultValue={emp.role} inputClass={inputClass} />
                  <EditField label="Corporate Group" name="group" defaultValue={emp.group} inputClass={inputClass} />
                  <EditField label="Assigned Site" name="site" defaultValue={emp.site} inputClass={inputClass} />
                  <EditField label="Date Joined" name="date_joined" type="date" defaultValue={emp.date_joined} inputClass={inputClass} />
                  <div className="flex flex-col gap-1 py-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Status</label>
                    <select
                      name="status"
                      defaultValue={emp.status || "ACTIVE"}
                      className={inputClass}
                    >
                      {HR_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                      {emp.status && !HR_STATUS_OPTIONS.includes(emp.status) && (
                        <option value={emp.status}>{emp.status}</option>
                      )}
                    </select>
                    <p className="text-[10px] text-slate-500 font-bold">
                      ACTIVE guards flow to OM site assignment, SM shifts, and TM verification.
                    </p>
                  </div>
                  <EditField label="Base Salary (LKR)" name="base_salary" type="number" defaultValue={emp.base_salary} inputClass={inputClass} />
                  <EditField label="Salary Type" name="salary_type" defaultValue={emp.salary_type} inputClass={inputClass} />
                  <div className="flex flex-col gap-1 py-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">EPF Enrolled</label>
                    <select
                      name="epf_yn"
                      defaultValue={emp.epf_yn ? "true" : "false"}
                      className={inputClass}
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                </>
              )}

              {activeTab === "bank" && (
                <>
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 mb-2">
                    <p className="text-xs font-black text-emerald-700 uppercase tracking-widest mb-0.5">Salary Account</p>
                    <p className="text-slate-500 text-xs font-bold">Confidential — HR portal editors only</p>
                  </div>
                  <EditField label="Bank Code" name="bank_code" defaultValue={emp.bank_code} mono inputClass={inputClass} />
                  <EditField label="Branch Code" name="branch_code" defaultValue={emp.branch_code} mono inputClass={inputClass} />
                  <EditField label="Account Number" name="account_number" defaultValue={emp.account_number} mono inputClass={inputClass} />
                </>
              )}

              {activeTab === "vetting" && (
                <>
                  <EditField label="MoD Expiry" name="mod_expiry" type="date" defaultValue={emp.mod_expiry} inputClass={inputClass} />
                  <EditField label="Police Clearance Expiry" name="police_expiry" type="date" defaultValue={emp.police_expiry} inputClass={inputClass} />
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest pt-2">Document uploads</p>
                  {HR_DOCUMENT_TYPES.map((docType) => (
                    <EmployeeDocumentField
                      key={docType}
                      employeeId={emp.id}
                      docType={docType}
                      documentUrl={emp[HR_DOCUMENT_META[docType].column]}
                      expiryDate={
                        HR_DOCUMENT_META[docType].expiryColumn
                          ? emp[HR_DOCUMENT_META[docType].expiryColumn]
                          : null
                      }
                      canUpload={canEdit}
                      onUploaded={onSaved}
                    />
                  ))}
                </>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Section"}
              </button>
            </form>
          ) : (
            <>
              {activeTab === "personal" && (
                <>
                  <EmployeeIdPhotoField
                    employeeId={emp.id}
                    photoUrl={emp.id_photo_url}
                    canUpload={canUploadIdPhoto}
                    onUploaded={onSaved}
                  />
                  <DetailRow label="Full Name"    value={emp.full_name} />
                  <DetailRow label="Work Email"   value={emp.email} />
                  <DetailRow label="NIC"          value={emp.nic}         mono />
                  <DetailRow label="Passport No"  value={emp.passport_no} mono />
                  <DetailRow label="EPF No"       value={employeeEpfNo(emp) || (emp.epf_yn ? "EPF Member (no number recorded)" : "Non-EPF")} />
                  <DetailRow label="Date of Birth" value={emp.dob} />
                  <DetailRow label="Gender"       value={emp.gender} />
                  <DetailRow label="Nationality"  value={emp.nationality} />
                  <DetailRow label="Religion"     value={emp.religion} />
                  <DetailRow label="Phone"        value={emp.phone}       mono />
                  <DetailRow label="Home Address" value={emp.home_address} multiline />
                </>
              )}

              {activeTab === "employment" && (
                <>
                  <div className="flex flex-col gap-1 py-2 border-b border-slate-100">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Rank</span>
                    <RankBadge rank={emp.rank} mdRankMatrix={mdRankMatrix} />
                  </div>
                  <DetailRow label="Role"            value={emp.role} />
                  <DetailRow label="Corporate Group" value={emp.group} />
                  <DetailRow label="Assigned Site"   value={emp.site} />
                  <DetailRow label="Date Joined"     value={emp.date_joined} />
                  <DetailRow label="Status"          value={emp.status} badge={isActive(emp) ? "active" : "inactive"} />
                  <DetailRow
                    label="Last 14 Days"
                    value={
                      isShiftTracked(emp)
                        ? (emp.has_recent_shift ? "Shift recorded" : "No shift recorded")
                        : "Not shift-tracked"
                    }
                  />
                  {canEdit && isHrActive(emp) && isShiftTracked(emp) && (
                    <div className="py-2 border-b border-slate-100">
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Maternity Leave</p>
                      <p className="text-xs text-slate-500 font-bold mb-3">
                        Excludes employee from the inactive (no-shift) list while on leave.
                      </p>
                      <button
                        type="button"
                        onClick={() => onMaternityToggle(emp.id, !emp.maternity_leave)}
                        disabled={Boolean(processingIds[emp.id])}
                        className={`w-full px-4 py-2.5 text-xs font-black uppercase tracking-wide rounded-xl border transition-all disabled:opacity-50 ${
                          emp.maternity_leave
                            ? "bg-pink-50 border-pink-200 text-pink-800 hover:bg-pink-100"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {processingIds[emp.id]
                          ? "Saving…"
                          : emp.maternity_leave
                            ? "Clear Maternity Leave"
                            : "Mark Maternity Leave"}
                      </button>
                    </div>
                  )}
                  {isResigned(emp) && onOpenClearanceSummary && (
                    <div className="py-3 border-b border-slate-100">
                      <button
                        type="button"
                        onClick={() => onOpenClearanceSummary(emp)}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-xs font-black uppercase tracking-wide rounded-xl border border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100 transition-all"
                      >
                        <FileText className="w-4 h-4 shrink-0" />
                        View clearance summary
                      </button>
                    </div>
                  )}
                  <DetailRow label="Base Salary"     value={emp.base_salary ? `LKR ${Number(emp.base_salary).toLocaleString()}` : null} />
                  <DetailRow label="Salary Type"     value={emp.salary_type} />
                  <DetailRow label="EPF Enrolled"    value={emp.epf_yn ? "Yes" : "No"} />
                </>
              )}

              {activeTab === "bank" && (
                <>
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 mb-2">
                    <p className="text-xs font-black text-emerald-700 uppercase tracking-widest mb-0.5">Salary Account</p>
                    <p className="text-slate-500 text-xs font-bold">Confidential — authorised access only</p>
                  </div>
                  <DetailRow label="Bank Code"      value={emp.bank_code}      mono />
                  <DetailRow label="Branch Code"    value={emp.branch_code}    mono />
                  <DetailRow label="Account Number" value={emp.account_number} mono />
                </>
              )}

              {activeTab === "vetting" && (
                <>
                  <VettingCard
                    label="MoD Clearance"
                    expiryDate={emp.mod_expiry}
                    days={daysDiff(emp.mod_expiry)}
                  />
                  <VettingCard
                    label="Police Clearance"
                    expiryDate={emp.police_expiry}
                    days={daysDiff(emp.police_expiry)}
                  />
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest pt-2">Compliance documents</p>
                  {HR_DOCUMENT_TYPES.map((docType) => (
                    <EmployeeDocumentField
                      key={docType}
                      employeeId={emp.id}
                      docType={docType}
                      documentUrl={emp[HR_DOCUMENT_META[docType].column]}
                      expiryDate={
                        HR_DOCUMENT_META[docType].expiryColumn
                          ? emp[HR_DOCUMENT_META[docType].expiryColumn]
                          : null
                      }
                      canUpload={canEdit}
                      onUploaded={onSaved}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function RankBadge({ rank, mdRankMatrix }) {
  if (!rank) {
    return <span className="text-[10px] font-bold text-slate-400">—</span>;
  }
  const valid = isRankInMatrix(mdRankMatrix, rank);
  const entry = mdRankMatrix.find(
    (r) => r.rankCode === String(rank).trim().toUpperCase()
  );
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide border ${
        valid
          ? "bg-slate-100 border-slate-200 text-slate-700"
          : "bg-amber-50 border-amber-200 text-amber-800"
      }`}
      title={
        valid
          ? entry?.fullTitle
          : "Not in MD Rank Pay Matrix — update in Executive Settings"
      }
    >
      {rank}
    </span>
  );
}

function RankSelectField({ label, name, defaultValue, mdRankMatrix, canManageExecutive, inputClass }) {
  const normalized = (defaultValue || "").trim().toUpperCase();
  const selectableMatrix = filterRanksForEditor(
    mdRankMatrix,
    canManageExecutive ? "MD" : "HR",
  );
  const inMatrix = isRankInMatrix(selectableMatrix, normalized);
  const legacy = normalized && !inMatrix ? normalized : "";

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
        {label}
      </label>
      {legacy && (
        <p className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
          Current rank &ldquo;{legacy}&rdquo; is not in the MD matrix. Select a valid rank below.
        </p>
      )}
      <select
        name={name}
        defaultValue={inMatrix ? normalized : ""}
        className={inputClass}
        required
      >
        <option value="" disabled>
          Select rank…
        </option>
        {selectableMatrix.map((r) => (
          <option key={r.id} value={r.rankCode}>
            {r.rankCode} — {r.fullTitle}
          </option>
        ))}
      </select>
      {!canManageExecutive && (
        <p className="text-[10px] font-bold text-indigo-800">
          MD and OD ranks are hidden — only MD or OD can assign executive portal access.
        </p>
      )}
      {selectableMatrix.length === 0 && (
        <p className="text-[10px] font-bold text-amber-700">
          No ranks in MD Settings. Ask MD to define ranks in Executive → Settings → Rank Pay Matrix.
        </p>
      )}
    </div>
  );
}

function EditField({ label, name, defaultValue, type = "text", required, mono, multiline, readOnly, inputClass }) {
  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">{label}</label>
      {multiline ? (
        <textarea
          name={name}
          defaultValue={defaultValue ?? ""}
          required={required}
          rows={3}
          className={`${inputClass} ${mono ? "font-mono" : ""}`}
        />
      ) : (
        <input
          type={type}
          name={name}
          defaultValue={defaultValue ?? ""}
          required={required}
          readOnly={readOnly}
          className={`${inputClass} ${mono ? "font-mono tracking-wider" : ""} ${readOnly ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
        />
      )}
    </div>
  );
}

function DetailRow({ label, value, mono, multiline, badge }) {
  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{label}</p>
      {badge ? (
        <span className={`self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wide ${
          badge === "active"
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-slate-100 text-slate-600 border border-slate-200"
        }`}>
          {badge === "active" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {value}
        </span>
      ) : (
        <p className={`text-sm text-slate-900 font-bold ${mono ? "font-mono tracking-wider" : ""} ${multiline ? "leading-relaxed" : ""}`}>
          {value || <span className="text-slate-400">—</span>}
        </p>
      )}
    </div>
  );
}

function VettingCard({ label, expiryDate, days }) {
  let state = "ok";
  if (days === null || days === undefined) state = "unknown";
  else if (days < 0)   state = "expired";
  else if (days <= 45) state = "expiring";

  const C = {
    ok:       { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", Icon: CheckCircle2 },
    expiring: { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-800",   Icon: Clock },
    expired:  { bg: "bg-red-50",     border: "border-red-200",     text: "text-red-700",     Icon: XCircle },
    unknown:  { bg: "bg-slate-50",   border: "border-slate-200",   text: "text-slate-600",   Icon: BadgeInfo },
  }[state];

  return (
    <div className={`p-5 rounded-xl ${C.bg} border ${C.border}`}>
      <div className="flex items-center justify-between mb-3">
        <p className={`text-xs font-black uppercase tracking-widest ${C.text}`}>{label}</p>
        <C.Icon className={`w-5 h-5 ${C.text}`} />
      </div>
      <p className="text-slate-900 font-black text-lg">{expiryDate || "Not Recorded"}</p>
      {days !== null && days !== undefined && (
        <p className={`text-xs font-bold mt-1.5 ${C.text}`}>
          {days < 0
            ? `Expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} ago`
            : days === 0
              ? "Expires today — urgent"
              : `${days} day${days !== 1 ? "s" : ""} remaining`}
        </p>
      )}
    </div>
  );
}
