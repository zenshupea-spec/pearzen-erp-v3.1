"use client";

import PortalLoadingScreen from '../../../../../packages/pwa-shell/PortalLoadingScreen';

import { useCallback, useEffect, useRef, useState, useMemo, useTransition } from "react";
import Link from "next/link";
import {
  Search, X, Users, UserCheck, UserX,
  CreditCard, User, Shield, Building2,
  Home, ArrowUpDown, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, Clock, BadgeInfo, AlertTriangle,
  BookOpen,
  ShieldAlert,
  FileText,
  Pencil,
  UserPlus,
  Loader2,
  Mail,
} from "lucide-react";

import {
  isRankInMatrix,
  findRankPayEntry,
  ranksForHrAssignmentSelect,
  ranksForHrRankPickerOptions,
  isHrRankSelectableInPicker,
} from "../../../../../packages/rank-pay-matrix";
import {
  canEditMnrEmployee,
  canViewMnrEmployee,
  isExecutiveRank,
} from "../../../lib/executive-rank-guard";
import { getMnrEmployeeUniquenessIndex, getMnrRosterDesk } from "../../actions/mnrActions";
import { getRankPayMatrix, appendRankToPayMatrixFromHr } from "../../executive/settings/rank-matrix-actions";
import { getInternalWorkLocationsForMnr } from "../../executive/settings/internal-work-locations-actions";
import { formatInternalBranchLabel } from "../../../lib/internal-work-locations";
import { getMnrAccess, getOccupiedSingletonPortalRanksForSession, saveEmployeeAll } from "./actions";
import { getMnrRejoinDeskMeta, rejoinEmployee } from "./rejoin-actions";
import { getGuardRatingMapByEmployeeId } from "../../om/guard-cards/actions";
import {
  getHrGuardBlacklistForEmployee,
  hrBlacklistGuard,
} from "./guard-blacklist-actions";
import { fetchOffboardingLetterRemindersForCompany } from "./offboarding-letter-actions";
import { normalizeEpfNo } from "../../../lib/employee-epf";
import { isNicLookupReady } from "../../../lib/employee-nic";
import { lookupPriorRecordsByNic } from "../epf-actions";
import ClearanceModal from "./ClearanceModal";
import OffboardingLettersPanel from "./OffboardingLettersPanel";
import OffboardingLetterMetaTicks from "./OffboardingLetterMetaTicks";
import { getOffboardingLetterTrackForEmployee } from "./offboarding-letter-actions";
import HrPortalAuthControls from "../../../components/hr/HrPortalAuthControls";
import ExecutiveRecoveryEmailMnrField from "../../../components/hr/ExecutiveRecoveryEmailMnrField";
import HrHubPills from "../HrHubPills";
import HrSectorSelectField from "../HrSectorSelectField";
import { getHrSectorNames } from "../hr-sector-actions";
import EmployeeDocumentField from "../EmployeeDocumentField";
import EmployeeIdPhotoField from "../EmployeeIdPhotoField";
import { HR_DOCUMENT_META, HR_DOCUMENT_TYPES } from "../../../../../packages/supabase/employee-hr-documents";
import { isSectorManagerEmployee } from "../../../lib/hr-sectors";
import {
  isHeadOfficeWorkEmailRequired,
  showHeadOfficeWorkEmailInMnr,
} from "../../../lib/head-office-work-email";

const GUARD_GROUPS = new Set(["GUARD", "GUARD_FIELD"]);

/** HO/café-only phase — hides guard reserve pools and vetting desks. */
import { CVS_INTERNAL_WORKFORCE_ONLY as INTERNAL_WORKFORCE_DESK } from "../../../lib/cvs-workforce-phase";

function internalWorkforceGroup(emp) {
  const v = String(emp?.group || "").trim().toUpperCase();
  if (v === "HEAD_OFFICE" || v === "CAFE") return v;
  return null;
}

function isInternalWorkforceEmployee(emp) {
  return internalWorkforceGroup(emp) !== null;
}

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
  return normStatus(emp).toLowerCase() === "resigned" || normalizeSiteName(emp) === "CLEARANCE";
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

function normalizeSiteName(emp) {
  return (emp.site || "").trim().toUpperCase();
}

function isReserveBenchSite(emp) {
  return normalizeSiteName(emp) === "RESERVE";
}

function isClearanceSite(emp) {
  return normalizeSiteName(emp) === "CLEARANCE";
}

function isTemporySite(emp) {
  return normalizeSiteName(emp) === "TEMPORY";
}

/** Deployed guard on a real client site (operator sheet pool). */
function isDeployedClientSite(emp) {
  if (!isHrActive(emp)) return false;
  const site = normalizeSiteName(emp);
  if (!site || site === "RESERVE" || site === "CLEARANCE" || site === "TEMPORY" || site === "HEAD OFFICE") {
    return false;
  }
  return true;
}

/** HQ, café, or sector manager on active roster (not shift-based). */
function isHqRosterActive(emp) {
  if (!isHrActive(emp)) return false;
  const group = normalizeCorporateGroup(emp?.group);
  return group === "HEAD_OFFICE" || group === "CAFE";
}

function isOperationalActive(emp, matrix = []) {
  if (isResigned(emp) || isClearanceSite(emp)) return false;
  if (!isHrActive(emp)) return false;
  if (isOnMaternityLeave(emp)) return true;
  if (isHqRosterActive(emp)) return true;
  if (!isGuardEmployee(emp, matrix)) return false;
  if (isReserveBenchSite(emp) || isTemporySite(emp)) return false;
  return isDeployedClientSite(emp);
}

function isOperationalInactive(emp, matrix = []) {
  if (isResigned(emp) || isClearanceSite(emp) || !isHrActive(emp)) return false;
  if (isOnMaternityLeave(emp)) return false;
  if (!isGuardEmployee(emp, matrix)) return false;
  return isReserveBenchSite(emp);
}

function isOperationalTempory(emp, matrix = []) {
  if (isResigned(emp) || !isHrActive(emp)) return false;
  if (!isGuardEmployee(emp, matrix)) return false;
  return isTemporySite(emp);
}

function mnrTableStatusLabel(emp, matrix = []) {
  if (isOnMaternityLeave(emp) && isHrActive(emp)) return "Mat.";
  if (isGuardEmployee(emp, matrix)) {
    if (isReserveBenchSite(emp) && isHrActive(emp)) return "Reserve";
    if (isTemporySite(emp) && isHrActive(emp)) return "Temp";
    return emp.status || "ACTIVE";
  }
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
  const value = emp[column];
  if (value == null || value === "") return false;
  return String(value).trim().length > 0;
}

function gramaNiladariVettingState(emp) {
  if (!hasHrDocument(emp, "grama_niladari_url")) return null;
  const days = daysUntilExpiry(emp.grama_niladari_expiry);
  if (days === null) return null;
  if (days < 0) return "expired";
  if (days <= 45) return "expiring";
  return null;
}

function vettingBucket(emp) {
  return gramaNiladariVettingState(emp);
}

function isVettingExpiring(emp, matrix = []) {
  return (
    isOperationalActive(emp, matrix) &&
    isGuardEmployee(emp, matrix) &&
    vettingBucket(emp) === "expiring"
  );
}

function isVettingExpired(emp, matrix = []) {
  return (
    isOperationalActive(emp, matrix) &&
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

function GuardScoreBadge({ rating, tier, compact = false }) {
  const rounded = Math.round(rating);
  return (
    <span
      className={
        compact
          ? `inline-flex shrink-0 items-center rounded border px-1 py-0 text-[9px] font-black tabular-nums leading-none ${guardScoreBadgeClass(tier)}`
          : `inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${guardScoreBadgeClass(tier)}`
      }
      title={tier ? `${tier} tier · ${rounded}/100` : `${rounded}/100`}
    >
      {compact ? `${rounded}/100` : `Guard score ${rounded}/100`}
    </span>
  );
}

function formatLetterReminderDate(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function letterReminderNextDue(row) {
  if (!row.pendingIndexes?.length) {
    return { label: "—", dueDate: null, daysOverdue: 0 };
  }
  const nextIndex = Math.min(...row.pendingIndexes);
  const state = row.reminderStates?.find((entry) => entry.index === nextIndex);
  const dueDate = state?.dueDate ?? null;
  let daysOverdue = 0;
  if (state?.isOverdue && dueDate) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const due = new Date(`${dueDate.slice(0, 10)}T12:00:00`);
    daysOverdue = Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
  }
  return { label: `Warning letter ${nextIndex}`, dueDate, daysOverdue };
}

const MNR_PAGE_SIZE = 20;

export default function MasterNominalRoll() {
  const [employees, setEmployees]     = useState([]);
  const [tableLoading, setTableLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [searchQuery, setSearchQuery]       = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [personnelFilter, setPersonnelFilter] = useState("ACTIVE");
  const [rosterPage, setRosterPage] = useState(1);
  const [rosterTotal, setRosterTotal] = useState(0);
  const [rosterTotalPages, setRosterTotalPages] = useState(1);
  const [rosterRegistryTotal, setRosterRegistryTotal] = useState(0);
  const [rosterCounts, setRosterCounts] = useState({
    all: 0,
    active: 0,
    inactive: 0,
    tempory: 0,
    resigned: 0,
    vettingExpiring: 0,
    vettingExpired: 0,
  });
  const [searchPool, setSearchPool] = useState([]);
  const [sortBy, setSortBy]                 = useState("name");
  const [sortDir, setSortDir]                 = useState("asc");

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
  const [occupiedSingletonRanks, setOccupiedSingletonRanks] = useState([]);
  const reloadMdRankMatrix = useCallback(() => {
    getRankPayMatrix()
      .then(setMdRankMatrix)
      .catch(() => setMdRankMatrix([]));
    getOccupiedSingletonPortalRanksForSession()
      .then(setOccupiedSingletonRanks)
      .catch(() => setOccupiedSingletonRanks([]));
  }, []);
  const [internalWorkLocations, setInternalWorkLocations] = useState({
    headOffice: [],
    cafe: [],
  });
  const [hrSectorNames, setHrSectorNames] = useState([]);
  const [rejoinMeta, setRejoinMeta] = useState({
    blacklistedByEmployeeId: {},
    guardRatingByEmployeeId: {},
  });
  const [letterReminderRows, setLetterReminderRows] = useState([]);
  const [rejoinPendingId, setRejoinPendingId] = useState(null);
  const [isRejoinPending, startRejoinTransition] = useTransition();
  const [groupFilter, setGroupFilter] = useState(null);

  const requestIdRef = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = (params.get("group") || "").trim().toUpperCase();
    if (raw === "HEAD_OFFICE" || raw === "CAFE") {
      setGroupFilter(raw);
      setPersonnelFilter("ACTIVE");
    } else {
      setGroupFilter(null);
    }
  }, []);

  useEffect(() => {
    reloadMdRankMatrix();
    getInternalWorkLocationsForMnr()
      .then(setInternalWorkLocations)
      .catch(() => setInternalWorkLocations({ headOffice: [], cafe: [] }));
    getHrSectorNames()
      .then(setHrSectorNames)
      .catch(() => setHrSectorNames([]));
  }, [reloadMdRankMatrix]);

  useEffect(() => {
    if (!drawerEditing || !drawerEmp) return;
    reloadMdRankMatrix();
  }, [drawerEditing, drawerEmp?.id, reloadMdRankMatrix]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      reloadMdRankMatrix();
      getInternalWorkLocationsForMnr()
        .then(setInternalWorkLocations)
        .catch(() => setInternalWorkLocations({ headOffice: [], cafe: [] }));
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reloadMdRankMatrix]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setRosterPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const loadRosterDesk = useCallback(async (pageOverride) => {
    const requestId = ++requestIdRef.current;
    setTableLoading(true);
    setErrorMessage("");
    try {
      const deskFilter =
        personnelFilter === "LETTER_REMINDERS" ? "ALL" : personnelFilter;
      const data = await Promise.race([
        getMnrRosterDesk({
          personnelFilter: deskFilter,
          groupFilter,
          searchQuery: debouncedSearch,
          sortBy,
          sortDir,
          page: pageOverride ?? rosterPage,
          pageSize: MNR_PAGE_SIZE,
        }),
        new Promise((_, reject) => {
          window.setTimeout(
            () => reject(new Error("Roster load timed out. Refresh or restart dev servers.")),
            45_000,
          );
        }),
      ]);
      if (requestIdRef.current !== requestId) return null;
      setEmployees(data.rows);
      setRosterTotal(data.total);
      setRosterTotalPages(data.totalPages);
      setRosterRegistryTotal(data.rosterTotal);
      setRosterCounts(data.counts);
      return data;
    } catch (error) {
      if (requestIdRef.current === requestId) {
        setErrorMessage(error?.message || "Failed to fetch employees.");
      }
      return null;
    } finally {
      if (requestIdRef.current === requestId) setTableLoading(false);
    }
  }, [
    personnelFilter,
    groupFilter,
    debouncedSearch,
    sortBy,
    sortDir,
    rosterPage,
  ]);

  const refreshLetterReminders = useCallback(async () => {
    if (INTERNAL_WORKFORCE_DESK) {
      setLetterReminderRows([]);
      return;
    }
    try {
      const { rows } = await fetchOffboardingLetterRemindersForCompany();
      setLetterReminderRows(rows);
    } catch {
      setLetterReminderRows([]);
    }
  }, []);

  useEffect(() => {
    void loadRosterDesk();
    void refreshLetterReminders();
  }, [loadRosterDesk, refreshLetterReminders]);

  useEffect(() => {
    getMnrEmployeeUniquenessIndex()
      .then(setSearchPool)
      .catch(() => setSearchPool([]));
  }, []);

  const refreshRejoinMeta = useCallback(async (list) => {
    const pool = INTERNAL_WORKFORCE_DESK
      ? list.filter(isInternalWorkforceEmployee)
      : list;
    const resignedIds = pool.filter(isResigned).map((emp) => emp.id);
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
    if (personnelFilter !== "RESIGNED" || !employees.length) {
      setRejoinMeta({ blacklistedByEmployeeId: {}, guardRatingByEmployeeId: {} });
      return;
    }
    void refreshRejoinMeta(employees);
  }, [employees, personnelFilter, refreshRejoinMeta]);

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

  const openOffboardingDrawer = (employeeId) => {
    const emp =
      employees.find((entry) => entry.id === employeeId) ??
      searchPool.find((entry) => entry.id === employeeId);
    const row = letterReminderRows.find((entry) => entry.employeeId === employeeId);
    const target =
      emp ??
      (row
        ? {
            id: row.employeeId,
            full_name: row.employeeName,
            emp_number: row.guardEpf,
          }
        : null);
    if (!target || !canViewEmployee(target)) return;
    openSectionDrawer(target, "offboarding", false);
  };

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
      const data = await loadRosterDesk();
      if (data) await refreshRejoinMeta(data.rows);
      setPersonnelFilter("ACTIVE");
      setRejoinPendingId(null);
    });
  };

  const suggestions = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    const pool = INTERNAL_WORKFORCE_DESK
      ? searchPool.filter(isInternalWorkforceEmployee)
      : searchPool;
    return pool
      .filter(e =>
        e.full_name?.toLowerCase().includes(q) ||
        e.nic?.toLowerCase().includes(q) ||
        employeeEpfNo(e)?.toString().toLowerCase().includes(q) ||
        e.passport_no?.toLowerCase().includes(q)
      )
      .slice(0, 7);
  }, [searchQuery, searchPool]);

  const togglePersonnelFilter = (key) => {
    setRosterPage(1);
    setPersonnelFilter((prev) => (prev === key ? "ALL" : key));
  };

  const filteredEmployees = employees;

  const sortedLetterReminders = useMemo(() => {
    return [...letterReminderRows].sort((a, b) => {
      const aOverdue = letterReminderNextDue(a).daysOverdue;
      const bOverdue = letterReminderNextDue(b).daysOverdue;
      if (bOverdue !== aOverdue) return bOverdue - aOverdue;
      return (a.employeeName || "").localeCompare(b.employeeName || "");
    });
  }, [letterReminderRows]);

  const toggleSort = (field) => {
    setRosterPage(1);
    if (sortBy === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir("asc"); }
  };

  const activePersonnelCount = rosterCounts.active;
  const inactiveCount        = rosterCounts.inactive;
  const temporyCount         = rosterCounts.tempory;
  const resignedCount        = rosterCounts.resigned;
  const expiringCount        = rosterCounts.vettingExpiring;
  const expiredCount         = rosterCounts.vettingExpired;

  const letterReminderCount = letterReminderRows.length;
  const letterReminderPendingL2 = letterReminderRows.filter((row) =>
    row.pendingIndexes.includes(2),
  ).length;
  const letterReminderPendingL3 = letterReminderRows.filter((row) =>
    row.pendingIndexes.includes(3),
  ).length;
  const letterReminderPendingL1 = letterReminderRows.filter((row) =>
    row.pendingIndexes.includes(1),
  ).length;

  const PERSONNEL_CARDS = [
    {
      key: "ACTIVE",
      label: "Active Personnel",
      sub: INTERNAL_WORKFORCE_DESK ? "Head Office & café staff" : "Deployed client sites · HQ · café · sector mgrs",
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
      sub: "Reserve bench (site RESERVE)",
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
      sub: "NIC / Passport & Police ≤ 45 days · active deployed guards",
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
      sub: "NIC / Passport or police overdue · active deployed guards",
      count: expiredCount,
      Icon: XCircle,
      base: "bg-red-50 border-red-200 hover:border-red-300",
      iconWrap: "bg-red-100 border-red-200",
      iconColor: "text-red-700",
      countColor: "text-red-800",
      labelColor: "text-red-700/80",
      ring: "ring-2 ring-red-400 border-red-400",
    },
    ...(letterReminderCount > 0
      ? [
          {
            key: "LETTER_REMINDERS",
            label: "Warning letter reminders",
            sub:
              letterReminderPendingL2 || letterReminderPendingL3 || letterReminderPendingL1
                ? `Due — L1: ${letterReminderPendingL1} · L2: ${letterReminderPendingL2} · L3: ${letterReminderPendingL3}`
                : "Warning letters due — day 3 or day 7",
            count: letterReminderCount,
            Icon: Mail,
            base: "bg-amber-50 border-amber-200 hover:border-amber-300",
            iconWrap: "bg-amber-100 border-amber-200",
            iconColor: "text-amber-700",
            countColor: "text-amber-800",
            labelColor: "text-amber-700/80",
            ring: "ring-2 ring-amber-400 border-amber-400",
          },
        ]
      : []),
  ].filter((card) => {
    if (!INTERNAL_WORKFORCE_DESK) return true;
    return card.key === "ACTIVE" || card.key === "RESIGNED";
  });

  const STATUS_TABS = [
    { key: "ALL",      label: "All",      count: rosterCounts.all,       Icon: Users,      activeStyle: "bg-rose-50 text-rose-700 border border-rose-200" },
    { key: "ACTIVE",   label: "Active",   count: activePersonnelCount,   Icon: UserCheck,  activeStyle: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
    { key: "INACTIVE", label: "Inactive", count: inactiveCount,          Icon: UserX,      activeStyle: "bg-slate-100 text-slate-700 border border-slate-200" },
    { key: "TEMPORY",  label: "Temp",     count: temporyCount,           Icon: Clock,      activeStyle: "bg-sky-50 text-sky-700 border border-sky-200" },
    { key: "RESIGNED", label: "Resigned", count: resignedCount,          Icon: UserX,      activeStyle: "bg-violet-50 text-violet-700 border border-violet-200" },
  ].filter((tab) => {
    if (!INTERNAL_WORKFORCE_DESK) return true;
    return tab.key !== "INACTIVE" && tab.key !== "TEMPORY";
  });

  const SORT_OPTIONS = [
    { key: "name",        label: "Name" },
    { key: "rank",        label: "Rank" },
    { key: "date_joined", label: "Date Joined" },
  ];

  return (
    <div className="min-h-full">

      <div className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#eef2f6]/95 backdrop-blur-md shadow-sm -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="max-w-[1800px] mx-auto py-4">

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
                  {INTERNAL_WORKFORCE_DESK ? "Head Office & café staff" : "Full Personnel Registry"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-black">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {activePersonnelCount} Active
                </span>
                {!INTERNAL_WORKFORCE_DESK ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-xs font-black">
                  {inactiveCount} Inactive
                </span>
                ) : null}
              </div>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold transition-all hover:border-[color:var(--cvs-accent-muted)] hover:bg-[var(--cvs-accent-soft)]/60 hover:text-[color:var(--cvs-accent)]"
              >
                <Home className="w-3.5 h-3.5" /> HQ Hub
              </Link>
            </div>
          </div>

          {!canEditMnr && !tableLoading && (
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

          {!tableLoading && mdRankMatrix.length === 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">
              No ranks in MD Settings — configure Rank Pay Matrix under Executive Settings before
              assigning ranks. Rank lists refresh when you return to this tab after MD saves.
            </div>
          ) : null}

          <HrHubPills />

          <div
            className={`grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 ${
              INTERNAL_WORKFORCE_DESK
                ? "lg:grid-cols-2"
                : PERSONNEL_CARDS.length >= 6
                  ? "lg:grid-cols-3 xl:grid-cols-6"
                  : "lg:grid-cols-5"
            }`}
          >
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
          {groupFilter ? (
            <p className="text-xs text-slate-500 font-bold mt-2">
              Showing{" "}
              <span className="text-rose-700">
                {groupFilter === "HEAD_OFFICE" ? "Head Office" : "Café"}
              </span>
              {" staff only — "}
              <button
                type="button"
                onClick={() => {
                  setGroupFilter(null);
                  window.history.replaceState({}, "", "/hr/mnr");
                }}
                className="text-rose-600 hover:underline"
              >
                Show all internal staff
              </button>
            </p>
          ) : null}
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
                  onClick={() => { setRosterPage(1); setPersonnelFilter(tab.key); }}
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
              {INTERNAL_WORKFORCE_DESK ? (
                <>Search by name, NIC, EPF, or passport to find a former Head Office or café employee.</>
              ) : (
                <>
                  Search by name, NIC, EPF, or passport to find a former employee. Guards show their
                  12-month score; blacklisted guards are highlighted and cannot be rejoined until MD or
                  OD clears the blacklist vault.
                </>
              )}
            </div>
          )}
          {personnelFilter === "LETTER_REMINDERS" && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
              Guards with an active warning letter track and at least one due-but-unsent letter
              (day 0, +3, or +7). Click a row to open the Warning letters tab and mark letters sent.
            </div>
          )}
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto py-6">

        {errorMessage && (
          <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {errorMessage}
            <button onClick={() => setErrorMessage("")} className="ml-auto shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {tableLoading ? (
          <PortalLoadingScreen label="Loading roster…" accent="rose" fullscreen={false} />
        ) : (
          <>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-3">
              {personnelFilter === "LETTER_REMINDERS" ? (
                <>
                  Showing {sortedLetterReminders.length} guard
                  {sortedLetterReminders.length === 1 ? "" : "s"} with pending warning letters
                </>
              ) : (
                <>
                  Showing {filteredEmployees.length} of {rosterTotal} in this view
                  {rosterRegistryTotal !== rosterTotal && (
                    <span className="text-slate-400 normal-case ml-1">
                      · {rosterRegistryTotal} in registry
                    </span>
                  )}
                  {personnelFilter !== "ALL" && (
                    <span className="text-rose-600 normal-case ml-1">
                      · {PERSONNEL_CARDS.find((c) => c.key === personnelFilter)?.label ?? personnelFilter}
                    </span>
                  )}
                </>
              )}
            </p>

            {personnelFilter === "LETTER_REMINDERS" ? (
              <div className="bg-white border border-amber-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-amber-100 bg-amber-50/80">
                        <th className="px-4 py-3 text-left text-[10px] font-black text-amber-900 uppercase tracking-widest">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-[10px] font-black text-amber-900 uppercase tracking-widest">
                          EPF
                        </th>
                        <th className="px-4 py-3 text-left text-[10px] font-black text-amber-900 uppercase tracking-widest">
                          Start date
                        </th>
                        <th className="px-4 py-3 text-left text-[10px] font-black text-amber-900 uppercase tracking-widest">
                          Next due
                        </th>
                        <th className="px-4 py-3 text-left text-[10px] font-black text-amber-900 uppercase tracking-widest">
                          Days overdue
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-50">
                      {sortedLetterReminders.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-5 py-16 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <Mail className="w-10 h-10 text-amber-200" />
                              <p className="text-slate-500 font-bold text-sm">
                                No pending warning letter reminders
                              </p>
                              <button
                                type="button"
                                onClick={() => setPersonnelFilter("ALL")}
                                className="text-rose-600 text-xs font-bold hover:underline"
                              >
                                Show all personnel
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        sortedLetterReminders.map((row) => {
                          const nextDue = letterReminderNextDue(row);
                          return (
                            <tr
                              key={row.trackId}
                              role="button"
                              tabIndex={0}
                              onClick={() => openOffboardingDrawer(row.employeeId)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  openOffboardingDrawer(row.employeeId);
                                }
                              }}
                              className="hover:bg-amber-50/60 cursor-pointer transition-colors"
                            >
                              <td className="px-4 py-3 font-bold text-slate-900">{row.employeeName}</td>
                              <td className="px-4 py-3 font-mono text-slate-600">{row.guardEpf || "—"}</td>
                              <td className="px-4 py-3 text-slate-700">
                                {formatLetterReminderDate(row.sequenceStartedAt)}
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center gap-1.5 font-black text-amber-900 uppercase tracking-wide text-[10px]">
                                  <Mail className="w-3.5 h-3.5" />
                                  {nextDue.label}
                                  {nextDue.dueDate ? (
                                    <span className="font-bold text-slate-600 normal-case tracking-normal">
                                      · {formatLetterReminderDate(nextDue.dueDate)}
                                    </span>
                                  ) : null}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-bold tabular-nums">
                                {nextDue.daysOverdue > 0 ? (
                                  <span className="text-red-700">{nextDue.daysOverdue}d</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
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
                              {rosterRegistryTotal === 0
                                ? "No personnel in the registry — run npm run seed:hr-employees"
                                : rosterTotal === 0 && INTERNAL_WORKFORCE_DESK
                                  ? "No Head Office or café staff in the registry yet"
                                  : "No personnel match this filter"}
                            </p>
                            {(searchQuery || personnelFilter !== "ALL") && rosterRegistryTotal > 0 && (
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
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <p className="font-bold text-slate-900 text-xs truncate">{emp.full_name}</p>
                                  {showRejoinDesk && !INTERNAL_WORKFORCE_DESK && isGuardEmployee(emp, mdRankMatrix) && guardScore ? (
                                    <GuardScoreBadge rating={guardScore.rating} tier={guardScore.tier} compact />
                                  ) : null}
                                </div>
                                {showRejoinDesk && blacklistEntry ? (
                                  <span className="mt-1 inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-red-800">
                                    <ShieldAlert className="h-3 w-3 shrink-0" />
                                    Blacklisted
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-middle">
                            <RankBadge rank={emp.rank} mdRankMatrix={mdRankMatrix} />
                          </td>
                          <td className="px-3 py-2 align-middle max-w-0">
                            <span className="block truncate text-slate-600 text-[10px] font-bold uppercase" title={emp.site ? String(emp.site).toUpperCase() : undefined}>
                              {emp.site ? String(emp.site).toUpperCase() : "—"}
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
            )}

            {personnelFilter !== "LETTER_REMINDERS" && rosterTotalPages > 1 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-xs font-bold text-slate-500">
                  Page {rosterPage} of {rosterTotalPages}
                  <span className="text-slate-400 font-medium ml-2">
                    ({rosterTotal} matching · {MNR_PAGE_SIZE} per page)
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={rosterPage <= 1 || tableLoading}
                    onClick={() => setRosterPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-wide text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={rosterPage >= rosterTotalPages || tableLoading}
                    onClick={() => setRosterPage((p) => Math.min(rosterTotalPages, p + 1))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-wide text-slate-700 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
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
            const data = await loadRosterDesk();
            getMnrEmployeeUniquenessIndex()
              .then(setSearchPool)
              .catch(() => {});
            if (data) await refreshRejoinMeta(data.rows);
            void refreshLetterReminders();
            if (closeDrawer || !data) return;
            setDrawerEmp((current) => {
              if (!current) return null;
              const fresh = data.rows.find((e) => e.id === current.id);
              if (fresh) drawerEmpRef.current = fresh;
              return fresh ?? current;
            });
          }}
          onOpenClearanceSummary={(employee) => setClearanceEmp(employee)}
          mdRankMatrix={mdRankMatrix}
          onReloadRankMatrix={reloadMdRankMatrix}
          occupiedSingletonRanks={occupiedSingletonRanks}
          internalWorkLocations={internalWorkLocations}
          sectorNames={hrSectorNames}
          allEmployees={searchPool}
        />
      )}

      {clearanceEmp && (
        <ClearanceModal
          employee={clearanceEmp}
          summaryMode={isResigned(clearanceEmp)}
          canConfirm={canEditMnr}
          onClose={() => setClearanceEmp(null)}
          onResignationConfirmed={async () => {
            await loadRosterDesk();
            getMnrEmployeeUniquenessIndex()
              .then(setSearchPool)
              .catch(() => {});
          }}
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

const CORPORATE_GROUP_OPTIONS_ALL = [
  { value: "GUARD", label: "Guard" },
  { value: "HEAD_OFFICE", label: "Head Office" },
  { value: "CAFE", label: "Café" },
];

const CORPORATE_GROUP_OPTIONS = INTERNAL_WORKFORCE_DESK
  ? CORPORATE_GROUP_OPTIONS_ALL.filter(
      (o) => o.value === "HEAD_OFFICE" || o.value === "CAFE",
    )
  : CORPORATE_GROUP_OPTIONS_ALL;

function normalizeCorporateGroup(value) {
  const v = String(value || "").trim().toUpperCase();
  if (v === "GUARD_FIELD") return "GUARD";
  // Legacy rows stored SECTOR_MANAGER as corporate group — SMs belong under Head Office.
  if (v === "SECTOR_MANAGER") return "HEAD_OFFICE";
  return v;
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
  const hit = CORPORATE_GROUP_OPTIONS_ALL.find((o) => o.value === normalized);
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
  { key: "offboarding", label: "Warning letters", Icon: Mail,     },
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
  onReloadRankMatrix,
  occupiedSingletonRanks = [],
  internalWorkLocations,
  sectorNames = [],
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
  const [editRank, setEditRank] = useState(() =>
    (emp?.rank || "").trim().toUpperCase(),
  );
  const [editGroup, setEditGroup] = useState(() =>
    normalizeCorporateGroup(emp?.group),
  );
  const [editSite, setEditSite] = useState("");
  const [editBaseSalary, setEditBaseSalary] = useState("");
  const [liveSectorNames, setLiveSectorNames] = useState(sectorNames);
  const [letterReminderStates, setLetterReminderStates] = useState([]);
  const [hasActiveLetterTrack, setHasActiveLetterTrack] = useState(false);
  const [drawerGuardScore, setDrawerGuardScore] = useState(null);
  const [drawerBlacklist, setDrawerBlacklist] = useState(null);
  const [blacklistBusy, setBlacklistBusy] = useState(false);
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
    if (editing) {
      setDirty(false);
      pendingNavRef.current = null;
      setPendingNav(null);
    }
  }, [editing, emp.id, formKey]);

  useEffect(() => {
    const rank = (emp.rank || "").trim().toUpperCase();
    const group = normalizeCorporateGroup(emp.group);
    setEditRank(rank);
    setEditGroup(group);
    let site = defaultSiteForRank(mdRankMatrix, rank, emp.site || "");
    if (
      isInternalLocationGroup(group) &&
      !isSectorManagerEmployee({ rank, group }) &&
      site
    ) {
      site = formatInternalBranchLabel(site);
    }
    setEditSite(site);
    setEditBaseSalary(
      emp.base_salary != null && emp.base_salary !== "" ? String(emp.base_salary) : "",
    );
    setPreviousEpfNo(emp.previous_epf_no ?? "");
    setPriorNicMatches([]);
  }, [emp.id, emp.rank, emp.group, emp.site, emp.base_salary, emp.previous_epf_no, formKey, mdRankMatrix]);

  useEffect(() => {
    setLiveSectorNames(sectorNames);
  }, [sectorNames]);

  useEffect(() => {
    setHasActiveLetterTrack(false);
    setLetterReminderStates([]);
  }, [emp.id]);

  const reloadLetterTrack = useCallback(async () => {
    try {
      const view = await getOffboardingLetterTrackForEmployee(emp.id);
      if (view.track?.status === "ACTIVE") {
        setHasActiveLetterTrack(true);
        setLetterReminderStates(view.reminderStates);
      } else {
        setHasActiveLetterTrack(false);
        setLetterReminderStates([]);
      }
    } catch {
      setHasActiveLetterTrack(false);
      setLetterReminderStates([]);
    }
  }, [emp.id]);

  useEffect(() => {
    void reloadLetterTrack();
  }, [reloadLetterTrack]);

  useEffect(() => {
    setDrawerGuardScore(null);
    if (!isGuardEmployee(emp, mdRankMatrix)) return undefined;

    let cancelled = false;
    void getGuardRatingMapByEmployeeId([emp.id])
      .then((map) => {
        if (!cancelled) setDrawerGuardScore(map[emp.id] ?? null);
      })
      .catch(() => {
        if (!cancelled) setDrawerGuardScore(null);
      });

    return () => {
      cancelled = true;
    };
  }, [emp.id, emp.rank, emp.group, mdRankMatrix]);

  const reloadDrawerBlacklist = useCallback(async () => {
    if (!isGuardEmployee(emp, mdRankMatrix)) {
      setDrawerBlacklist(null);
      return;
    }
    try {
      const entry = await getHrGuardBlacklistForEmployee(emp.id);
      setDrawerBlacklist(entry);
    } catch {
      setDrawerBlacklist(null);
    }
  }, [emp.id, emp.rank, emp.group, mdRankMatrix]);

  useEffect(() => {
    setDrawerBlacklist(null);
    if (!isGuardEmployee(emp, mdRankMatrix)) return undefined;
    let cancelled = false;
    void getHrGuardBlacklistForEmployee(emp.id)
      .then((entry) => {
        if (!cancelled) setDrawerBlacklist(entry);
      })
      .catch(() => {
        if (!cancelled) setDrawerBlacklist(null);
      });
    return () => {
      cancelled = true;
    };
  }, [emp.id, emp.rank, emp.group, mdRankMatrix]);

  const showGuardBlacklistControl =
    canEdit && isGuardEmployee(emp, mdRankMatrix);

  const handleBlacklistGuard = async () => {
    if (!showGuardBlacklistControl || drawerBlacklist || blacklistBusy) return;

    const scoreLine =
      drawerGuardScore != null
        ? `\n\nGuard score: ${Math.round(drawerGuardScore.rating)}/100 (${drawerGuardScore.tier})`
        : "";
    const confirmed = window.confirm(
      `Blacklist ${emp.full_name}? They will be blocked from rejoin until MD or OD approves removal from the vault.${scoreLine}`,
    );
    if (!confirmed) return;

    const reason = window.prompt("Blacklist reason (required):");
    if (!reason?.trim()) return;

    setBlacklistBusy(true);
    try {
      const result = await hrBlacklistGuard(emp.id, reason.trim());
      if (!result.success) {
        window.alert(result.error ?? "Failed to blacklist guard.");
        return;
      }
      await reloadDrawerBlacklist();
      await onSaved();
    } finally {
      setBlacklistBusy(false);
    }
  };

  const handleOffboardingChanged = useCallback(() => {
    void reloadLetterTrack();
    onSaved();
  }, [reloadLetterTrack, onSaved]);

  const siteApplicable =
    !INTERNAL_WORKFORCE_DESK && isFieldGuardRank(mdRankMatrix, editRank);
  const smSectorApplicable = isSectorManagerEmployee({ rank: editRank, group: editGroup });
  const internalLocationApplicable =
    isInternalLocationGroup(editGroup) && !smSectorApplicable;
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
    if (isSectorManagerEmployee({ rank: newRank, group: editGroup })) {
      // Sector select — keep current value or leave blank for operator to pick.
    } else if (
      !INTERNAL_WORKFORCE_DESK &&
      isFieldGuardRank(mdRankMatrix, newRank)
    ) {
      setEditSite((prev) => prev || "Unassigned (Bench)");
    } else if (isInternalLocationGroup(editGroup)) {
      setEditSite("");
    } else if (!isInternalLocationGroup(editGroup)) {
      setEditSite("");
    }
    setDirty(true);
  };

  const handleEditGroupChange = (e) => {
    const newGroup = normalizeCorporateGroup(e.target.value);
    setEditGroup(newGroup);
    const allowed = ranksForHrAssignmentSelect(mdRankMatrix, newGroup, {
      excludeRankCodes: occupiedSingletonRanks,
    });
    if (
      editRank &&
      !allowed.some((entry) => entry.rankCode === editRank.trim().toUpperCase())
    ) {
      setEditRank("");
      setEditBaseSalary("");
    }
    if (isSectorManagerEmployee({ rank: editRank, group: newGroup })) {
      // Keep assigned sector when SM stays under Head Office.
    } else if (isInternalLocationGroup(newGroup)) {
      setEditSite("");
    } else if (
      !INTERNAL_WORKFORCE_DESK &&
      isFieldGuardRank(mdRankMatrix, editRank)
    ) {
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

  const closeDrawer = () => {
    pendingNavRef.current = null;
    setPendingNav(null);
    setDirty(false);
    onClose();
  };

  const completePendingNav = (nav) => {
    if (!nav) return;
    if (nav.type === "close") closeDrawer();
    else if (nav.type === "tab") onTabChange(nav.key);
    else if (nav.type === "view") onToggleEdit();
  };

  const requestNav = (action) => {
    if (editing && dirty && action.type === "close") {
      pendingNavRef.current = action;
      setPendingNav(action);
      return;
    }
    if (action.type === "close") {
      closeDrawer();
      return;
    }
    if (action.type === "tab") onTabChange(action.key);
    else if (action.type === "view") onToggleEdit();
  };

  const markFormDirty = (event) => {
    if (event?.isTrusted) setDirty(true);
  };

  const isOwnRecord =
    viewerEmail &&
    emp.email &&
    viewerEmail === String(emp.email).trim().toLowerCase();
  const canUploadIdPhoto = canEdit || Boolean(isOwnRecord);
  const effectiveCorporateGroup = normalizeCorporateGroup(
    editing ? editGroup : emp?.group,
  );
  const effectiveRank = (editing ? editRank : emp?.rank) || "";
  const isEffectiveHeadOffice = effectiveCorporateGroup === "HEAD_OFFICE";
  const showWorkEmailField = showHeadOfficeWorkEmailInMnr({
    group: effectiveCorporateGroup,
    rank: effectiveRank,
  });
  const canEditWorkEmail =
    showWorkEmailField &&
    (!isExecutiveRank(effectiveRank) || canManageExecutive);
  const workEmailRequired =
    canEditWorkEmail && isHeadOfficeWorkEmailRequired(effectiveRank);

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
      if (others.length > 0) {
        setPreviousEpfNo(normalizeEpfNo(others[0].epfNo ?? ""));
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
    if (workEmailRequired && !String(payload.email ?? "").trim()) missing.push("Work email");
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
      const result = await saveEmployeeAll(emp.id, payload);
      if (!result.success) {
        setSaveError(result.error || "Failed to save.");
        return false;
      }
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
    if (closing) closeDrawer();
    else completePendingNav(nav);
    onSaved({ closeDrawer: closing });
  };

  const handleDiscardFromDialog = () => {
    const nav = pendingNavRef.current ?? pendingNav;
    dismissUnsavedDialog({ resetForm: true, exitEdit: nav?.type !== "close" });
    if (nav?.type === "close") closeDrawer();
    else completePendingNav(nav);
  };

  const inputClass =
    "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 outline-none";

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => requestNav({ type: "close" })} />

      <aside className="relative ml-auto w-full max-w-lg h-full bg-white border-l border-slate-200 shadow-2xl flex flex-col overflow-hidden">

        <div className="relative z-20 flex items-center justify-between px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-white to-rose-50/40 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <EmployeeMnrPhoto photoUrl={emp.id_photo_url} name={emp.full_name} size="md" />
            <span className={`w-3 h-3 rounded-full shrink-0 ${isActive(emp) ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <p className="font-black text-slate-900 uppercase tracking-wider text-sm truncate">{emp.full_name}</p>
                {isGuardEmployee(emp, mdRankMatrix) && drawerGuardScore ? (
                  <GuardScoreBadge
                    rating={drawerGuardScore.rating}
                    tier={drawerGuardScore.tier}
                    compact
                  />
                ) : null}
              </div>
              <p className="text-xs text-slate-500 font-bold truncate">
                {emp.rank && <span className="text-slate-600">{emp.rank}</span>}
                {emp.site && (
                  <span> · {String(emp.site).toUpperCase()}</span>
                )}
              </p>
              {showGuardBlacklistControl && drawerBlacklist ? (
                <span
                  className="mt-1 inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-red-800 max-w-full"
                  title={`${drawerBlacklist.reason} — by ${drawerBlacklist.blacklistedByName}`}
                >
                  <ShieldAlert className="h-3 w-3 shrink-0" />
                  Blacklisted
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            {showGuardBlacklistControl && !drawerBlacklist ? (
              <button
                type="button"
                disabled={blacklistBusy}
                onClick={() => void handleBlacklistGuard()}
                className="px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-800 text-[10px] font-black uppercase tracking-widest hover:bg-red-100 disabled:opacity-50 shrink-0"
              >
                {blacklistBusy ? "…" : "Blacklist"}
              </button>
            ) : null}
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
          {hasActiveLetterTrack && letterReminderStates.length > 0 ? (
            <OffboardingLetterMetaTicks reminderStates={letterReminderStates} />
          ) : null}
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
          {saveError && activeTab !== "offboarding" && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
              {saveError}
            </div>
          )}

          {activeTab === "offboarding" ? (
            <OffboardingLettersPanel
              employeeId={emp.id}
              employeeName={emp.full_name}
              canEdit={canEdit}
              onChanged={handleOffboardingChanged}
            />
          ) : editing && canEdit ? (
            <form
              key={formKey}
              ref={formRef}
              noValidate
              onSubmit={handleSaveAll}
              onInput={markFormDirty}
              onChange={markFormDirty}
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
                  {showWorkEmailField ? (
                    <WorkEmailEditField
                      name="email"
                      defaultValue={emp.email}
                      employeeId={emp.id}
                      allEmployees={allEmployees}
                      inputClass={inputClass}
                      readOnly={!canEditWorkEmail}
                      required={workEmailRequired}
                      onDuplicateChange={setEmailDuplicate}
                    />
                  ) : isEffectiveHeadOffice && isSectorManagerEmployee({ rank: effectiveRank, group: effectiveCorporateGroup }) ? (
                    <p className="text-[10px] text-slate-500 font-bold">
                      Sector managers use EPF for SM portal login — work email is not used.
                    </p>
                  ) : null}
                  {showWorkEmailField && workEmailRequired === false ? (
                    <p className="text-[10px] text-slate-500 font-bold">
                      Optional for drivers and caretakers. Required before FM / HR / OM portal access.
                    </p>
                  ) : null}
                  {!isEffectiveHeadOffice && (
                    <p className="text-[10px] text-slate-500 font-bold">
                      Work email is only for Head Office staff (back-office portal login). Set corporate group to Head Office on the Employment tab first.
                    </p>
                  )}
                  {isEffectiveHeadOffice && isExecutiveRank(effectiveRank) && !canManageExecutive && (
                    <p className="text-[10px] text-amber-800 font-bold">
                      MD / OD work email can only be changed by MD or OD.
                    </p>
                  )}
                  {isEffectiveHeadOffice && isExecutiveRank(effectiveRank) ? (
                    <ExecutiveRecoveryEmailMnrField
                      employeeId={emp.id}
                      editing={editing}
                      inputClass={inputClass}
                    />
                  ) : null}
                  {isEffectiveHeadOffice && viewerRole === "HR" ? (
                    <HrPortalAuthControls
                      employeeId={emp.id}
                      employeeName={emp.full_name ?? "Staff"}
                      employeeRank={effectiveRank}
                    />
                  ) : null}
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
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wide text-amber-900">
                      Prior record{priorNicMatches.length > 1 ? "s" : ""} for this NIC — check blacklist and
                      performance before saving.
                    </p>
                    <ul className="space-y-2">
                      {priorNicMatches.map((match) => (
                        <li
                          key={match.id}
                          className={`rounded-lg border px-3 py-2 text-[10px] ${
                            match.isBlacklisted
                              ? "border-red-300 bg-red-50"
                              : "border-amber-200 bg-white/80"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-900">{match.fullName}</span>
                            <span className="text-slate-500">·</span>
                            <span className="font-mono text-slate-600">EPF {match.epfNo || "—"}</span>
                            <span className="text-slate-500">·</span>
                            <span className="uppercase text-slate-600">{match.status || "Unknown"}</span>
                          </div>
                          {match.isBlacklisted ? (
                            <p className="mt-1 flex items-center gap-1 font-bold text-red-700">
                              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                              Blacklisted{match.blacklistReason ? `: ${match.blacklistReason}` : ""}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <p className="text-[10px] font-bold text-amber-900">
                      Prior EPF {previousEpfNo || "—"} is stored for audit. Use a new EPF number below when
                      rehiring.
                    </p>
                    <input type="hidden" name="previous_epf_no" value={previousEpfNo} />
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
                {priorNicMatches.length === 0 ? (
                  <EditField
                    label="Previous EPF No"
                    name="previous_epf_no"
                    value={previousEpfNo}
                    onChange={(e) => setPreviousEpfNo(e.target.value)}
                    mono
                    inputClass={inputClass}
                  />
                ) : null}
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
                <CorporateGroupSelectField
                  label="Corporate Group"
                  name="group"
                  value={editGroup}
                  onChange={handleEditGroupChange}
                  inputClass={inputClass}
                />
                <RankSelectField
                  label="Rank"
                  name="rank"
                  value={editRank}
                  onChange={handleEditRankChange}
                  corporateGroup={editGroup}
                  mdRankMatrix={mdRankMatrix}
                  onReloadRankMatrix={onReloadRankMatrix}
                  occupiedSingletonRanks={occupiedSingletonRanks}
                  inputClass={inputClass}
                />
                {smSectorApplicable ? (
                  <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                      Assigned Sector
                    </label>
                    <HrSectorSelectField
                      name="site"
                      sectorNames={liveSectorNames}
                      onSectorNamesUpdated={setLiveSectorNames}
                      value={editSite}
                      onChange={(sector) => {
                        setEditSite(sector);
                        setDirty(true);
                      }}
                      selectClassName={inputClass}
                    />
                  </div>
                ) : null}
                {siteApplicable && !internalLocationApplicable && !smSectorApplicable ? (
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
                    onChange={(nextValue) => {
                      setEditSite(nextValue);
                      setDirty(true);
                    }}
                    applicable
                    options={internalLocationOptions}
                    inputClass={inputClass}
                  />
                ) : null}
                {!siteApplicable && !internalLocationApplicable && !smSectorApplicable ? (
                  <input type="hidden" name="site" value="" />
                ) : null}
                <EditField label="Date Joined" name="date_joined" type="date" defaultValue={emp.date_joined} inputClass={inputClass} />
                <EmployeeStatusSelectField
                  emp={emp}
                  mdRankMatrix={mdRankMatrix}
                  inputClass={inputClass}
                />
                <EditField
                  label="Basic Salary (B) — LKR"
                  name="base_salary"
                  type="number"
                  value={editBaseSalary}
                  onChange={(e) => {
                    setEditBaseSalary(e.target.value);
                    setDirty(true);
                  }}
                  inputClass={inputClass}
                />
                <EditField label="Fixed Allowance (LKR)" name="fixed_allowance_lkr" type="number" defaultValue={emp.fixed_allowance_lkr} inputClass={inputClass} />
                <EditField label="Special Allowance (LKR)" name="special_allowance_lkr" type="number" defaultValue={emp.special_allowance_lkr} inputClass={inputClass} />
                <EditField label="Site Allowance (LKR)" name="site_allowance_lkr" type="number" defaultValue={emp.site_allowance_lkr} inputClass={inputClass} />
                <EditField label="Meal Allowance (LKR)" name="meal_allowance_lkr" type="number" defaultValue={emp.meal_allowance_lkr} inputClass={inputClass} />
                <EditField label="Transport Allowance (LKR)" name="transport_allowance_lkr" type="number" defaultValue={emp.transport_allowance_lkr} inputClass={inputClass} />
                <EditField label="Fixed Deduction (LKR)" name="fixed_deduction_lkr" type="number" defaultValue={emp.fixed_deduction_lkr} inputClass={inputClass} />
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
                <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 mt-2">
                  <p className="text-xs font-black text-indigo-800 uppercase tracking-widest mb-0.5">HR Memo</p>
                  <p className="text-slate-600 text-xs font-bold mb-3">
                    Internal notes for this employee — also editable in the bulk roster editor.
                  </p>
                  <EditField
                    label="Memo"
                    name="hr_memo"
                    defaultValue={emp.hr_memo}
                    multiline
                    inputClass={inputClass}
                    bare
                  />
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
                <EditField label="Grama Niladari Expiry" name="grama_niladari_expiry" type="date" defaultValue={emp.grama_niladari_expiry} inputClass={inputClass} />
                <p className="text-[10px] font-semibold text-slate-500">
                  Grama Niladari expiry is required when a certificate scan is on file.
                </p>
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
                  {isHeadOfficeGroup(emp) && viewerRole === "HR" ? (
                    <div className="py-2">
                      <HrPortalAuthControls
                        employeeId={emp.id}
                        employeeName={emp.full_name ?? "Staff"}
                        employeeRank={emp.rank}
                      />
                    </div>
                  ) : null}
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
                    label={
                      isSectorManagerEmployee(emp)
                        ? "Assigned Sector"
                        : isInternalLocationGroup(emp.group)
                          ? isHeadOfficeGroup(emp)
                            ? "Head Office Branch"
                            : "Café Branch"
                          : "Assigned Site"
                    }
                    value={
                      emp.site ? String(emp.site).toUpperCase() : emp.site
                    }
                  />
                  <DetailRow label="Date Joined"     value={emp.date_joined} />
                  <DetailRow
                    label="Status"
                    value={
                      isGuardEmployee(emp, mdRankMatrix) || isInternalWorkforceEmployee(emp)
                        ? emp.status
                        : normStatus(emp).toUpperCase() === "ACTIVE"
                          ? null
                          : emp.status
                    }
                    badge={
                      (isGuardEmployee(emp, mdRankMatrix) || isInternalWorkforceEmployee(emp)) &&
                      isHrActive(emp)
                        ? "active"
                        : isGuardEmployee(emp, mdRankMatrix) || isInternalWorkforceEmployee(emp)
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
                  <DetailRow label="Basic Salary (B)" value={emp.base_salary ? `LKR ${Number(emp.base_salary).toLocaleString()}` : null} />
                  <DetailRow label="Fixed Allowance" value={emp.fixed_allowance_lkr ? `LKR ${Number(emp.fixed_allowance_lkr).toLocaleString()}` : null} />
                  <DetailRow label="Special Allowance" value={emp.special_allowance_lkr ? `LKR ${Number(emp.special_allowance_lkr).toLocaleString()}` : null} />
                  <DetailRow label="Site Allowance"  value={emp.site_allowance_lkr ? `LKR ${Number(emp.site_allowance_lkr).toLocaleString()}` : null} />
                  <DetailRow label="Meal Allowance"  value={emp.meal_allowance_lkr ? `LKR ${Number(emp.meal_allowance_lkr).toLocaleString()}` : null} />
                  <DetailRow label="Transport Allowance" value={emp.transport_allowance_lkr ? `LKR ${Number(emp.transport_allowance_lkr).toLocaleString()}` : null} />
                  <DetailRow label="Fixed Deduction" value={emp.fixed_deduction_lkr ? `LKR ${Number(emp.fixed_deduction_lkr).toLocaleString()}` : null} />
                  <DetailRow label="Salary Type"     value={salaryTypeLabel(emp.salary_type)} />
                  <DetailRow label="EPF Enrolled"    value={emp.epf_yn ? "Yes" : "No"} />
                  <DetailRow label="HR Memo"         value={emp.hr_memo} multiline preserveCase />
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
                    label="Grama Niladari Certificate"
                    expiryDate={emp.grama_niladari_expiry}
                    days={daysDiff(emp.grama_niladari_expiry)}
                    documentUrl={emp.grama_niladari_url}
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
          <div
            className="absolute inset-0 z-10 flex items-end sm:items-center justify-center p-4 bg-slate-900/20"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                pendingNavRef.current = null;
                setPendingNav(null);
              }
            }}
          >
            <div
              role="dialog"
              aria-labelledby="unsaved-changes-title"
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p id="unsaved-changes-title" className="text-sm font-black text-slate-900 uppercase tracking-wide">
                    Unsaved changes
                  </p>
                  <p className="text-xs text-slate-500 font-bold mt-1">
                    Save your changes, discard them, or keep editing this profile.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleDiscardFromDialog}
                  className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-all shrink-0"
                  aria-label="Discard changes and close"
                  title="Discard and close"
                >
                  <X className="w-4 h-4" />
                </button>
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
  const code = String(rank).trim().toUpperCase();
  if (code === "TBD") {
    return (
      <span
        className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide border bg-slate-100 border-slate-200 text-slate-600"
        title="Rank pending — assign FM / MD / OD in MD Portal → Security & Access → Staff Command Center"
      >
        TBD
      </span>
    );
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

function EmployeeStatusSelectField({ emp, mdRankMatrix, inputClass }) {
  const isGuard = isGuardEmployee(emp, mdRankMatrix);
  const isInternal = isInternalWorkforceEmployee(emp);
  const editable = isGuard || isInternal;
  const current = (emp.status || "").trim();

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Status</label>
      {editable ? (
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
          {isGuard ? (
            <p className="text-[10px] text-slate-500 font-bold">
              ACTIVE guards flow to OM site assignment, SM shifts, and TM verification.
            </p>
          ) : (
            <p className="text-[10px] text-slate-500 font-bold">
              ACTIVE Head Office and café staff count toward internal workforce dashboards and payroll.
            </p>
          )}
        </>
      ) : (
        <>
          <input type="hidden" name="status" value={current} />
          <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-400">
            Status cannot be changed for this corporate group
          </div>
          {current ? (
            <p className="text-[10px] text-slate-500 font-bold">Current HR status: {current}</p>
          ) : null}
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
  const branchOptions = options
    .map((loc) => ({
      id: loc.id,
      name: formatInternalBranchLabel(loc.name),
    }))
    .filter((loc) => loc.name.length > 0);

  const normalized = formatInternalBranchLabel(value || "");
  const matched = branchOptions.find((loc) => loc.name === normalized);
  const selectedValue = matched ? matched.name : normalized;
  const legacy = normalized && !matched ? normalized : "";

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">{label}</label>
      {applicable ? (
        <>
          {branchOptions.length === 0 ? (
            <p className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              No branches configured yet. Add GPS branches in MD Settings → Operations, save, then
              return here.
            </p>
          ) : (
            <p className="text-[10px] font-semibold text-slate-500">
              Branches from MD Settings → Operations
            </p>
          )}
          {legacy && (
            <p className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              Current branch &ldquo;{legacy}&rdquo; is not in the MD list. Pick a branch below or keep the legacy value.
            </p>
          )}
          <select
            name={name}
            value={selectedValue}
            onChange={(e) => onChange(formatInternalBranchLabel(e.target.value))}
            required={branchOptions.length > 0}
            className={`${inputClass} uppercase`}
          >
            <option value="">
              Select branch…
            </option>
            {branchOptions.map((loc) => (
              <option key={loc.id} value={loc.name}>
                {loc.name}
              </option>
            ))}
            {legacy ? <option value={legacy}>{legacy}</option> : null}
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
  const mapsToKnown = knownValues.includes(normalized);
  const legacyUnmapped =
    raw && !mapsToKnown && !knownValues.includes(raw) && normalized === raw ? raw : "";
  const selectValue = mapsToKnown ? normalized : legacyUnmapped || "";

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">{label}</label>
      {legacyUnmapped && (
        <p className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
          {INTERNAL_WORKFORCE_DESK &&
          (normalized === "GUARD" || normalized === "SECTOR_MANAGER")
            ? `Guard and sector manager groups are paused. Choose Head Office or Café to continue.`
            : `Current group "${legacyUnmapped}" is non-standard. Pick a corporate group below.`}
        </p>
      )}
      {raw && mapsToKnown && raw !== normalized ? (
        <p className="text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
          Legacy group &ldquo;{raw}&rdquo; maps to{" "}
          {CORPORATE_GROUP_OPTIONS.find((o) => o.value === normalized)?.label ?? normalized}.
        </p>
      ) : null}
      {mapsToKnown && raw !== normalized ? (
        <input type="hidden" name={name} value={normalized} />
      ) : null}
      <select
        name={mapsToKnown && raw !== normalized ? undefined : name}
        value={onChange ? selectValue : undefined}
        defaultValue={
          onChange
            ? undefined
            : selectValue
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
        {legacyUnmapped && <option value={legacyUnmapped}>{legacyUnmapped}</option>}
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
  corporateGroup,
  mdRankMatrix,
  onReloadRankMatrix,
  occupiedSingletonRanks = [],
  inputClass,
}) {
  const current = (value ?? defaultValue ?? "").trim().toUpperCase();
  const normalizedGroup = normalizeCorporateGroup(corporateGroup);
  const rankOptions = ranksForHrRankPickerOptions(mdRankMatrix, normalizedGroup);
  const inMatrix = rankOptions.some((entry) => entry.rankCode === current);
  const legacyRankPreserved = Boolean(current && !inMatrix);
  const [replacementRank, setReplacementRank] = useState("");
  const effectiveLegacy = legacyRankPreserved && !replacementRank;

  useEffect(() => {
    setReplacementRank("");
  }, [current, normalizedGroup]);
  const controlled = value !== undefined;
  const selectValue = replacementRank || (inMatrix ? current : "");
  const [addingRank, setAddingRank] = useState(false);
  const [newRankCode, setNewRankCode] = useState("");
  const [newRankTitle, setNewRankTitle] = useState("");
  const [newRankPay, setNewRankPay] = useState("");
  const [addRankError, setAddRankError] = useState("");
  const [addRankSaving, setAddRankSaving] = useState(false);

  const handleSelectChange = (e) => {
    const next = e.target.value;
    if (next === "__add_rank__") {
      setAddingRank(true);
      setAddRankError("");
      setReplacementRank("");
      return;
    }
    setAddingRank(false);
    if (legacyRankPreserved && next) {
      setReplacementRank(next.trim().toUpperCase());
    } else {
      setReplacementRank("");
    }
    onChange?.(e);
  };

  const handleAddRank = async () => {
    setAddRankError("");
    setAddRankSaving(true);
    try {
      const result = await appendRankToPayMatrixFromHr({
        rankCode: newRankCode,
        fullTitle: newRankTitle,
        corporateGroup: normalizedGroup,
        basicPay: newRankPay ? Number.parseInt(newRankPay, 10) : 0,
      });
      if (!result.success) {
        setAddRankError(result.error ?? "Could not add rank.");
        return;
      }
      await onReloadRankMatrix?.();
      setAddingRank(false);
      setNewRankCode("");
      setNewRankTitle("");
      setNewRankPay("");
      setReplacementRank(result.rankCode);
      onChange?.({ target: { value: result.rankCode, name } });
    } catch (err) {
      setAddRankError(err instanceof Error ? err.message : "Could not add rank.");
    } finally {
      setAddRankSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 py-2 border-b border-slate-100 last:border-0">
      <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
        {label}
      </label>
      {!normalizedGroup ? (
        <p className="text-[10px] font-bold text-slate-500">
          Select a corporate group first to choose a rank from the MD pay ledger.
        </p>
      ) : null}
      {current && !inMatrix && (
        <p className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
          Current rank &ldquo;{current}&rdquo; is not in the pay ledger for this group. It will stay on file until you pick a replacement below or add a new rank.
        </p>
      )}
      {effectiveLegacy && !addingRank ? (
        <input type="hidden" name={name} value={current} />
      ) : replacementRank && !addingRank ? (
        <input type="hidden" name={name} value={replacementRank} />
      ) : null}
      <select
        name={addingRank || effectiveLegacy || replacementRank ? undefined : name}
        required={!addingRank && !effectiveLegacy}
        disabled={!normalizedGroup || addingRank}
        {...(controlled
          ? { value: addingRank ? "" : selectValue }
          : { defaultValue: selectValue })}
        onChange={handleSelectChange}
        className={inputClass}
      >
        <option value="" disabled>
          {normalizedGroup
            ? effectiveLegacy
              ? `Keeping ${current} — or choose replacement…`
              : "Select rank…"
            : "Select corporate group first"}
        </option>
        {rankOptions.map((r) => {
          const selectable = isHrRankSelectableInPicker(
            mdRankMatrix,
            normalizedGroup,
            r.rankCode,
            { excludeRankCodes: occupiedSingletonRanks },
          );
          return (
            <option key={r.id} value={r.rankCode} disabled={!selectable}>
              {r.rankCode} — {r.fullTitle}
              {!selectable ? " (not assignable via HR)" : ""}
            </option>
          );
        })}
        <option value="__add_rank__">+ Add new rank to this list…</option>
      </select>
      {addingRank ? (
        <div className="mt-2 space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-900">
            New rank for {normalizedGroup}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              type="text"
              value={newRankCode}
              onChange={(e) => setNewRankCode(e.target.value.toUpperCase())}
              placeholder="Code (e.g. SSG)"
              maxLength={12}
              className={inputClass}
            />
            <input
              type="text"
              value={newRankTitle}
              onChange={(e) => setNewRankTitle(e.target.value)}
              placeholder="Full title"
              className={`${inputClass} sm:col-span-2`}
            />
          </div>
          <input
            type="number"
            min={0}
            value={newRankPay}
            onChange={(e) => setNewRankPay(e.target.value)}
            placeholder="Basic pay (LKR) — optional"
            className={inputClass}
          />
          {addRankError ? (
            <p className="text-[10px] font-semibold text-rose-700">{addRankError}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={addRankSaving || !newRankCode.trim() || !newRankTitle.trim()}
              onClick={() => void handleAddRank()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white disabled:opacity-50"
            >
              {addRankSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Add to list
            </button>
            <button
              type="button"
              disabled={addRankSaving}
              onClick={() => {
                setAddingRank(false);
                setAddRankError("");
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {normalizedGroup && rankOptions.length === 0 && !legacyRankPreserved ? (
        <p className="text-[10px] font-bold text-amber-800">
          No ranks in MD Settings for this group — add them under Rank Pay Matrix.
        </p>
      ) : null}
      <p className="text-[10px] font-semibold text-slate-500">
        Only ranks from the MD pay ledger for this corporate group are listed. HR-added ranks are saved to the company ledger and appear here for everyone.
      </p>
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
        Work Email (MNR contact — portal username is NIC)
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
