"use client";

import PortalLoadingScreen from '../../../../../packages/pwa-shell/PortalLoadingScreen';

import { useCallback, useEffect, useRef, useState, useMemo, useTransition } from "react";
import Link from "next/link";
import {
  Search, X, Users, UserCheck, UserX,
  CreditCard, User, Shield, Building2,
  Home, ArrowUpDown,
  CheckCircle2, XCircle, Clock, BadgeInfo, AlertTriangle,
  BookOpen,
  ShieldAlert,
  FileText,
  Pencil,
  UserPlus,
  Loader2,
} from "lucide-react";

import {
  rankSortIndex,
  isRankInMatrix,
  findRankPayEntry,
} from "../../../../../packages/rank-pay-matrix";
import {
  canEditMnrEmployee,
  canViewMnrEmployee,
  filterRanksForEditor,
  isExecutiveRank,
} from "../../../lib/executive-rank-guard";
import { getEmployees } from "../../actions/mnrActions";
import { getRankPayMatrix } from "../../executive/settings/rank-matrix-actions";
import { getInternalWorkLocationsForMnr } from "../../executive/settings/internal-work-locations-actions";
import { getMnrAccess, saveEmployeeAll } from "./actions";
import { getMnrRejoinDeskMeta, rejoinEmployee } from "./rejoin-actions";
import { normalizeEpfNo } from "../../../lib/employee-epf";
import { isNicLookupReady } from "../../../lib/employee-nic";
import { lookupPriorRecordsByNic } from "../epf-actions";
import ClearanceModal from "./ClearanceModal";
import HrHubPills from "../HrHubPills";
import EmployeeDocumentField from "../EmployeeDocumentField";
import EmployeeIdPhotoField from "../EmployeeIdPhotoField";
import { HR_DOCUMENT_META, HR_DOCUMENT_TYPES } from "../../../../../packages/supabase/employee-hr-documents";

const GUARD_GROUPS = new Set(["GUARD", "GUARD_FIELD"]);

function normStatus(emp) {
  return (emp.status || "").trim();
}

function employeeEpfNo(emp) {
  return emp.epf_no ?? emp.epf_num ?? null;
}


function findEpfNoOwner(epfNo, excludeEmployeeId, employees) {
  const norm = normalizeEpfNo(epfNo);
  if (!norm) return null;
  return (
    employees.find(
      (e) => e.id !== excludeEmployeeId && normalizeEpfNo(employeeEpfNo(e)) === norm,
    ) ?? null
  );
}

function normalizeWorkEmail(value) {
  const s = String(value ?? "").trim().toLowerCase();
  return s || "";
}

function findWorkEmailOwner(email, excludeEmployeeId, employees) {
  const norm = normalizeWorkEmail(email);
  if (!norm) return null;
  return (
    employees.find(
      (e) => e.id !== excludeEmployeeId && normalizeWorkEmail(e.email) === norm,
    ) ?? null
  );
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

function isGuardGroup(emp) {
  return GUARD_GROUPS.has((emp.group || "").toUpperCase());
}

const FIELD_GUARD_RANK_CODES = new Set(["CSO", "OIC", "SSO", "JSO", "LSO"]);

function isFieldGuardRank(matrix, rank) {
  const code = (rank || "").trim().toUpperCase();
  const entry = findRankPayEntry(matrix, code);
  if (entry) {
    return entry.operationalGroup === "GUARD_FIELD" || entry.operationalGroup === "GUARD";
  }
  return FIELD_GUARD_RANK_CODES.has(code);
}

function isGuardEmployee(emp, matrix = []) {
  if (isGuardGroup(emp)) return true;
  return isFieldGuardRank(matrix, emp.rank);
}

function isOnMaternityLeave(emp) {
  return Boolean(emp.maternity_leave) && !isGuardGroup(emp);
}

function isOperationalActive(emp, matrix = []) {
  if (isResigned(emp) || !isHrActive(emp)) return false;
  if (isOnMaternityLeave(emp)) return true;
  if (!isGuardEmployee(emp, matrix)) return false;
  return Boolean(emp.has_recent_shift);
}

function isOperationalInactive(emp, matrix = []) {
  if (isResigned(emp) || !isHrActive(emp)) return false;
  if (isOnMaternityLeave(emp)) return false;
  if (!isGuardEmployee(emp, matrix)) return false;
  return !emp.has_recent_shift;
}

function mnrTableStatusLabel(emp, matrix = []) {
  if (isOnMaternityLeave(emp) && isHrActive(emp)) return "Mat.";
  if (isGuardEmployee(emp, matrix)) return emp.status || "ACTIVE";
  if (normStatus(emp).toUpperCase() === "ACTIVE") return "—";
  return emp.status || "—";
}

function daysUntilExpiry(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function hasHrDocument(emp, column) {
  return Boolean(emp[column]?.trim());
}

function nicPassportVettingState(emp) {
  if (!hasHrDocument(emp, "nic_passport_doc_url")) return "expired";
  return null;
}

function policeClearanceVettingState(emp) {
  if (!hasHrDocument(emp, "police_clearance_url")) return "expired";
  const polDays = daysUntilExpiry(emp.police_expiry);
  if (polDays === null) return "expired";
  if (polDays < 0) return "expired";
  if (polDays <= 45) return "expiring";
  return null;
}

function vettingBucket(emp) {
  const states = [];
  const nicState = nicPassportVettingState(emp);
  const polState = policeClearanceVettingState(emp);
  if (nicState) states.push(nicState);
  if (polState) states.push(polState);
  if (states.length === 0) return null;
  if (states.some((s) => s === "expired")) return "expired";
  return "expiring";
}

function isVettingExpiring(emp, matrix = []) {
  return (
    isHrActive(emp) &&
    isGuardEmployee(emp, matrix) &&
    vettingBucket(emp) === "expiring"
  );
}

function isVettingExpired(emp, matrix = []) {
  return (
    isHrActive(emp) &&
    isGuardEmployee(emp, matrix) &&
    vettingBucket(emp) === "expired"
  );
}

function guardScoreBadgeClass(tier) {
  if (tier === "gold") return "bg-amber-50 border-amber-200 text-amber-900";
  if (tier === "silver") return "bg-slate-100 border-slate-300 text-slate-700";
  if (tier === "bronze") return "bg-orange-50 border-orange-200 text-orange-800";
  if (tier === "risk") return "bg-red-50 border-red-200 text-red-700";
  return "bg-slate-100 border-slate-300 text-slate-700";
}

function GuardScoreBadge({ rating, tier }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${guardScoreBadgeClass(tier)}`}
    >
      Guard score {rating}
    </span>
  );
}

export default function MasterNominalRoll() {
  const [employees, setEmployees]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [searchQuery, setSearchQuery]       = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [personnelFilter, setPersonnelFilter] = useState("ALL");
  const [sortBy, setSortBy]                 = useState("name");
  const [sortDir, setSortDir]               = useState("asc");

  const [drawerEmp, setDrawerEmp]   = useState(null);
  const [drawerTab, setDrawerTab]   = useState("personal");
  const [drawerEditing, setDrawerEditing] = useState(false);
  const drawerEmpRef = useRef(null);
  const [canEditMnr, setCanEditMnr] = useState(false);
  const [canManageExecutive, setCanManageExecutive] = useState(false);
  const [mnrViewerRole, setMnrViewerRole] = useState(null);
  const [mnrViewerEmail, setMnrViewerEmail] = useState(null);
  const [mnrSignedIn, setMnrSignedIn] = useState(false);
  const [clearanceEmp, setClearanceEmp] = useState(null);
  const [mdRankMatrix, setMdRankMatrix] = useState([]);
  const [internalWorkLocations, setInternalWorkLocations] = useState({
    headOffice: [],
    cafe: [],
  });
  const [rejoinMeta, setRejoinMeta] = useState({
    blacklistedByEmployeeId: {},
    guardRatingByEmployeeId: {},
  });
  const [rejoinPendingId, setRejoinPendingId] = useState(null);
  const [isRejoinPending, startRejoinTransition] = useTransition();

  const requestIdRef = useRef(0);

  useEffect(() => {
    getRankPayMatrix().then(setMdRankMatrix).catch(() => setMdRankMatrix([]));
    getInternalWorkLocationsForMnr()
      .then(setInternalWorkLocations)
      .catch(() => setInternalWorkLocations({ headOffice: [], cafe: [] }));
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

  const refreshRejoinMeta = useCallback(async (list) => {
    const resignedIds = list.filter(isResigned).map((emp) => emp.id);
    if (!resignedIds.length) {
      setRejoinMeta({ blacklistedByEmployeeId: {}, guardRatingByEmployeeId: {} });
      return;
    }
    try {
      const meta = await getMnrRejoinDeskMeta(resignedIds);
      setRejoinMeta(meta);
    } catch {
      setRejoinMeta({ blacklistedByEmployeeId: {}, guardRatingByEmployeeId: {} });
    }
  }, []);

  useEffect(() => {
    if (employees.length) refreshRejoinMeta(employees);
  }, [employees, refreshRejoinMeta]);

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

  const canViewEmployee = useCallback(
    (emp) => canViewMnrEmployee(mnrViewerRole, emp?.rank),
    [mnrViewerRole],
  );

  const canEditEmployee = useCallback(
    (emp) => canEditMnr && canEditMnrEmployee(mnrViewerRole, emp?.rank),
    [canEditMnr, mnrViewerRole],
  );

  const openSectionDrawer = (emp, tab, edit = false) => {
    if (!canViewEmployee(emp)) return;
    drawerEmpRef.current = emp;
    setDrawerEmp(emp);
    setDrawerTab(tab);
    setDrawerEditing(Boolean(edit && canEditEmployee(emp)));
  };

  const openProfileDrawer = (emp) => openSectionDrawer(emp, "personal", false);

  const openEditDrawer = (emp) => {
    openSectionDrawer(emp, "personal", true);
  };

  const handleRejoinEmployee = (emp) => {
    if (!canEditEmployee(emp)) return;
    if (rejoinMeta.blacklistedByEmployeeId[emp.id]) {
      window.alert(
        "This guard is blacklisted and cannot be rejoined until MD or OD approves removal from the blacklist vault.",
      );
      return;
    }

    const score = rejoinMeta.guardRatingByEmployeeId[emp.id];
    const scoreLine =
      isGuardEmployee(emp, mdRankMatrix) && score
        ? `\n\nGuard score: ${score.rating}/100 (${score.tier})`
        : "";
    const confirmed = window.confirm(
      `Rejoin ${emp.full_name} to active duty?${scoreLine}\n\nTheir status will return to ACTIVE in the Master Nominal Roll.`,
    );
    if (!confirmed) return;

    setRejoinPendingId(emp.id);
    startRejoinTransition(async () => {
      const result = await rejoinEmployee(emp.id);
      if (!result.ok) {
        setErrorMessage(result.error ?? "Failed to rejoin employee.");
        setRejoinPendingId(null);
        return;
      }
      const data = await fetchEmployees();
      if (data) await refreshRejoinMeta(data);
      setPersonnelFilter("ALL");
      setRejoinPendingId(null);
    });
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

    if (personnelFilter === "ACTIVE") result = result.filter((e) => isOperationalActive(e, mdRankMatrix));
    if (personnelFilter === "INACTIVE") result = result.filter((e) => isOperationalInactive(e, mdRankMatrix));
    if (personnelFilter === "RESIGNED") result = result.filter(isResigned);
    if (personnelFilter === "VETTING_EXPIRING") {
      result = result.filter((e) => isVettingExpiring(e, mdRankMatrix));
    }
    if (personnelFilter === "VETTING_EXPIRED") {
      result = result.filter((e) => isVettingExpired(e, mdRankMatrix));
    }

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

  const activePersonnelCount = employees.filter((e) => isOperationalActive(e, mdRankMatrix)).length;
  const inactiveCount        = employees.filter((e) => isOperationalInactive(e, mdRankMatrix)).length;
  const resignedCount        = employees.filter(isResigned).length;
  const expiringCount        = employees.filter((e) => isVettingExpiring(e, mdRankMatrix)).length;
  const expiredCount         = employees.filter((e) => isVettingExpired(e, mdRankMatrix)).length;

  const PERSONNEL_CARDS = [
    {
      key: "ACTIVE",
      label: "Active Personnel",
      sub: "Shift in last 14 days · guards only",
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
      sub: "No shift 14 days · guards only",
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
      sub: "Search & rejoin · offboarded",
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
      sub: "NIC / Passport & Police ≤ 45 days · guards only",
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
      sub: "NIC / Passport or police overdue · guards only",
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
                {mnrViewerRole
                  ? ` — signed in as ${mnrViewerRole}`
                  : " — read-only access for your rank"}
              </p>
              <p className="font-medium text-amber-800">
                Edit pencil appears when your rank is HR, MD, OD, or FM.
              </p>
            </div>
          )}

          <HrHubPills />

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
                      <EmployeeMnrPhoto photoUrl={emp.id_photo_url} name={emp.full_name} size="sm" />
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
                        isOperationalActive(emp, mdRankMatrix)
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {mnrTableStatusLabel(emp, mdRankMatrix)}
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

          {personnelFilter === "RESIGNED" && (
            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-xs font-semibold text-violet-900">
              Search by name, NIC, EPF, or passport to find a former employee. Guards show their
              12-month score; blacklisted guards are highlighted and cannot be rejoined until MD or
              OD clears the blacklist vault.
            </div>
          )}
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
          <PortalLoadingScreen accent="rose" fullscreen={false} />
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
                    <col className="w-16" />
                    <col className="w-[26%]" />
                    <col className="w-[11%]" />
                    <col className="w-[18%]" />
                    <col className="w-[11%]" />
                    <col className="w-[14%]" />
                    <col className="w-[20%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-3 py-2 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">EPF No</th>
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
                      filteredEmployees.map((emp) => {
                        const execLocked = isExecutiveRank(emp.rank) && !canManageExecutive;
                        const canView = canViewEmployee(emp);
                        const blacklistEntry = rejoinMeta.blacklistedByEmployeeId[emp.id];
                        const guardScore = rejoinMeta.guardRatingByEmployeeId[emp.id];
                        const showRejoinDesk = personnelFilter === "RESIGNED" && isResigned(emp);
                        const rejoinBusy = rejoinPendingId === emp.id && isRejoinPending;
                        return (
                        <tr
                          key={emp.id}
                          role={canView ? "button" : undefined}
                          tabIndex={canView ? 0 : undefined}
                          onClick={canView ? () => openProfileDrawer(emp) : undefined}
                          onKeyDown={canView ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openProfileDrawer(emp);
                            }
                          } : undefined}
                          title={
                            blacklistEntry
                              ? `Blacklisted: ${blacklistEntry.reason || "No reason recorded"}`
                              : execLocked
                                ? "MD / OD records — MD or OD only"
                                : undefined
                          }
                          className={`transition-colors align-middle ${
                            blacklistEntry
                              ? "bg-red-50/80 ring-1 ring-inset ring-red-200"
                              : canView
                                ? "hover:bg-slate-50 cursor-pointer"
                                : "cursor-not-allowed opacity-75"
                          }`}
                        >
                          <td className="px-3 py-2 align-middle text-slate-500 font-mono text-[10px] tabular-nums truncate" title={employeeEpfNo(emp) || undefined}>
                            {employeeEpfNo(emp) || "—"}
                          </td>
                          <td className="px-3 py-2 align-middle min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <EmployeeMnrPhoto photoUrl={emp.id_photo_url} name={emp.full_name} size="xs" />
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                isOperationalActive(emp, mdRankMatrix) ? "bg-emerald-500" : isResigned(emp) ? "bg-violet-400" : "bg-slate-300"
                              }`} />
                              <div className="min-w-0">
                                <p className="font-bold text-slate-900 text-xs truncate">{emp.full_name}</p>
                                {showRejoinDesk && blacklistEntry ? (
                                  <span className="mt-1 inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-red-800">
                                    <ShieldAlert className="h-3 w-3 shrink-0" />
                                    Blacklisted
                                  </span>
                                ) : null}
                                {showRejoinDesk && isGuardEmployee(emp, mdRankMatrix) && guardScore ? (
                                  <span className="mt-1 block">
                                    <GuardScoreBadge rating={guardScore.rating} tier={guardScore.tier} />
                                  </span>
                                ) : null}
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
                                : isOnMaternityLeave(emp)
                                  ? "bg-pink-50 text-pink-700 border border-pink-200"
                                  : isGuardEmployee(emp, mdRankMatrix) && isOperationalInactive(emp, mdRankMatrix)
                                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                                    : isGuardEmployee(emp, mdRankMatrix) && isOperationalActive(emp, mdRankMatrix)
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-slate-100 text-slate-600 border border-slate-200"
                            }`}>
                              {isGuardEmployee(emp, mdRankMatrix) && !isResigned(emp) && !isOnMaternityLeave(emp) ? (
                                isOperationalActive(emp, mdRankMatrix) ? (
                                  <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                                ) : (
                                  <XCircle className="w-2.5 h-2.5 shrink-0" />
                                )
                              ) : null}
                              <span className="truncate max-w-[5.5rem]">{mnrTableStatusLabel(emp, mdRankMatrix)}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0.5 flex-nowrap">
                              {showRejoinDesk && canEditEmployee(emp) && !blacklistEntry ? (
                                <button
                                  type="button"
                                  title="Rejoin to active duty"
                                  disabled={rejoinBusy}
                                  onClick={() => handleRejoinEmployee(emp)}
                                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                                >
                                  {rejoinBusy ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <UserPlus className="h-3 w-3" />
                                  )}
                                  Rejoin
                                </button>
                              ) : null}
                              {canEditEmployee(emp) && (
                                <ActionBtn
                                  icon={Pencil}
                                  title="Edit employee"
                                  color="rose"
                                  onClick={() => openEditDrawer(emp)}
                                />
                              )}
                              {execLocked && (
                                <span
                                  title="MD / OD records — MD or OD only"
                                  className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md"
                                >
                                  Exec
                                </span>
                              )}
                              {!execLocked && (
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
                              )}
                            </div>
                          </td>
                        </tr>
                        );
                      })
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
          onTabChange={setDrawerTab}
          onClose={() => {
            drawerEmpRef.current = null;
            setDrawerEmp(null);
            setDrawerEditing(false);
          }}
          onToggleEdit={() => setDrawerEditing((v) => !v)}
          onSaved={async ({ closeDrawer = false } = {}) => {
            setDrawerEditing(false);
            if (closeDrawer) {
              drawerEmpRef.current = null;
              setDrawerEmp(null);
            }
            const data = await fetchEmployees();
            if (closeDrawer || !data) return;
            setDrawerEmp((current) => {
              if (!current) return null;
              const fresh = data.find((e) => e.id === current.id);
              if (fresh) drawerEmpRef.current = fresh;
              return fresh ?? current;
            });
          }}
          onOpenClearanceSummary={(employee) => setClearanceEmp(employee)}
          mdRankMatrix={mdRankMatrix}
          internalWorkLocations={internalWorkLocations}
          allEmployees={employees}
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

const CORPORATE_GROUP_OPTIONS = [
  { value: "GUARD", label: "Guard" },
  { value: "SECTOR_MANAGER", label: "Sector Manager" },
  { value: "HEAD_OFFICE", label: "Head Office" },
  { value: "CAFE", label: "Café" },
];

function normalizeCorporateGroup(value) {
  const v = String(value || "").trim().toUpperCase();
  return v === "GUARD_FIELD" ? "GUARD" : v;
}

function isHeadOfficeGroup(emp) {
  return normalizeCorporateGroup(emp?.group) === "HEAD_OFFICE";
}

function isCafeGroup(emp) {
  return normalizeCorporateGroup(emp?.group) === "CAFE";
}

function isInternalLocationGroup(group) {
  const normalized = normalizeCorporateGroup(group);
  return normalized === "HEAD_OFFICE" || normalized === "CAFE";
}

const SALARY_TYPE_OPTIONS = [
  { value: "BANK", label: "Bank Transfer" },
  { value: "CASH", label: "Cash Allocation" },
];

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];

const NATIONALITY_OPTIONS = [
  { value: "SRI LANKAN", label: "Sri Lankan" },
  { value: "INDIAN", label: "Indian" },
  { value: "PAKISTANI", label: "Pakistani" },
  { value: "BANGLADESHI", label: "Bangladeshi" },
  { value: "NEPALESE", label: "Nepalese" },
  { value: "FILIPINO", label: "Filipino" },
  { value: "OTHER", label: "Other" },
];

const RELIGION_OPTIONS = [
  { value: "BUDDHIST", label: "Buddhist" },
  { value: "CHRISTIAN", label: "Christian" },
  { value: "ROMAN CATHOLIC", label: "Roman Catholic" },
  { value: "MUSLIM", label: "Muslim" },
  { value: "HINDU", label: "Hindu" },
  { value: "ATHEIST", label: "Atheist" },
  { value: "OTHER", label: "Other" },
];

const SITE_OPTIONS = [
  "Unassigned (Bench)",
  "Lanka Hospitals",
  "Commercial Bank HQ",
  "Cargills HQ",
  "BOC Main Branch",
  "Hemas Holdings",
];

function defaultSiteForRank(matrix, rank, currentSite) {
  if (currentSite) return currentSite;
  return isFieldGuardRank(matrix, rank) ? "Unassigned (Bench)" : "";
}

function corporateGroupLabel(value) {
  if (!value) return null;
  const normalized = normalizeCorporateGroup(value);
  const hit = CORPORATE_GROUP_OPTIONS.find((o) => o.value === normalized);
  return hit?.label ?? value;
}

function salaryTypeLabel(value) {
  if (!value) return null;
  const hit = SALARY_TYPE_OPTIONS.find(
    (o) => o.value === String(value).trim().toUpperCase(),
  );
  return hit?.label ?? value;
}

function EmployeeMnrPhoto({ photoUrl, name, size = "sm" }) {
  const dim =
    size === "xs" ? "h-7 w-7" : size === "md" ? "h-10 w-10" : "h-8 w-8";
  const url = typeof photoUrl === "string" ? photoUrl.trim() : "";
  if (url) {
    return (
      <img
        src={url}
        alt={name ? `${name} ID photo` : "Employee ID photo"}
        className={`${dim} shrink-0 rounded-md object-cover border border-slate-200 bg-slate-100`}
      />
    );
  }
  return (
    <div
      className={`${dim} shrink-0 rounded-md bg-black border border-slate-900`}
      role="img"
      aria-label={name ? `${name} — no ID photo` : "No ID photo"}
    />
  );
}

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
  onOpenClearanceSummary,
  mdRankMatrix,
  internalWorkLocations,
  allEmployees,
}) {
  const formRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [epfDuplicate, setEpfDuplicate] = useState(null);
  const [emailDuplicate, setEmailDuplicate] = useState(null);
  const [previousEpfNo, setPreviousEpfNo] = useState("");
  const [priorNicMatches, setPriorNicMatches] = useState([]);
  const [nicLookupLoading, setNicLookupLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState(null);
  const pendingNavRef = useRef(null);
  const [formKey, setFormKey] = useState(0);
  const [editRank, setEditRank] = useState("");
  const [editGroup, setEditGroup] = useState("");
  const [editSite, setEditSite] = useState("");
  const [editBaseSalary, setEditBaseSalary] = useState("");
  const today   = new Date();
  const daysDiff = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  useEffect(() => {
    setDirty(false);
    pendingNavRef.current = null;
    setPendingNav(null);
    setSaveError("");
    setEpfDuplicate(null);
    setEmailDuplicate(null);
  }, [emp.id]);

  useEffect(() => {
    const rank = (emp.rank || "").trim().toUpperCase();
    const group = normalizeCorporateGroup(emp.group);
    setEditRank(rank);
    setEditGroup(group);
    setEditSite(defaultSiteForRank(mdRankMatrix, rank, emp.site || ""));
    setEditBaseSalary(
      emp.base_salary != null && emp.base_salary !== "" ? String(emp.base_salary) : "",
    );
    setPreviousEpfNo(emp.previous_epf_no ?? "");
    setPriorNicMatches([]);
  }, [emp.id, emp.rank, emp.group, emp.site, emp.base_salary, emp.previous_epf_no, formKey, mdRankMatrix]);

  const siteApplicable = isFieldGuardRank(mdRankMatrix, editRank);
  const internalLocationApplicable = isInternalLocationGroup(editGroup);
  const internalLocationOptions =
    normalizeCorporateGroup(editGroup) === "HEAD_OFFICE"
      ? internalWorkLocations.headOffice
      : normalizeCorporateGroup(editGroup) === "CAFE"
        ? internalWorkLocations.cafe
        : [];
  const internalLocationLabel =
    normalizeCorporateGroup(editGroup) === "HEAD_OFFICE"
      ? "Head Office Branch"
      : "Café Branch";

  const handleEditRankChange = (e) => {
    const newRank = e.target.value;
    setEditRank(newRank);
    const entry = findRankPayEntry(mdRankMatrix, newRank);
    if (entry?.basicPay > 0) {
      setEditBaseSalary(String(entry.basicPay));
    }
    if (isFieldGuardRank(mdRankMatrix, newRank)) {
      setEditSite((prev) => prev || "Unassigned (Bench)");
    } else if (!isInternalLocationGroup(editGroup)) {
      setEditSite("");
    }
    setDirty(true);
  };

  const handleEditGroupChange = (e) => {
    const newGroup = normalizeCorporateGroup(e.target.value);
    setEditGroup(newGroup);
    if (isInternalLocationGroup(newGroup)) {
      setEditSite("");
    } else if (isFieldGuardRank(mdRankMatrix, editRank)) {
      setEditSite((prev) => prev || "Unassigned (Bench)");
    } else {
      setEditSite("");
    }
    setDirty(true);
  };

  const activeMeta = sectionEditMeta(emp, activeTab);
  const activeEdited = formatSectionEdited(activeMeta?.at);

  const tabPanelClass = (key) => (activeTab === key ? "space-y-4" : "hidden");

  const dismissUnsavedDialog = ({ resetForm = false, exitEdit = false } = {}) => {
    if (resetForm) setFormKey((k) => k + 1);
    setDirty(false);
    pendingNavRef.current = null;
    setPendingNav(null);
    if (exitEdit && editing) onToggleEdit();
  };

  const completePendingNav = (nav) => {
    if (!nav) return;
    if (nav.type === "close") onClose();
    else if (nav.type === "tab") onTabChange(nav.key);
    else if (nav.type === "view") onToggleEdit();
  };

  const requestNav = (action) => {
    if (editing && dirty && action.type === "close") {
      pendingNavRef.current = action;
      setPendingNav(action);
      return;
    }
    if (action.type === "close") onClose();
    else if (action.type === "tab") onTabChange(action.key);
    else if (action.type === "view") onToggleEdit();
  };

  const isOwnRecord =
    viewerEmail &&
    emp.email &&
    viewerEmail === String(emp.email).trim().toLowerCase();
  const canUploadIdPhoto = canEdit || Boolean(isOwnRecord);
  const canEditWorkEmail =
    isHeadOfficeGroup(emp) &&
    (!isExecutiveRank(emp.rank) || canManageExecutive);

  const handleNicBlur = async (nic) => {
    const trimmed = String(nic ?? "").trim();
    if (!isNicLookupReady(trimmed)) {
      setPriorNicMatches([]);
      return;
    }
    setNicLookupLoading(true);
    try {
      const { matches } = await lookupPriorRecordsByNic(trimmed, emp.id);
      const others = matches.filter((m) => m.id !== emp.id);
      setPriorNicMatches(others);
      if (others.length > 0 && !previousEpfNo.trim()) {
        setPreviousEpfNo(others[0].epfNo ?? "");
      }
    } catch {
      setPriorNicMatches([]);
    } finally {
      setNicLookupLoading(false);
    }
  };

  const submitSave = async () => {
    const form = formRef.current;
    if (!canEdit || !editing || !form) return false;
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    const missing = [];
    if (!String(payload.full_name ?? "").trim()) missing.push("Full name");
    if (!String(payload.nic ?? "").trim()) missing.push("NIC");
    if (!String(payload.phone ?? "").trim()) missing.push("Phone");
    if (canEditWorkEmail && !String(payload.email ?? "").trim()) missing.push("Work email");
    if (missing.length) {
      setSaveError(`Required: ${missing.join(", ")}.`);
      return false;
    }
    const epfOwner = findEpfNoOwner(payload.epf_no, emp.id, allEmployees);
    if (epfOwner) {
      setEpfDuplicate(epfOwner);
      setSaveError(`EPF number is already in use by ${epfOwner.full_name}.`);
      return false;
    }
    if (
      payload.epf_no &&
      payload.previous_epf_no &&
      normalizeEpfNo(payload.epf_no) === normalizeEpfNo(payload.previous_epf_no)
    ) {
      setSaveError("New EPF number must differ from the previous EPF number.");
      return false;
    }
    if (canEditWorkEmail) {
      const emailOwner = findWorkEmailOwner(payload.email, emp.id, allEmployees);
      if (emailOwner) {
        setEmailDuplicate(emailOwner);
        setSaveError(`Work email is already in use by ${emailOwner.full_name}.`);
        return false;
      }
    }
    setSaving(true);
    setSaveError("");
    try {
      await saveEmployeeAll(emp.id, payload);
      setDirty(false);
      return true;
    } catch (err) {
      setSaveError(err?.message || "Failed to save.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async (e) => {
    e?.preventDefault?.();
    const ok = await submitSave();
    if (ok) onSaved();
  };

  const handleSaveFromDialog = async () => {
    const nav = pendingNavRef.current ?? pendingNav;
    const closing = nav?.type === "close";
    const ok = await submitSave();
    if (!ok) return;
    dismissUnsavedDialog();
    if (closing) onClose();
    else completePendingNav(nav);
    onSaved({ closeDrawer: closing });
  };

  const handleDiscardFromDialog = () => {
    const nav = pendingNavRef.current ?? pendingNav;
    dismissUnsavedDialog({ resetForm: true, exitEdit: true });
    if (nav?.type === "close") onClose();
    else completePendingNav(nav);
  };

  const inputClass =
    "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 outline-none";

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => requestNav({ type: "close" })} />

      <aside className="relative ml-auto w-full max-w-lg h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-white to-rose-50/40 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <EmployeeMnrPhoto photoUrl={emp.id_photo_url} name={emp.full_name} size="md" />
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
            {editing && canEdit && (
              <button
                type="button"
                disabled={saving || Boolean(epfDuplicate) || Boolean(emailDuplicate)}
                onClick={() => void handleSaveAll()}
                className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50 shrink-0"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            )}
            {canEdit ? (
              <button
                type="button"
                onClick={() => requestNav({ type: "view" })}
                title={editing ? "Switch to view mode" : "Edit employee"}
                aria-label={editing ? "Switch to view mode" : "Edit employee"}
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
              type="button"
              onClick={() => requestNav({ type: "close" })}
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
              type="button"
              onClick={() => requestNav({ type: "tab", key: tab.key })}
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
            <form
              key={formKey}
              ref={formRef}
              noValidate
              onSubmit={handleSaveAll}
              onInput={() => setDirty(true)}
              onChange={() => setDirty(true)}
              className="space-y-4"
            >
              <div className={tabPanelClass("personal")}>
                <EmployeeIdPhotoField
                  employeeId={emp.id}
                  photoUrl={emp.id_photo_url}
                  canUpload={canUploadIdPhoto}
                  onUploaded={onSaved}
                />
                <EditField label="Full Name" name="full_name" defaultValue={emp.full_name} required inputClass={inputClass} />
                <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
                  <WorkEmailEditField
                    name="email"
                    defaultValue={emp.email}
                    employeeId={emp.id}
                    allEmployees={allEmployees}
                    inputClass={inputClass}
                    readOnly={!canEditWorkEmail}
                    required={canEditWorkEmail}
                    onDuplicateChange={setEmailDuplicate}
                  />
                  {!isHeadOfficeGroup(emp) && (
                    <p className="text-[10px] text-slate-500 font-bold">
                      Work email is only for Head Office staff (back-office portal login). Set corporate group to Head Office on the Employment tab first.
                    </p>
                  )}
                  {isHeadOfficeGroup(emp) && isExecutiveRank(emp.rank) && !canManageExecutive && (
                    <p className="text-[10px] text-amber-800 font-bold">
                      MD / OD work email can only be changed by MD or OD.
                    </p>
                  )}
                </div>
                <NicEditField
                  label="NIC"
                  name="nic"
                  defaultValue={emp.nic}
                  required
                  mono
                  inputClass={inputClass}
                  onBlurLookup={handleNicBlur}
                  lookupLoading={nicLookupLoading}
                />
                {priorNicMatches.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-900">
                    Prior record(s) for this NIC — check blacklist and performance before saving.
                  </div>
                ) : null}
                <EditField label="Passport No" name="passport_no" defaultValue={emp.passport_no} mono inputClass={inputClass} />
                <EpfNoEditField
                  name="epf_no"
                  defaultValue={employeeEpfNo(emp)}
                  employeeId={emp.id}
                  allEmployees={allEmployees}
                  inputClass={inputClass}
                  onDuplicateChange={setEpfDuplicate}
                />
                <EditField
                  label="Previous EPF No"
                  name="previous_epf_no"
                  value={previousEpfNo}
                  onChange={(e) => setPreviousEpfNo(e.target.value)}
                  mono
                  readOnly={priorNicMatches.length > 0}
                  inputClass={priorNicMatches.length > 0 ? `${inputClass} bg-slate-50` : inputClass}
                />
                <EditField label="Date of Birth" name="dob" type="date" defaultValue={emp.dob} inputClass={inputClass} />
                <EnumSelectField
                  label="Gender"
                  name="gender"
                  defaultValue={emp.gender}
                  options={GENDER_OPTIONS}
                  placeholder="Select gender…"
                  inputClass={inputClass}
                />
                <EnumSelectField
                  label="Nationality"
                  name="nationality"
                  defaultValue={emp.nationality || "SRI LANKAN"}
                  options={NATIONALITY_OPTIONS}
                  placeholder="Select nationality…"
                  inputClass={inputClass}
                />
                <EnumSelectField
                  label="Religion"
                  name="religion"
                  defaultValue={emp.religion}
                  options={RELIGION_OPTIONS}
                  placeholder="Select religion…"
                  inputClass={inputClass}
                />
                <EditField label="Phone" name="phone" defaultValue={emp.phone} required mono inputClass={inputClass} />
                <EditField label="Home Address" name="home_address" defaultValue={emp.home_address} multiline inputClass={inputClass} />
              </div>

              <div className={tabPanelClass("employment")}>
                <RankSelectField
                  label="Rank"
                  name="rank"
                  value={editRank}
                  onChange={handleEditRankChange}
                  mdRankMatrix={mdRankMatrix}
                  viewerRole={viewerRole}
                  canManageExecutive={canManageExecutive}
                  inputClass={inputClass}
                />
                <CorporateGroupSelectField
                  label="Corporate Group"
                  name="group"
                  value={editGroup}
                  onChange={handleEditGroupChange}
                  inputClass={inputClass}
                />
                {siteApplicable && !internalLocationApplicable ? (
                  <SiteSelectField
                    label="Assigned Site"
                    name="site"
                    value={editSite}
                    onChange={(e) => {
                      setEditSite(e.target.value);
                      setDirty(true);
                    }}
                    applicable
                    inputClass={inputClass}
                  />
                ) : null}
                {internalLocationApplicable ? (
                  <InternalLocationSelectField
                    label={internalLocationLabel}
                    name="site"
                    value={editSite}
                    onChange={(e) => {
                      setEditSite(e.target.value);
                      setDirty(true);
                    }}
                    applicable
                    options={internalLocationOptions}
                    inputClass={inputClass}
                  />
                ) : null}
                {!siteApplicable && !internalLocationApplicable ? (
                  <input type="hidden" name="site" value="" />
                ) : null}
                <EditField label="Date Joined" name="date_joined" type="date" defaultValue={emp.date_joined} inputClass={inputClass} />
                <GuardStatusSelectField
                  emp={emp}
                  mdRankMatrix={mdRankMatrix}
                  inputClass={inputClass}
                />
                <EditField
                  label="Base Salary (LKR)"
                  name="base_salary"
                  type="number"
                  value={editBaseSalary}
                  onChange={(e) => {
                    setEditBaseSalary(e.target.value);
                    setDirty(true);
                  }}
                  inputClass={inputClass}
                />
                <EditField label="Site Allowance (LKR)" name="site_allowance_lkr" type="number" defaultValue={emp.site_allowance_lkr} inputClass={inputClass} />
                <EditField label="Meal Allowance (LKR)" name="meal_allowance_lkr" type="number" defaultValue={emp.meal_allowance_lkr} inputClass={inputClass} />
                <EditField label="Transport Allowance (LKR)" name="transport_allowance_lkr" type="number" defaultValue={emp.transport_allowance_lkr} inputClass={inputClass} />
                <SalaryTypeSelectField
                  label="Salary Type"
                  name="salary_type"
                  defaultValue={emp.salary_type}
                  inputClass={inputClass}
                />
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
              </div>

              <div className={tabPanelClass("bank")}>
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 mb-2">
                  <p className="text-xs font-black text-emerald-700 uppercase tracking-widest mb-0.5">Salary Account</p>
                  <p className="text-slate-500 text-xs font-bold">Confidential — HR portal editors only</p>
                </div>
                <EditField label="Bank Code" name="bank_code" defaultValue={emp.bank_code} mono inputClass={inputClass} />
                <EditField label="Branch Code" name="branch_code" defaultValue={emp.branch_code} mono inputClass={inputClass} />
                <EditField label="Account Number" name="account_number" defaultValue={emp.account_number} mono inputClass={inputClass} />
              </div>

              <div className={tabPanelClass("vetting")}>
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
              </div>
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
                  <DetailRow label="Work Email"   value={emp.email} preserveCase />
                  <DetailRow label="NIC"          value={emp.nic}         mono />
                  <DetailRow label="Passport No"  value={emp.passport_no} mono />
                  <DetailRow label="EPF No"       value={employeeEpfNo(emp) || (emp.epf_yn ? "EPF Member (no number recorded)" : "Non-EPF")} />
                  <DetailRow label="Previous EPF" value={emp.previous_epf_no} mono />
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
                  <DetailRow label="Corporate Group" value={corporateGroupLabel(emp.group)} />
                  <DetailRow
                    label={isInternalLocationGroup(emp.group) ? (isHeadOfficeGroup(emp) ? "Head Office Branch" : "Café Branch") : "Assigned Site"}
                    value={emp.site}
                  />
                  <DetailRow label="Date Joined"     value={emp.date_joined} />
                  <DetailRow
                    label="Status"
                    value={
                      isGuardEmployee(emp, mdRankMatrix)
                        ? emp.status
                        : normStatus(emp).toUpperCase() === "ACTIVE"
                          ? null
                          : emp.status
                    }
                    badge={
                      isGuardEmployee(emp, mdRankMatrix) && isHrActive(emp)
                        ? "active"
                        : isGuardEmployee(emp, mdRankMatrix)
                          ? "inactive"
                          : undefined
                    }
                  />
                  <DetailRow
                    label="Last 14 Days"
                    value={
                      isGuardEmployee(emp, mdRankMatrix)
                        ? (emp.has_recent_shift ? "Shift recorded" : "No shift recorded")
                        : "Guards only"
                    }
                  />
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
                  <DetailRow label="Site Allowance"  value={emp.site_allowance_lkr ? `LKR ${Number(emp.site_allowance_lkr).toLocaleString()}` : null} />
                  <DetailRow label="Meal Allowance"  value={emp.meal_allowance_lkr ? `LKR ${Number(emp.meal_allowance_lkr).toLocaleString()}` : null} />
                  <DetailRow label="Transport Allowance" value={emp.transport_allowance_lkr ? `LKR ${Number(emp.transport_allowance_lkr).toLocaleString()}` : null} />
                  <DetailRow label="Salary Type"     value={salaryTypeLabel(emp.salary_type)} />
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
                    documentUrl={emp.mod_clearance_url}
                  />
                  <VettingCard
                    label="Police Clearance"
                    expiryDate={emp.police_expiry}
                    days={daysDiff(emp.police_expiry)}
                    documentUrl={emp.police_clearance_url}
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

        {pendingNav && (
          <div className="absolute inset-0 z-10 flex items-end sm:items-center justify-center p-4 bg-slate-900/20">
            <div
              role="dialog"
              aria-labelledby="unsaved-changes-title"
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4"
            >
              <div>
                <p id="unsaved-changes-title" className="text-sm font-black text-slate-900 uppercase tracking-wide">
                  Unsaved changes
                </p>
                <p className="text-xs text-slate-500 font-bold mt-1">
                  Save your changes, discard them, or keep editing this profile.
                </p>
              </div>
              {saveError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
                  {saveError}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={saving || Boolean(epfDuplicate) || Boolean(emailDuplicate)}
                  onClick={() => void handleSaveFromDialog()}
                  className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleDiscardFromDialog}
                  className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-50"
                >
                  Discard
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    pendingNavRef.current = null;
                    setPendingNav(null);
                  }}
                  className="w-full py-2 text-slate-500 text-xs font-bold hover:text-slate-800 disabled:opacity-50"
                >
                  Keep editing
                </button>
              </div>
            </div>
          </div>
        )}
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

function EnumSelectField({
  label,
  name,
  defaultValue,
  options,
  placeholder,
  inputClass,
  allowLegacy = true,
}) {
  const normalized = (defaultValue || "").trim().toUpperCase();
  const knownValues = options.map((o) => o.value);
  const inList = knownValues.includes(normalized);
  const legacy = allowLegacy && normalized && !inList ? normalized : "";

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">{label}</label>
      {legacy && (
        <p className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
          Current value &ldquo;{legacy}&rdquo; is non-standard. Select a valid option below.
        </p>
      )}
      <select
        name={name}
        defaultValue={inList ? normalized : legacy || ""}
        className={inputClass}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {legacy && <option value={legacy}>{legacy}</option>}
      </select>
    </div>
  );
}

function GuardStatusSelectField({ emp, mdRankMatrix, inputClass }) {
  const applicable = isGuardEmployee(emp, mdRankMatrix);
  const current = (emp.status || "").trim();

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Status</label>
      {applicable ? (
        <>
          <select
            name="status"
            defaultValue={current || "ACTIVE"}
            className={inputClass}
          >
            {HR_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            {current && !HR_STATUS_OPTIONS.includes(current) && (
              <option value={current}>{current}</option>
            )}
          </select>
          <p className="text-[10px] text-slate-500 font-bold">
            ACTIVE guards flow to OM site assignment, SM shifts, and TM verification.
          </p>
        </>
      ) : (
        <>
          <input type="hidden" name="status" value={current} />
          <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-400">
            ACTIVE status applies to field guards only
          </div>
          {current && normStatus(emp).toUpperCase() !== "ACTIVE" && (
            <p className="text-[10px] text-slate-500 font-bold">Current HR status: {current}</p>
          )}
        </>
      )}
    </div>
  );
}

function SiteSelectField({ label, name, value, onChange, applicable, inputClass }) {
  const normalized = (value || "").trim();
  const inList = SITE_OPTIONS.includes(normalized);
  const legacy = normalized && !inList ? normalized : "";

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">{label}</label>
      {applicable ? (
        <>
          {legacy && (
            <p className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              Current site &ldquo;{legacy}&rdquo; is not in the standard list. Pick a site below or keep the legacy value.
            </p>
          )}
          <select
            name={name}
            value={normalized || "Unassigned (Bench)"}
            onChange={onChange}
            className={inputClass}
          >
            {SITE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {legacy && <option value={legacy}>{legacy}</option>}
          </select>
        </>
      ) : null}
    </div>
  );
}

function InternalLocationSelectField({
  label,
  name,
  value,
  onChange,
  applicable,
  options,
  inputClass,
}) {
  const normalized = (value || "").trim();
  const optionNames = options.map((loc) => loc.name);
  const inList = optionNames.includes(normalized);
  const legacy = normalized && !inList ? normalized : "";

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">{label}</label>
      {applicable ? (
        <>
          {options.length === 0 ? (
            <p className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              No branches configured yet. Add GPS branches in MD Settings → Operations first.
            </p>
          ) : null}
          {legacy && (
            <p className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              Current branch &ldquo;{legacy}&rdquo; is not in the MD list. Pick a branch below or keep the legacy value.
            </p>
          )}
          <select
            name={name}
            value={normalized}
            onChange={onChange}
            required={options.length > 0}
            className={inputClass}
          >
            <option value="" disabled>
              Select branch…
            </option>
            {options.map((loc) => (
              <option key={loc.id} value={loc.name}>
                {loc.name}
              </option>
            ))}
            {legacy && <option value={legacy}>{legacy}</option>}
          </select>
        </>
      ) : null}
    </div>
  );
}

function SalaryTypeSelectField({ label, name, defaultValue, inputClass }) {
  const normalized = (defaultValue || "").trim().toUpperCase();
  const knownValues = SALARY_TYPE_OPTIONS.map((o) => o.value);
  const legacy = normalized && !knownValues.includes(normalized) ? normalized : "";

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">{label}</label>
      {legacy && (
        <p className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
          Current value &ldquo;{legacy}&rdquo; is non-standard. Select Bank or Cash below.
        </p>
      )}
      <select
        name={name}
        defaultValue={knownValues.includes(normalized) ? normalized : ""}
        required
        className={inputClass}
      >
        <option value="" disabled>
          Select payment route…
        </option>
        {SALARY_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {legacy && <option value={legacy}>{legacy}</option>}
      </select>
    </div>
  );
}

function CorporateGroupSelectField({ label, name, value, defaultValue, onChange, inputClass }) {
  const raw = (value ?? defaultValue ?? "").trim().toUpperCase();
  const normalized = normalizeCorporateGroup(raw);
  const knownValues = CORPORATE_GROUP_OPTIONS.map((o) => o.value);
  const legacy = raw && !knownValues.includes(raw) && normalized === raw ? raw : "";

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">{label}</label>
      {legacy && (
        <p className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
          Current group &ldquo;{legacy}&rdquo; is non-standard. Pick a corporate group below.
        </p>
      )}
      <select
        name={name}
        value={
          onChange
            ? knownValues.includes(normalized)
              ? normalized
              : legacy || normalized || ""
            : undefined
        }
        defaultValue={
          onChange
            ? undefined
            : knownValues.includes(normalized)
              ? normalized
              : legacy || normalized || ""
        }
        onChange={onChange}
        className={inputClass}
      >
        <option value="" disabled>
          Select corporate group…
        </option>
        {CORPORATE_GROUP_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {legacy && <option value={legacy}>{legacy}</option>}
      </select>
      <p className="text-[10px] text-slate-500 font-bold">
        Drives rank matrix, portal routing, and shift tracking. Rank is the pay grade within this group.
      </p>
    </div>
  );
}

function RankSelectField({
  label,
  name,
  defaultValue,
  value,
  onChange,
  mdRankMatrix,
  viewerRole,
  canManageExecutive,
  inputClass,
}) {
  const current = (value ?? defaultValue ?? "").trim().toUpperCase();
  const selectableMatrix = filterRanksForEditor(mdRankMatrix, viewerRole);
  const inMatrix = isRankInMatrix(selectableMatrix, current);
  const legacy = current && !inMatrix ? current : "";
  const controlled = value !== undefined;

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
        {...(controlled
          ? { value: inMatrix ? current : legacy || current || "" }
          : { defaultValue: inMatrix ? current : legacy || current || "" })}
        onChange={onChange}
        className={inputClass}
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

function WorkEmailEditField({
  name,
  defaultValue,
  employeeId,
  allEmployees,
  inputClass,
  readOnly = false,
  required = false,
  onDuplicateChange,
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const duplicate = readOnly ? null : findWorkEmailOwner(value, employeeId, allEmployees);

  useEffect(() => {
    setValue(defaultValue ?? "");
  }, [defaultValue, employeeId]);

  useEffect(() => {
    onDuplicateChange?.(duplicate);
  }, [duplicate, onDuplicateChange]);

  return (
    <>
      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
        Work Email (portal login)
      </label>
      <input
        type="email"
        name={name}
        value={value}
        readOnly={readOnly}
        required={required}
        onChange={(e) => setValue(e.target.value)}
        className={`${inputClass} ${duplicate ? "text-red-600 border-red-300 focus:ring-red-400" : ""}`}
      />
      {duplicate && (
        <p className="text-[10px] font-bold text-red-600">
          Work email already in use by {duplicate.full_name}
        </p>
      )}
    </>
  );
}

function NicEditField({
  label,
  name,
  defaultValue,
  required,
  mono,
  inputClass,
  onBlurLookup,
  lookupLoading,
}) {
  const [value, setValue] = useState(defaultValue ?? "");

  useEffect(() => {
    setValue(defaultValue ?? "");
  }, [defaultValue]);

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">{label}</label>
      <div className="relative">
        <input
          type="text"
          name={name}
          value={value}
          required={required}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          onBlur={() => onBlurLookup?.(value)}
          className={`${inputClass}${mono ? " font-mono tracking-wider" : ""}`}
        />
        {lookupLoading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
        ) : null}
      </div>
    </div>
  );
}

function EpfNoEditField({
  name,
  defaultValue,
  employeeId,
  allEmployees,
  inputClass,
  onDuplicateChange,
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const duplicate = findEpfNoOwner(value, employeeId, allEmployees);

  useEffect(() => {
    setValue(defaultValue ?? "");
  }, [defaultValue, employeeId]);

  useEffect(() => {
    onDuplicateChange?.(duplicate);
  }, [duplicate, onDuplicateChange]);

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">EPF No</label>
      <input
        type="text"
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={`${inputClass} font-mono tracking-wider ${
          duplicate ? "text-red-600 border-red-300 focus:ring-red-400" : ""
        }`}
      />
      {duplicate && (
        <p className="text-[10px] font-bold text-red-600">
          EPF number already in use by {duplicate.full_name}
        </p>
      )}
    </div>
  );
}

function EditField({ label, name, defaultValue, value, onChange, type = "text", required, mono, multiline, readOnly, inputClass, bare }) {
  const isEmail = type === "email";
  const controlled = value !== undefined;
  const inner = (
    <>
      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">{label}</label>
      {multiline ? (
        <textarea
          name={name}
          {...(controlled
            ? { value: value ?? "" }
            : { defaultValue: defaultValue ?? "" })}
          onChange={onChange}
          required={required}
          rows={3}
          className={`${inputClass} ${mono ? "font-mono" : ""}`}
        />
      ) : (
        <input
          type={type}
          name={name}
          {...(controlled
            ? { value: value ?? "" }
            : { defaultValue: defaultValue ?? "" })}
          onChange={onChange}
          required={required}
          readOnly={readOnly}
          autoCapitalize={isEmail ? "none" : undefined}
          autoCorrect={isEmail ? "off" : undefined}
          spellCheck={isEmail ? false : undefined}
          className={`${inputClass} ${mono ? "font-mono tracking-wider" : ""} ${isEmail ? "normal-case" : ""} ${readOnly ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
        />
      )}
    </>
  );

  if (bare) return inner;

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
      {inner}
    </div>
  );
}

function formatDetailValue(value) {
  if (value == null || value === "") return null;
  return String(value).toUpperCase();
}

function DetailRow({ label, value, mono, multiline, badge, preserveCase }) {
  const displayValue = preserveCase
    ? (value == null || value === "" ? null : String(value))
    : formatDetailValue(value);

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
          {displayValue}
        </span>
      ) : (
        <p className={`text-sm text-slate-900 font-bold ${preserveCase ? "normal-case" : "uppercase"} ${mono ? "font-mono tracking-wider" : ""} ${multiline ? "leading-relaxed" : ""}`}>
          {displayValue || <span className="text-slate-400">—</span>}
        </p>
      )}
    </div>
  );
}

function VettingCard({ label, expiryDate, days, documentUrl }) {
  const hasDoc = Boolean(documentUrl?.trim());

  let state = "ok";
  if (!hasDoc) state = "missing";
  else if (days === null || days === undefined) state = "unknown";
  else if (days < 0) state = "expired";
  else if (days <= 45) state = "expiring";

  const C = {
    ok:       { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", Icon: CheckCircle2 },
    expiring: { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-800",   Icon: Clock },
    expired:  { bg: "bg-red-50",     border: "border-red-200",     text: "text-red-700",     Icon: XCircle },
    unknown:  { bg: "bg-slate-50",   border: "border-slate-200",   text: "text-slate-600",   Icon: BadgeInfo },
    missing:  { bg: "bg-slate-50",   border: "border-slate-200",   text: "text-slate-500",   Icon: BadgeInfo },
  }[state];

  const headline = !hasDoc
    ? "Not uploaded"
    : expiryDate || "On file — expiry not recorded";

  return (
    <div className={`p-5 rounded-xl ${C.bg} border ${C.border}`}>
      <div className="flex items-center justify-between mb-3">
        <p className={`text-xs font-black uppercase tracking-widest ${C.text}`}>{label}</p>
        <C.Icon className={`w-5 h-5 ${C.text}`} />
      </div>
      <p className="text-slate-900 font-black text-lg uppercase">{headline}</p>
      {hasDoc && days !== null && days !== undefined && (
        <p className={`text-xs font-bold mt-1.5 uppercase ${C.text}`}>
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
