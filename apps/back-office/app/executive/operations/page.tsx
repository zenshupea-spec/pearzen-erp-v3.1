'use client';

import React, { Suspense, useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OmCommandShellLayout from '../../om/components/OmCommandShellLayout';
import OmSubnav from '../../om/components/OmSubnav';
import GuardCardsTab from '../../om/guard-cards/GuardCardsTab';
import SiteAllocationTab from '../../om/components/SiteAllocationTab';
import { getLiveFieldRadar } from '../../om/actions/field-radar';
import { fetchOffDutyGuardsForSector } from '../actions';
import {
  COMMAND_CENTER_REFRESH_MS,
  tabFromSearchParam,
} from '../../om/lib/command-center-tabs';
import {
  Activity,
  AlertTriangle,
  BadgeAlert,
  Check,
  CheckCircle2,
  Users,
  MapPin,
  MessageSquareWarning,
  Eye,
  Siren,
  UserMinus,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock,
  TrendingUp,
  TrendingDown,
  Radio,
  Phone,
  Building2,
  Sun,
  Moon,
  Gavel,
  Timer,
  CalendarDays,
  X,
  Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type SectorStatus = 'NOMINAL' | 'ATTENTION' | 'CRITICAL';
type DateView = 'today' | 'yesterday' | 'day-before';

interface Incident {
  id: string;
  what: string;
  where: string;
  siteCode: string;
  who: string;
  time: string;
  penalty?: string;
  penaltyReason?: string;
}

interface Penalty {
  id: string;
  guard: string;
  site: string;
  siteCode: string;
  amount: string;
  reason: string;
  time: string;
}

interface ClientComplaint {
  id: string;
  what: string;
  site: string;
  siteCode: string;
  who: string;
  client: string;
  time: string;
  note?: string;
}

interface ShiftShort {
  site: string;
  siteCode: string;
  missingCount: number;
  missingGuards?: string[];
}

interface ContinuationShift {
  hours: 24 | 36 | 48 | 60;
  guard: string;
  site: string;
  siteCode: string;
}

interface SectorCard {
  id: string;
  name: string;
  region: string;
  sm: string;
  smPhone: string;
  guardsOnShift: number;
  guardsTotal: number;
  sitesToday: number;
  sitesTotal: number;
  openIncidents: number;
  deficits: number;
  status: SectorStatus;
  lastUpdate: string;
  incidents: Incident[];
  penalties: Penalty[];
  clientComplaints: ClientComplaint[];
  dayShiftShorts: ShiftShort[];
  nightShiftShorts: ShiftShort[];
  continuationShifts: ContinuationShift[];
}

// ─── Field Incident Types ─────────────────────────────────────────────────────

type RoleKey = 'OM' | 'SM' | 'MD';

interface TriRoleAck {
  OM: boolean;
  SM: boolean;
  MD: boolean;
}

type IncidentType =
  | 'SLEEPING_ON_POST'
  | 'CLIENT_COMPLAINT'
  | 'THEFT'
  | 'UNIFORM_VIOLATION'
  | 'UNAUTHORIZED_ABSENCE';

interface FieldIncident {
  id: string;
  timestamp: string;
  site: string;
  incidentType: IncidentType;
  guardName: string;
  guardEmpNo: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  ack: TriRoleAck;
}

// ─── Sector Data (executive preview only — OM portal uses live/empty data) ─────

const EXECUTIVE_PREVIEW_SECTORS: SectorCard[] = [
  {
    id: 'S01',
    name: 'Colombo North',
    region: 'Western Province',
    sm: 'Suresh Karunaratne',
    smPhone: '+94 77 234 5678',
    guardsOnShift: 48,
    guardsTotal: 52,
    sitesToday: 14,
    sitesTotal: 15,
    openIncidents: 1,
    deficits: 4,
    status: 'ATTENTION',
    lastUpdate: '08:42 AM',
    incidents: [
      { id: 'INC-001', what: 'Guard found asleep on post', where: 'Lanka Hospitals — Gate 3', siteCode: 'SIT-014', who: 'Ruwan Dissanayake', time: '03:20 AM', penalty: 'LKR 5,000', penaltyReason: 'Sleeping on post — per penalty catalog' },
    ],
    penalties: [
      { id: 'PEN-001', guard: 'Ruwan Dissanayake', site: 'Lanka Hospitals', siteCode: 'SIT-014', amount: 'LKR 5,000', reason: 'Sleeping on post — per penalty catalog', time: '03:20 AM' },
    ],
    clientComplaints: [
      { id: 'CC-001', what: 'Guard was rude to hospital visitor', site: 'Lanka Hospitals', siteCode: 'SIT-014', who: 'Kamal Perera', client: 'Lanka Hospitals Management', time: '09:15 AM', note: 'I am writing to formally complain about the behaviour of the security guard stationed at Gate 3 this morning. When my elderly mother arrived as an outpatient, the guard — without any apparent reason — raised his voice and spoke to her in a dismissive and disrespectful manner, causing her visible distress. This is entirely unacceptable given the nature of a hospital environment. We expect security personnel to be professional and compassionate, especially with patients and their families. I request that this incident be investigated and appropriate action taken.' },
    ],
    dayShiftShorts: [
      { site: 'Lanka Hospitals', siteCode: 'SIT-014', missingCount: 2, missingGuards: ['Ruwan Dissanayake', 'Nishantha Kumara'] },
      { site: 'Cargills Colombo 7', siteCode: 'SIT-007', missingCount: 1, missingGuards: ['Pradeep Jayalath'] },
    ],
    nightShiftShorts: [
      { site: 'BOC Headquarters', siteCode: 'SIT-003', missingCount: 1, missingGuards: ['Samith Rathnayake'] },
    ],
    continuationShifts: [
      { hours: 24, guard: 'Kamal Perera', site: 'Lanka Hospitals', siteCode: 'SIT-014' },
      { hours: 36, guard: 'Nimal Silva', site: 'Dialog Axiata HQ', siteCode: 'SIT-022' },
      { hours: 48, guard: 'Pradeep Gunathilake', site: 'Colombo 7 Apartment', siteCode: 'SIT-031' },
    ],
  },
  {
    id: 'S02',
    name: 'Colombo South',
    region: 'Western Province',
    sm: 'Priyantha Wickramasinghe',
    smPhone: '+94 71 345 6789',
    guardsOnShift: 59,
    guardsTotal: 61,
    sitesToday: 18,
    sitesTotal: 18,
    openIncidents: 0,
    deficits: 2,
    status: 'NOMINAL',
    lastUpdate: '08:55 AM',
    incidents: [],
    penalties: [],
    clientComplaints: [],
    dayShiftShorts: [{ site: 'Dehiwala Municipal Council', siteCode: 'SIT-032', missingCount: 1, missingGuards: ['Lasantha Perera'] }],
    nightShiftShorts: [{ site: 'Mt. Lavinia Beach Hotel', siteCode: 'SIT-038', missingCount: 1, missingGuards: ['Asanka Fernando'] }],
    continuationShifts: [{ hours: 24, guard: 'Sisira Rathnayake', site: 'Dehiwala Municipal Council', siteCode: 'SIT-032' }],
  },
  {
    id: 'S03',
    name: 'Colombo Central',
    region: 'Western Province',
    sm: 'Nalaka Jayasuriya',
    smPhone: '+94 76 456 7890',
    guardsOnShift: 31,
    guardsTotal: 34,
    sitesToday: 10,
    sitesTotal: 11,
    openIncidents: 2,
    deficits: 3,
    status: 'CRITICAL',
    lastUpdate: '08:30 AM',
    incidents: [
      { id: 'INC-011', what: 'Unauthorized entry attempt allowed', where: 'BOC Headquarters — Main Lobby', siteCode: 'SIT-003', who: 'Tilan Jayawardena', time: '02:45 AM', penalty: 'LKR 3,000', penaltyReason: 'Failure to follow access protocol' },
      { id: 'INC-012', what: 'Patrol log not submitted', where: 'Ceylinco Tower — Floor 12', siteCode: 'SIT-009', who: 'Aruna Kumara', time: '06:00 AM', penalty: 'LKR 2,500', penaltyReason: 'Failure to log patrol visit' },
    ],
    penalties: [
      { id: 'PEN-011', guard: 'Tilan Jayawardena', site: 'BOC Headquarters', siteCode: 'SIT-003', amount: 'LKR 3,000', reason: 'Failure to follow access protocol', time: '02:45 AM' },
      { id: 'PEN-012', guard: 'Aruna Kumara', site: 'Ceylinco Tower', siteCode: 'SIT-009', amount: 'LKR 2,500', reason: 'Failure to log patrol visit', time: '06:00 AM' },
    ],
    clientComplaints: [
      { id: 'CC-011', what: 'Visitor allowed through without sign-in', site: 'BOC Headquarters', siteCode: 'SIT-003', who: 'Tilan Jayawardena', client: 'BOC Borella Branch Manager', time: '08:10 AM', note: 'At approximately 2:40 AM we observed through our internal camera system that an unidentified individual entered the main lobby without presenting any ID or signing the visitor register. The guard on duty at that hour failed to intercept or challenge this person. This is a serious security breach, particularly given the sensitive financial data maintained on our premises. We have preserved the CCTV footage and are prepared to share it. We expect a full incident report and confirmation of the corrective measures being taken.' },
    ],
    dayShiftShorts: [
      { site: 'BOC Headquarters', siteCode: 'SIT-003', missingCount: 2, missingGuards: ['Tilan Jayawardena', 'Nalin Kumara'] },
      { site: 'Ceylinco Tower', siteCode: 'SIT-009', missingCount: 1, missingGuards: ['Aruna Kumara'] },
    ],
    nightShiftShorts: [{ site: 'National Museum', siteCode: 'SIT-016', missingCount: 1, missingGuards: ['Mahinda Rathnasiri'] }],
    continuationShifts: [
      { hours: 36, guard: 'Hemantha Rathnasiri', site: 'BOC Headquarters', siteCode: 'SIT-003' },
      { hours: 60, guard: 'Sampath Wijesinghe', site: 'Ceylinco Tower', siteCode: 'SIT-009' },
    ],
  },
  {
    id: 'S04',
    name: 'Gampaha',
    region: 'Western Province',
    sm: 'Roshan Jayawardena',
    smPhone: '+94 77 567 8901',
    guardsOnShift: 43,
    guardsTotal: 44,
    sitesToday: 12,
    sitesTotal: 12,
    openIncidents: 0,
    deficits: 1,
    status: 'NOMINAL',
    lastUpdate: '09:01 AM',
    incidents: [],
    penalties: [],
    clientComplaints: [],
    dayShiftShorts: [],
    nightShiftShorts: [{ site: 'Gampaha Hospital', siteCode: 'SIT-044', missingCount: 1, missingGuards: ['Chathura Bandara'] }],
    continuationShifts: [],
  },
  {
    id: 'S05',
    name: 'Negombo',
    region: 'Western Province',
    sm: 'Chaminda Perera',
    smPhone: '+94 71 678 9012',
    guardsOnShift: 26,
    guardsTotal: 29,
    sitesToday: 8,
    sitesTotal: 9,
    openIncidents: 1,
    deficits: 3,
    status: 'ATTENTION',
    lastUpdate: '08:48 AM',
    incidents: [
      { id: 'INC-021', what: 'Uniform non-compliance on post', where: 'Negombo Fish Market', siteCode: 'SIT-051', who: 'Kapila Fernando', time: '07:15 AM', penalty: 'LKR 1,500', penaltyReason: 'Uniform Non-Compliance — per penalty catalog' },
    ],
    penalties: [
      { id: 'PEN-021', guard: 'Kapila Fernando', site: 'Negombo Fish Market', siteCode: 'SIT-051', amount: 'LKR 1,500', reason: 'Uniform Non-Compliance — per penalty catalog', time: '07:15 AM' },
    ],
    clientComplaints: [],
    dayShiftShorts: [{ site: 'Negombo Fish Market', siteCode: 'SIT-051', missingCount: 2, missingGuards: ['Kapila Fernando', 'Indika Pathirana'] }],
    nightShiftShorts: [{ site: 'Browns Beach Hotel', siteCode: 'SIT-053', missingCount: 1, missingGuards: ['Janaka Silva'] }],
    continuationShifts: [{ hours: 48, guard: 'Indika Pathirana', site: 'Browns Beach Hotel', siteCode: 'SIT-053' }],
  },
  {
    id: 'S06',
    name: 'Kandy',
    region: 'Central Province',
    sm: 'Mahesh Dissanayake',
    smPhone: '+94 76 789 0123',
    guardsOnShift: 36,
    guardsTotal: 38,
    sitesToday: 11,
    sitesTotal: 11,
    openIncidents: 0,
    deficits: 2,
    status: 'NOMINAL',
    lastUpdate: '09:05 AM',
    incidents: [],
    penalties: [],
    clientComplaints: [
      { id: 'CC-061', what: 'Guard refused to assist elderly patient', site: 'Kandy Hospital', siteCode: 'SIT-061', who: 'Bandara Wijewickrama', client: 'Kandy Hospital Head of Security', time: '10:30 AM', note: 'An elderly patient in a wheelchair required assistance reaching the ward on the second floor. The lift was temporarily out of service and the patient requested help from the guard at the front desk. The guard flatly refused, stating that "it is not my job." A nurse had to leave her station to assist instead. This kind of response is deeply troubling and reflects poor training and attitude. We have documented this incident and request that immediate retraining be arranged for this individual. Future breaches of this nature will be escalated through formal channels under our SLA terms.' },
    ],
    dayShiftShorts: [{ site: 'Kandy Hospital', siteCode: 'SIT-061', missingCount: 1, missingGuards: ['Bandara Wijewickrama'] }],
    nightShiftShorts: [{ site: 'Temple of Tooth', siteCode: 'SIT-063', missingCount: 1, missingGuards: ['Rajitha Perera'] }],
    continuationShifts: [{ hours: 24, guard: 'Bandara Wijewickrama', site: 'Kandy Hospital', siteCode: 'SIT-061' }],
  },
  {
    id: 'S07',
    name: 'Kurunegala',
    region: 'North Western Province',
    sm: 'Asitha Fernando',
    smPhone: '+94 77 890 1234',
    guardsOnShift: 20,
    guardsTotal: 22,
    sitesToday: 7,
    sitesTotal: 7,
    openIncidents: 0,
    deficits: 2,
    status: 'NOMINAL',
    lastUpdate: '08:58 AM',
    incidents: [],
    penalties: [],
    clientComplaints: [],
    dayShiftShorts: [],
    nightShiftShorts: [{ site: 'Kurunegala Teaching Hospital', siteCode: 'SIT-071', missingCount: 2, missingGuards: ['Nuwan Jayalath', 'Kasun Fernando'] }],
    continuationShifts: [],
  },
  {
    id: 'S08',
    name: 'Ratnapura',
    region: 'Sabaragamuwa Province',
    sm: 'Tharaka Bandara',
    smPhone: '+94 71 901 2345',
    guardsOnShift: 14,
    guardsTotal: 18,
    sitesToday: 5,
    sitesTotal: 6,
    openIncidents: 1,
    deficits: 4,
    status: 'CRITICAL',
    lastUpdate: '08:21 AM',
    incidents: [
      { id: 'INC-031', what: 'Guard abandoned post mid-shift', where: 'Ratnapura Gem Exchange', siteCode: 'SIT-081', who: 'Lasith Pradeep', time: '04:00 AM', penalty: 'LKR 8,000', penaltyReason: 'Abandoning Post — per penalty catalog' },
    ],
    penalties: [
      { id: 'PEN-031', guard: 'Lasith Pradeep', site: 'Ratnapura Gem Exchange', siteCode: 'SIT-081', amount: 'LKR 8,000', reason: 'Abandoning Post — per penalty catalog', time: '04:00 AM' },
    ],
    clientComplaints: [
      { id: 'CC-031', what: 'Post left unattended for 2+ hours', site: 'Ratnapura Gem Exchange', siteCode: 'SIT-081', who: 'Lasith Pradeep', client: 'Ratnapura Gem Exchange Director', time: '06:00 AM', note: 'Between 1:45 AM and 4:00 AM, the main entrance post of our premises was left entirely unattended. We store high-value gem inventory on site and the absence of a guard during these hours is a grave contractual failure. When we reviewed our internal cameras, there was no sign of the assigned guard during this window. We are formally putting your company on notice. If this is not resolved with a full explanation and documented disciplinary action within 48 hours, we will be reviewing our contract arrangement and will consider pursuing a claim for breach of security services.' },
      { id: 'CC-032', what: 'Guard seen sleeping during rounds', site: 'Rathna Prefab', siteCode: 'SIT-082', who: 'Dinesh Kumara', client: 'Rathna Prefab Site Manager', time: '08:45 AM', note: 'During my morning inspection at approximately 8:30 AM I found the assigned guard asleep on a chair in the storage area, with his phone playing music loudly. When I woke him he appeared disoriented and claimed he had "just closed his eyes for a moment." This is the second time in this month we have encountered this issue with staff from your agency. I have photographed the incident and will be sending it to your head office. Please ensure this guard is replaced immediately and do not reassign him to our site.' },
    ],
    dayShiftShorts: [
      { site: 'Ratnapura Gem Exchange', siteCode: 'SIT-081', missingCount: 2, missingGuards: ['Lasith Pradeep', 'Nuwan Seneviratne'] },
      { site: 'Rathna Prefab', siteCode: 'SIT-082', missingCount: 2, missingGuards: ['Dinesh Kumara', 'Manjula Perera'] },
    ],
    nightShiftShorts: [{ site: 'Ratnapura Teaching Hospital', siteCode: 'SIT-083', missingCount: 1, missingGuards: ['Chamara Gunawardena'] }],
    continuationShifts: [
      { hours: 36, guard: 'Dinesh Kumara', site: 'Ratnapura Gem Exchange', siteCode: 'SIT-081' },
      { hours: 48, guard: 'Janaka Seneviratne', site: 'Rathna Prefab', siteCode: 'SIT-082' },
    ],
  },
  {
    id: 'S09',
    name: 'Matara',
    region: 'Southern Province',
    sm: 'Saman Weerasekara',
    smPhone: '+94 76 012 3456',
    guardsOnShift: 17,
    guardsTotal: 19,
    sitesToday: 6,
    sitesTotal: 6,
    openIncidents: 0,
    deficits: 2,
    status: 'NOMINAL',
    lastUpdate: '09:03 AM',
    incidents: [],
    penalties: [],
    clientComplaints: [],
    dayShiftShorts: [],
    nightShiftShorts: [{ site: 'Matara District Hospital', siteCode: 'SIT-091', missingCount: 1, missingGuards: ['Rukshan Jayawardena'] }],
    continuationShifts: [],
  },
];

// ─── Derived summary ──────────────────────────────────────────────────────────

function getSummary(sectors: SectorCard[]) {
  const totalOnShift   = sectors.reduce((s, x) => s + x.guardsOnShift, 0);
  const totalGuards    = sectors.reduce((s, x) => s + x.guardsTotal, 0);
  const totalIncidents = sectors.reduce((s, x) => s + x.openIncidents, 0);
  const totalDeficits  = sectors.reduce((s, x) => s + x.deficits, 0);
  const coveragePct    = totalGuards > 0 ? Math.round((totalOnShift / totalGuards) * 100) : 0;
  return { totalOnShift, totalGuards, totalIncidents, totalDeficits, coveragePct };
}

function getSectorVacancyStats(sectors: SectorCard[]) {
  const siteCodes = new Set<string>();
  let totalVacancies = 0;
  sectors.forEach((sector) => {
    [...sector.dayShiftShorts, ...sector.nightShiftShorts].forEach((short) => {
      if (short.missingCount > 0) {
        siteCodes.add(short.siteCode);
        totalVacancies += short.missingCount;
      }
    });
  });
  return { totalVacancies, siteCount: siteCodes.size };
}

function getDateViewSectors(sectors: SectorCard[], dateView: DateView): SectorCard[] {
  // Historical roster snapshots are not wired yet — always show live radar data.
  if (dateView !== 'today') return sectors;
  return sectors;
}

// ─── Styling maps ─────────────────────────────────────────────────────────────

const DATE_VIEW_SHORTFALL_META: Record<
  DateView,
  { title: string; hint: string; chip: string }
> = {
  today: {
    title: 'Upcoming shift coverage',
    hint: 'Guards still needed before today’s day & night shifts start',
    chip: 'Today',
  },
  yesterday: {
    title: 'Yesterday’s shift gaps',
    hint: 'Shortfalls from the previous security day',
    chip: 'Yesterday',
  },
  'day-before': {
    title: 'Prior day shift gaps',
    hint: 'Historical staffing gaps two days ago',
    chip: '2 days ago',
  },
};

const SECTOR_STATUS_STYLES: Record<SectorStatus, {
  frame: string;
  hoverFrame: string;
  dot: string;
  badge: string;
  badgeText: string;
  stripe: string;
}> = {
  NOMINAL: {
    frame:
      'border-[3px] border-emerald-400/90 ring-2 ring-emerald-300/50 bg-gradient-to-br from-white via-white to-emerald-50/70 shadow-[inset_0_2px_0_rgba(255,255,255,0.95),inset_0_-2px_0_rgba(16,185,129,0.1),0_4px_0_0_rgba(5,150,105,0.22),0_12px_32px_-8px_rgba(16,185,129,0.3)]',
    hoverFrame: 'hover:-translate-y-0.5 hover:shadow-[inset_0_2px_0_rgba(255,255,255,0.95),inset_0_-2px_0_rgba(16,185,129,0.12),0_6px_0_0_rgba(5,150,105,0.28),0_16px_40px_-8px_rgba(16,185,129,0.38)] hover:ring-emerald-400/60',
    dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]',
    badge: 'border-emerald-200/80 bg-emerald-50/90 text-emerald-800',
    badgeText: 'NOMINAL',
    stripe: 'bg-emerald-500',
  },
  ATTENTION: {
    frame:
      'border-[3px] border-amber-400/90 ring-2 ring-amber-300/50 bg-gradient-to-br from-white via-white to-amber-50/70 shadow-[inset_0_2px_0_rgba(255,255,255,0.95),inset_0_-2px_0_rgba(245,158,11,0.1),0_4px_0_0_rgba(217,119,6,0.22),0_12px_32px_-8px_rgba(245,158,11,0.3)]',
    hoverFrame: 'hover:-translate-y-0.5 hover:shadow-[inset_0_2px_0_rgba(255,255,255,0.95),inset_0_-2px_0_rgba(245,158,11,0.12),0_6px_0_0_rgba(217,119,6,0.28),0_16px_40px_-8px_rgba(245,158,11,0.38)] hover:ring-amber-400/60',
    dot: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]',
    badge: 'border-amber-200/80 bg-amber-50/90 text-amber-800',
    badgeText: 'ATTENTION',
    stripe: 'bg-amber-400',
  },
  CRITICAL: {
    frame:
      'border-[3px] border-rose-400/90 ring-2 ring-rose-300/55 bg-gradient-to-br from-white via-white to-rose-50/70 shadow-[inset_0_2px_0_rgba(255,255,255,0.95),inset_0_-2px_0_rgba(244,63,94,0.12),0_4px_0_0_rgba(225,29,72,0.25),0_12px_32px_-8px_rgba(190,18,60,0.35)]',
    hoverFrame: 'hover:-translate-y-0.5 hover:shadow-[inset_0_2px_0_rgba(255,255,255,0.95),inset_0_-2px_0_rgba(244,63,94,0.14),0_6px_0_0_rgba(225,29,72,0.32),0_16px_40px_-8px_rgba(190,18,60,0.42)] hover:ring-rose-400/65',
    dot: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]',
    badge: 'border-rose-200/80 bg-rose-50/90 text-rose-800',
    badgeText: 'CRITICAL',
    stripe: 'bg-rose-500',
  },
};

const STATUS_ORDER: Record<SectorStatus, number> = { CRITICAL: 0, ATTENTION: 1, NOMINAL: 2 };

// ─── Summary KPI Card ─────────────────────────────────────────────────────────

function SummaryKpi({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  onClick,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub: string;
  accent: 'slate' | 'emerald' | 'rose' | 'amber' | 'indigo';
  onClick?: () => void;
  hint?: string;
}) {
  const colors = {
    slate:   { ring: 'ring-slate-200/80',   bar: 'bg-slate-500',   iconBg: 'border-slate-200/70 bg-slate-50/70',     iconFg: 'text-slate-600',   val: 'text-slate-900',   hover: 'hover:border-slate-300 hover:shadow-[0_16px_40px_-18px_rgba(15,23,42,0.18)]' },
    emerald: { ring: 'ring-emerald-200/80', bar: 'bg-emerald-500', iconBg: 'border-emerald-200/70 bg-emerald-50/70', iconFg: 'text-emerald-700', val: 'text-emerald-900', hover: 'hover:border-emerald-300 hover:shadow-[0_16px_40px_-18px_rgba(16,185,129,0.22)]' },
    rose:    { ring: 'ring-rose-200/80',    bar: 'bg-rose-500',    iconBg: 'border-rose-200/70 bg-rose-50/70',       iconFg: 'text-rose-700',    val: 'text-rose-900',    hover: 'hover:border-rose-300 hover:shadow-[0_16px_40px_-18px_rgba(244,63,94,0.22)]' },
    amber:   { ring: 'ring-amber-200/80',   bar: 'bg-amber-500',   iconBg: 'border-amber-200/70 bg-amber-50/70',     iconFg: 'text-amber-700',   val: 'text-amber-900',   hover: 'hover:border-amber-300 hover:shadow-[0_16px_40px_-18px_rgba(245,158,11,0.22)]' },
    indigo:  { ring: 'ring-indigo-200/80',  bar: 'bg-indigo-500',  iconBg: 'border-indigo-200/70 bg-indigo-50/70',   iconFg: 'text-indigo-700',  val: 'text-indigo-900',  hover: 'hover:border-indigo-300 hover:shadow-[0_16px_40px_-18px_rgba(99,102,241,0.22)]' },
  };
  const c = colors[accent];
  const interactive = Boolean(onClick);

  const body = (
    <>
      <span className={`absolute left-0 top-4 bottom-4 w-1 rounded-full ${c.bar}`} />
      <div className="flex items-start gap-4 pl-3">
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border ${c.iconBg}`}>
          <Icon className={`h-5 w-5 ${c.iconFg}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className={`mt-1.5 text-3xl font-black tabular-nums leading-none tracking-tight ${c.val}`}>{value}</p>
          <p className="mt-2 text-xs font-medium leading-snug text-slate-500">{sub}</p>
          {interactive && (
            <p className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-indigo-600">
              {hint ?? 'Tap to open'}
              <ChevronRight className="h-3 w-3" />
            </p>
          )}
        </div>
      </div>
    </>
  );

  const className = `relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl transition-all ${interactive ? `cursor-pointer ${c.hover} active:scale-[0.985]` : ''}`;

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={`${className} text-left w-full`}>
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}

function scrollMainToElement(target: HTMLElement | null, offset = 112) {
  if (!target) return;
  const scrollRoot = target.closest('main');
  if (!scrollRoot) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const top =
    target.getBoundingClientRect().top -
    scrollRoot.getBoundingClientRect().top +
    scrollRoot.scrollTop -
    offset;
  scrollRoot.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

// ─── Coverage Bar ─────────────────────────────────────────────────────────────

function CoverageBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const color =
    pct >= 90 ? 'bg-emerald-500' :
    pct >= 75 ? 'bg-amber-500'   :
    'bg-rose-500';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-semibold text-slate-500">Coverage</span>
        <span className={`font-black tabular-nums ${pct >= 90 ? 'text-emerald-700' : pct >= 75 ? 'text-amber-700' : 'text-rose-700'}`}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/60">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Field Incident Data & Helpers ───────────────────────────────────────────

const INITIAL_FIELD_INCIDENTS: FieldIncident[] = [
  // Week of 22–28 May 2026
  { id: 'INC-2026-063', timestamp: '2026-05-27T14:20:00Z', site: 'Commercial Bank HQ',  incidentType: 'CLIENT_COMPLAINT',     guardName: 'Vimukthi Bandara',  guardEmpNo: 'EMP-1099', severity: 'MEDIUM', ack: { OM: false, SM: false, MD: false } },
  { id: 'INC-2026-061', timestamp: '2026-05-23T02:14:00Z', site: 'Lanka Hospitals',     incidentType: 'SLEEPING_ON_POST',     guardName: 'Suresh Bandara',    guardEmpNo: 'EMP-1042', severity: 'HIGH',   ack: { OM: true,  SM: false, MD: false } },
  { id: 'INC-2026-058', timestamp: '2026-05-22T19:45:00Z', site: 'Arpico Supercentre',  incidentType: 'CLIENT_COMPLAINT',     guardName: 'Ranjith Perera',    guardEmpNo: 'EMP-1087', severity: 'MEDIUM', ack: { OM: true,  SM: true,  MD: false } },
  // Week of 15–21 May 2026
  { id: 'INC-2026-055', timestamp: '2026-05-19T11:30:00Z', site: 'Dialog Axiata HQ',    incidentType: 'THEFT',                guardName: 'Chaminda Silva',    guardEmpNo: 'EMP-1103', severity: 'HIGH',   ack: { OM: true,  SM: true,  MD: false } },
  { id: 'INC-2026-051', timestamp: '2026-05-17T08:00:00Z', site: 'BOC Borella Branch',  incidentType: 'UNIFORM_VIOLATION',    guardName: 'Kasun Fernando',    guardEmpNo: 'EMP-1024', severity: 'LOW',    ack: { OM: true,  SM: true,  MD: true  } },
  { id: 'INC-2026-049', timestamp: '2026-05-15T22:00:00Z', site: 'Hemas Hospital',      incidentType: 'UNAUTHORIZED_ABSENCE', guardName: 'Pradeep Rajapaksa', guardEmpNo: 'EMP-1056', severity: 'HIGH',   ack: { OM: true,  SM: false, MD: false } },
  // Week of 8–14 May 2026
  { id: 'INC-2026-043', timestamp: '2026-05-13T06:30:00Z', site: 'Cargills Food City',  incidentType: 'CLIENT_COMPLAINT',     guardName: 'Nimal Jayawardena', guardEmpNo: 'EMP-1078', severity: 'MEDIUM', ack: { OM: true,  SM: true,  MD: true  } },
  { id: 'INC-2026-041', timestamp: '2026-05-10T20:15:00Z', site: 'Lanka Hospitals',     incidentType: 'SLEEPING_ON_POST',     guardName: 'Roshan Dissanayake',guardEmpNo: 'EMP-1091', severity: 'HIGH',   ack: { OM: true,  SM: true,  MD: true  } },
  { id: 'INC-2026-039', timestamp: '2026-05-08T03:45:00Z', site: 'Shalom Residence',    incidentType: 'UNAUTHORIZED_ABSENCE', guardName: 'Madhawa Seneviratne',guardEmpNo: 'EMP-1033',severity: 'MEDIUM', ack: { OM: true,  SM: true,  MD: true  } },
];

const INCIDENT_META: Record<IncidentType, { label: string; pill: string; Icon: React.FC<{ className?: string }> }> = {
  SLEEPING_ON_POST:     { label: 'Sleeping on Post',     pill: 'bg-amber-50 text-amber-700 border-amber-200',     Icon: ({ className }) => <Zap className={className} /> },
  CLIENT_COMPLAINT:     { label: 'Client Complaint',     pill: 'bg-rose-50 text-rose-700 border-rose-200',         Icon: ({ className }) => <MessageSquareWarning className={className} /> },
  THEFT:                { label: 'Theft',                 pill: 'bg-red-50 text-red-700 border-red-200',            Icon: ({ className }) => <AlertTriangle className={className} /> },
  UNIFORM_VIOLATION:    { label: 'Uniform Violation',    pill: 'bg-slate-100 text-slate-600 border-slate-200',     Icon: ({ className }) => <BadgeAlert className={className} /> },
  UNAUTHORIZED_ABSENCE: { label: 'Unauthorized Absence', pill: 'bg-orange-50 text-orange-700 border-orange-200',   Icon: ({ className }) => <UserMinus className={className} /> },
};

const FIELD_SEVERITY_DOT: Record<string, string> = {
  HIGH:   'bg-rose-500',
  MEDIUM: 'bg-amber-400',
  LOW:    'bg-slate-500',
};

function fmtIncidentTs(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  };
}

// ─── Light Glass Card (local, for ICQ panels) ─────────────────────────────────

function DarkGlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-xl ${className}`.trim()}>
      {children}
    </div>
  );
}

// ─── Incident Type Tag ────────────────────────────────────────────────────────

function IncidentTypeTag({ type }: { type: IncidentType }) {
  const meta = INCIDENT_META[type];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm font-black ${meta.pill}`}>
      <meta.Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

// ─── Incident Detail Panel ────────────────────────────────────────────────────

function IncidentDetailPanel({
  incident,
  currentRole,
  onAcknowledge,
}: {
  incident: FieldIncident;
  currentRole: RoleKey;
  onAcknowledge: (id: string) => void;
}) {
  const isUnread = !incident.ack[currentRole];
  const allRead  = incident.ack.OM && incident.ack.SM && incident.ack.MD;
  const { date, time } = fmtIncidentTs(incident.timestamp);

  return (
    <div className="space-y-4">
      <div className={`flex items-start gap-3 rounded-2xl border p-4 ${
        allRead ? 'border-emerald-200/60 bg-emerald-50/60' : 'border-rose-200/60 bg-rose-50/60'
      }`}>
        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border ${
          allRead ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'
        }`}>
          {allRead
            ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            : <AlertTriangle className="h-4 w-4 text-rose-600" />
          }
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm font-bold text-slate-400">{incident.id}</p>
            <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-sm font-black ${
              incident.severity === 'HIGH'   ? 'bg-rose-50 text-rose-700 border-rose-200' :
              incident.severity === 'MEDIUM' ? 'bg-amber-50 text-amber-700 border-amber-200' :
              'bg-slate-100 text-slate-600 border-slate-200'
            }`}>{incident.severity}</span>
            <IncidentTypeTag type={incident.incidentType} />
          </div>
          <p className="text-base font-black text-slate-900">{incident.site}</p>
          <p className="mt-0.5 text-sm text-slate-500">{date} · {time}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/60 bg-slate-50/60 p-4">
        <p className="mb-3 text-sm font-black uppercase tracking-widest text-slate-500">Involved Guard</p>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-base font-black text-slate-700">
            {incident.guardName.split(' ').map((n) => n[0]).join('')}
          </div>
          <div>
            <p className="text-base font-black text-slate-900">{incident.guardName}</p>
            <p className="font-mono text-sm text-slate-500">{incident.guardEmpNo}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/60 bg-slate-50/60 p-4">
        <p className="mb-3 text-sm font-black uppercase tracking-widest text-slate-500">Tri-Role Acknowledgement</p>
        <div className="grid grid-cols-3 gap-2">
          {(['OM', 'SM', 'MD'] as RoleKey[]).map((role) => {
            const isRead = incident.ack[role];
            return (
              <div key={role} className={`rounded-xl border p-3 text-center ${
                isRead ? 'border-emerald-200/60 bg-emerald-50/50' : 'border-slate-200/60 bg-white/50'
              }`}>
                <div className={`mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full border ${
                  isRead ? 'border-emerald-300 bg-emerald-100' : 'border-slate-200 bg-slate-100'
                }`}>
                  {isRead ? <Eye className="h-4 w-4 text-emerald-600" /> : <Clock className="h-4 w-4 text-slate-500" />}
                </div>
                <p className="text-sm font-black text-slate-900">{role}</p>
                <p className={`mt-0.5 text-sm font-bold ${isRead ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {isRead ? 'Read' : 'Pending'}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {isUnread && (
        <button
          type="button"
          onClick={() => onAcknowledge(incident.id)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white shadow-md shadow-indigo-600/30 transition-all hover:bg-indigo-700 active:scale-[0.98]"
        >
          <Check className="h-4 w-4" />
          Acknowledge as {currentRole}
        </button>
      )}

      {allRead && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200/60 bg-emerald-50/60 p-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <p className="text-sm font-bold text-emerald-700">All roles confirmed — incident closed</p>
        </div>
      )}

      {!isUnread && !allRead && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/50 p-3">
          <Clock className="h-4 w-4 text-slate-500" />
          <p className="text-sm font-bold text-slate-500">Awaiting remaining role acknowledgements</p>
        </div>
      )}
    </div>
  );
}

// ─── Incident Calendar Popup ──────────────────────────────────────────────────

const ICQ_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const ICQ_DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const ICQ_SEV_ORDER: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
const ICQ_SEV_CELL: Record<string, string> = {
  HIGH:   'bg-rose-500 text-white hover:bg-rose-600',
  MEDIUM: 'bg-amber-400 text-white hover:bg-amber-500',
  LOW:    'bg-sky-400 text-white hover:bg-sky-500',
};

function IncidentCalendar({
  incidents,
  selectedDate,
  onSelectDate,
  onClose,
  today,
}: {
  incidents: FieldIncident[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onClose: () => void;
  today: Date;
}) {
  const [viewYear,  setViewYear]  = useState(selectedDate.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getUTCMonth());

  const todayStr    = today.toISOString().slice(0, 10);
  const selectedStr = selectedDate.toISOString().slice(0, 10);

  const dayMap = useMemo(() => {
    const map: Record<string, string> = {};
    incidents.forEach((inc) => {
      const d = inc.timestamp.slice(0, 10);
      if (!map[d] || ICQ_SEV_ORDER[inc.severity] > ICQ_SEV_ORDER[map[d]]) map[d] = inc.severity;
    });
    return map;
  }, [incidents]);

  const firstDow    = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
  const cells       = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const canGoNext = viewYear < today.getUTCFullYear() || (viewYear === today.getUTCFullYear() && viewMonth < today.getUTCMonth());

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (!canGoNext) return;
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={prevMonth}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 active:scale-95">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-black text-slate-700">{ICQ_MONTHS[viewMonth]} {viewYear}</span>
          <button type="button" onClick={nextMonth} disabled={!canGoNext}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 active:scale-95 disabled:pointer-events-none disabled:opacity-30">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-1 grid grid-cols-7">
          {ICQ_DAYS.map(d => (
            <span key={d} className="text-center text-[9px] font-black uppercase tracking-wider text-slate-400">{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, i) => {
            if (!day) return <span key={i} />;
            const dateStr  = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const sev      = dayMap[dateStr];
            const isSelect = dateStr === selectedStr;
            const isToday  = dateStr === todayStr;
            const isFuture = dateStr > todayStr;
            return (
              <button
                key={i}
                type="button"
                disabled={isFuture}
                onClick={() => { onSelectDate(new Date(dateStr + 'T00:00:00Z')); onClose(); }}
                className={[
                  'flex h-8 w-full items-center justify-center rounded-lg text-xs font-semibold transition-all',
                  isFuture ? 'cursor-default opacity-25' : 'cursor-pointer',
                  isSelect ? 'ring-2 ring-indigo-500 ring-offset-1' : '',
                  sev
                    ? ICQ_SEV_CELL[sev]
                    : isToday
                    ? 'bg-slate-100 font-black text-slate-900 hover:bg-slate-200'
                    : !isFuture
                    ? 'text-slate-600 hover:bg-slate-100'
                    : 'text-slate-300',
                ].filter(Boolean).join(' ')}
              >
                {day}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-2.5">
          {([['bg-rose-500','High'],['bg-amber-400','Medium'],['bg-sky-400','Low']] as const).map(([c, l]) => (
            <div key={l} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 flex-shrink-0 rounded-full ${c}`} />
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">{l}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Incident Command Queue ───────────────────────────────────────────────────

function IncidentCommandQueue({
  sectionRef,
  seedIncidents = [],
  currentRole = 'MD',
}: {
  sectionRef?: React.RefObject<HTMLElement | null>;
  seedIncidents?: FieldIncident[];
  currentRole?: RoleKey;
}) {
  const CURRENT_ROLE = currentRole;
  const today = new Date();

  const [incidents, setIncidents] = useState<FieldIncident[]>(seedIncidents);

  const defaultDate = seedIncidents.length > 0
    ? new Date(seedIncidents[0].timestamp.slice(0, 10) + 'T00:00:00Z')
    : today;

  const [selectedDate, setSelectedDate] = useState<Date>(defaultDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedId,   setSelectedId]   = useState<string>(seedIncidents[0]?.id ?? '');

  useEffect(() => {
    setIncidents(seedIncidents);
    if (seedIncidents.length > 0) {
      setSelectedDate(new Date(seedIncidents[0].timestamp.slice(0, 10) + 'T00:00:00Z'));
      setSelectedId((current) =>
        seedIncidents.some((inc) => inc.id === current)
          ? current
          : seedIncidents[0].id,
      );
    } else {
      setSelectedId('');
    }
  }, [seedIncidents]);

  const handleAcknowledge = (id: string) => {
    setIncidents((prev) =>
      prev.map((inc) => inc.id === id ? { ...inc, ack: { ...inc.ack, [CURRENT_ROLE]: true } } : inc)
    );
  };

  const dayStart = new Date(selectedDate.toISOString().slice(0, 10) + 'T00:00:00Z');
  const dayEnd   = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const visibleIncidents = incidents.filter((inc) => {
    const t = new Date(inc.timestamp).getTime();
    return t >= dayStart.getTime() && t < dayEnd.getTime();
  });

  const selected = visibleIncidents.find((i) => i.id === selectedId) ?? visibleIncidents[0] ?? null;

  const rolling7Start = new Date(today);
  rolling7Start.setUTCDate(rolling7Start.getUTCDate() - 6);
  const rolling7End = new Date(today);
  rolling7End.setUTCDate(rolling7End.getUTCDate() + 1);
  const pendingCount = incidents.filter((i) => {
    const t = new Date(i.timestamp).getTime();
    return t >= rolling7Start.getTime() && t < rolling7End.getTime() && !i.ack[CURRENT_ROLE];
  }).length;

  const totalUnacknowledged = incidents.filter((i) => !i.ack[CURRENT_ROLE]).length;

  const fmtSelectedDate = (d: Date) =>
    d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

  return (
    <section
      ref={sectionRef}
      id="incident-command-queue"
      className="rounded-2xl border-2 border-slate-400 bg-slate-50/70 p-6 scroll-mt-28"
    >
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-200 bg-rose-50">
          <Radio className="h-4 w-4 text-rose-500" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-base font-black text-slate-900">Incident Command Queue</p>
            {totalUnacknowledged > 0 && (
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-black leading-none text-white shadow-sm">
                {totalUnacknowledged}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">Tri-role acknowledgement required for all field incidents</p>
        </div>

        {/* Calendar date picker */}
        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setCalendarOpen(o => !o)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-1.5 text-sm font-bold text-slate-600 transition hover:bg-white active:scale-95"
          >
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-mono">{fmtSelectedDate(selectedDate)}</span>
            <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform duration-150 ${calendarOpen ? 'rotate-180' : ''}`} />
          </button>
          {calendarOpen && (
            <IncidentCalendar
              incidents={incidents}
              selectedDate={selectedDate}
              onSelectDate={(d) => { setSelectedDate(d); setSelectedId(''); }}
              onClose={() => setCalendarOpen(false)}
              today={today}
            />
          )}
        </div>

        {pendingCount > 0 ? (
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-sm font-black text-white">
            {pendingCount} pending <span className="ml-1 font-normal opacity-80">(7d)</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2.5 py-0.5 text-sm font-black text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            All Clear
          </span>
        )}
      </div>

      {visibleIncidents.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-slate-200/60 bg-white/50">
          <div className="flex flex-col items-center gap-1.5">
            <CalendarDays className="h-5 w-5 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">No incidents on this date</p>
            <p className="text-[11px] text-slate-400">Use the calendar to browse history</p>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-2">
          {visibleIncidents.map((incident) => {
            const isSelected = incident.id === (selected?.id ?? '');
            const allRead    = incident.ack.OM && incident.ack.SM && incident.ack.MD;
            const isUnread   = !incident.ack[CURRENT_ROLE];
            const { time }   = fmtIncidentTs(incident.timestamp);

            return (
              <button
                key={incident.id}
                type="button"
                onClick={() => setSelectedId(incident.id)}
                className={`w-full rounded-2xl border p-3 text-left transition-all ${
                  isSelected
                    ? 'border-indigo-400/60 bg-indigo-50/80 shadow-sm'
                    : allRead
                    ? 'border-emerald-200/60 bg-white/70 hover:bg-white/90'
                    : 'border-rose-300/50 bg-rose-50/40 hover:bg-rose-50/70'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${FIELD_SEVERITY_DOT[incident.severity]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="font-mono text-sm text-slate-400">{incident.id}</p>
                      <span className="font-mono text-sm text-slate-400">{time}</span>
                    </div>
                    <p className="truncate text-sm font-black text-slate-900">{incident.site}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{incident.guardName}</p>
                    <div className="mt-1.5">
                      <IncidentTypeTag type={incident.incidentType} />
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      {(['OM', 'SM', 'MD'] as RoleKey[]).map((role) => (
                        <span
                          key={role}
                          className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-sm font-black ${
                            incident.ack[role]
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {incident.ack[role] ? <Eye className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>
                  {isUnread && <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-rose-500" />}
                </div>
              </button>
            );
          })}
        </div>

        <DarkGlassCard className="p-5">
          {!selected ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Radio className="h-10 w-10 text-slate-300 mb-2" />
              <p className="text-base font-bold text-slate-400">Select an incident</p>
            </div>
          ) : (
            <IncidentDetailPanel
              incident={selected}
              currentRole={CURRENT_ROLE}
              onAcknowledge={handleAcknowledge}
            />
          )}
        </DarkGlassCard>
      </div>
      )}
    </section>
  );
}

// ─── Shared Modal Shell ───────────────────────────────────────────────────────

function ModalShell({
  children,
  onClose,
  wide = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        className={`relative w-full rounded-2xl border border-white/75 bg-white/95 shadow-[0_24px_80px_-16px_rgba(15,23,42,0.3)] backdrop-blur-2xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({
  icon,
  title,
  badge,
  onClose,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-black uppercase tracking-tight text-slate-900">{title}</p>
        {badge}
      </div>
      <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Incident Detail Modal ─────────────────────────────────────────────────────

function IncidentModal({ incidents, sectorName, onClose }: { incidents: Incident[]; sectorName: string; onClose: () => void }) {
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader
        icon={<Siren className="h-4 w-4 text-rose-600" />}
        title={`Incidents — ${sectorName}`}
        onClose={onClose}
      />
      <div className="divide-y divide-slate-200/60 max-h-[70vh] overflow-y-auto">
        {incidents.map((inc) => (
          <div key={inc.id} className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full border border-rose-200/80 bg-rose-50/80 px-2 py-0.5 text-[10px] font-black text-rose-800">
                {inc.id}
              </span>
              <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" /> {inc.time}
              </span>
            </div>
            <div className="rounded-xl border border-slate-200/60 bg-slate-50/60 px-4 py-3 space-y-2">
              {[
                { label: 'What', value: inc.what },
                { label: 'Where', value: inc.where },
                { label: 'Who', value: inc.who },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="w-10 flex-shrink-0 pt-0.5 text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>
                  <span className="text-sm font-semibold text-slate-800 leading-snug">{value}</span>
                </div>
              ))}
              <div className="flex items-start gap-3">
                <span className="w-10 flex-shrink-0 pt-0.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Site</span>
                <span className="font-mono text-[11px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200/70 rounded-md px-2 py-0.5">{inc.siteCode}</span>
              </div>
            </div>
            {inc.penalty && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-3">
                <Gavel className="h-3.5 w-3.5 flex-shrink-0 text-amber-700 mt-0.5" />
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Penalty Applied</p>
                  <p className="mt-0.5 text-sm font-black text-amber-900">{inc.penalty}</p>
                  {inc.penaltyReason && <p className="text-[10px] font-medium text-amber-700 mt-0.5">{inc.penaltyReason}</p>}
                </div>
              </div>
            )}
          </div>
        ))}
        {incidents.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-slate-400">No incidents recorded.</div>
        )}
      </div>
    </ModalShell>
  );
}

// ─── Penalty Modal ─────────────────────────────────────────────────────────────

function PenaltyModal({ penalties, sectorName, onClose }: { penalties: Penalty[]; sectorName: string; onClose: () => void }) {
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader
        icon={<Gavel className="h-4 w-4 text-amber-600" />}
        title={`Penalties — ${sectorName}`}
        onClose={onClose}
      />
      <div className="divide-y divide-slate-200/60 max-h-[70vh] overflow-y-auto">
        {penalties.map((pen) => (
          <div key={pen.id} className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full border border-amber-200/80 bg-amber-50/80 px-2 py-0.5 text-[10px] font-black text-amber-800">
                {pen.id}
              </span>
              <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" /> {pen.time}
              </span>
            </div>
            <div className="rounded-xl border border-slate-200/60 bg-slate-50/60 px-4 py-3 space-y-2">
              {[
                { label: 'Who', value: pen.guard },
                { label: 'Site', value: pen.site },
                { label: 'Reason', value: pen.reason },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="w-10 flex-shrink-0 pt-0.5 text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>
                  <span className="text-sm font-semibold text-slate-800 leading-snug">{value}</span>
                </div>
              ))}
              <div className="flex items-start gap-3">
                <span className="w-10 flex-shrink-0 pt-0.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Code</span>
                <span className="font-mono text-[11px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200/70 rounded-md px-2 py-0.5">{pen.siteCode}</span>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Amount Issued</p>
              <p className="text-base font-black text-amber-900">{pen.amount}</p>
            </div>
          </div>
        ))}
        {penalties.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-slate-400">No penalties recorded.</div>
        )}
      </div>
    </ModalShell>
  );
}

// ─── Client Complaint Modal ────────────────────────────────────────────────────

function ComplaintModal({ complaints, sectorName, onClose }: { complaints: ClientComplaint[]; sectorName: string; onClose: () => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader
        icon={<MessageSquareWarning className="h-4 w-4 text-violet-600" />}
        title={`Client Complaints — ${sectorName}`}
        onClose={onClose}
      />
      <div className="divide-y divide-slate-200/60 max-h-[70vh] overflow-y-auto">
        {complaints.map((cc) => (
          <div key={cc.id} className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full border border-violet-200/80 bg-violet-50/80 px-2 py-0.5 text-[10px] font-black text-violet-800">
                {cc.id}
              </span>
              <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" /> {cc.time}
              </span>
            </div>
            <div className="rounded-xl border border-slate-200/60 bg-slate-50/60 px-4 py-3 space-y-2">
              {[
                { label: 'What', value: cc.what },
                { label: 'Who', value: cc.who },
                { label: 'Site', value: cc.site },
                { label: 'Client', value: cc.client },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="w-10 flex-shrink-0 pt-0.5 text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>
                  <span className="text-sm font-semibold text-slate-800 leading-snug">{value}</span>
                </div>
              ))}
              <div className="flex items-start gap-3">
                <span className="w-10 flex-shrink-0 pt-0.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Code</span>
                <span className="font-mono text-[11px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200/70 rounded-md px-2 py-0.5">{cc.siteCode}</span>
              </div>
            </div>
            {cc.note && (
              <div>
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === cc.id ? null : cc.id)}
                  className="flex w-full items-center gap-2 rounded-xl border border-violet-200/70 bg-violet-50/70 px-3 py-2 text-[11px] font-black text-violet-700 transition hover:bg-violet-100 active:scale-[0.99]"
                >
                  <MessageSquareWarning className="h-3.5 w-3.5 flex-shrink-0" />
                  {expandedId === cc.id ? 'Close Complaint' : 'Read Complaint'}
                  <ChevronDown className={`ml-auto h-3 w-3 text-violet-400 transition-transform duration-150 ${expandedId === cc.id ? 'rotate-180' : ''}`} />
                </button>
                {expandedId === cc.id && (
                  <div className="mt-2 rounded-xl border border-violet-100 bg-violet-50/40 px-4 py-3">
                    <p className="text-sm leading-relaxed text-slate-700">{cc.note}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {complaints.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-slate-400">No complaints recorded.</div>
        )}
      </div>
    </ModalShell>
  );
}

// ─── Shift Shorts Modal ────────────────────────────────────────────────────────

function ShiftShortsModal({
  shorts,
  shiftType,
  sectorName,
  onClose,
}: {
  shorts: ShiftShort[];
  shiftType: 'Day' | 'Night';
  sectorName: string;
  onClose: () => void;
}) {
  const isDay = shiftType === 'Day';
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader
        icon={isDay
          ? <Sun className="h-4 w-4 text-amber-600" />
          : <Moon className="h-4 w-4 text-indigo-600" />}
        title={`Upcoming ${shiftType} Shift Shortfalls — ${sectorName}`}
        onClose={onClose}
      />
      <div className="divide-y divide-slate-200/60 max-h-[70vh] overflow-y-auto">
        {shorts.map((short) => (
          <div key={short.site} className="px-5 py-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900 leading-snug">{short.site}</p>
                <span className="font-mono text-[11px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200/70 rounded-md px-2 py-0.5 inline-block mt-1">{short.siteCode}</span>
              </div>
              <span className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full border border-rose-200/80 bg-rose-50 text-sm font-black text-rose-700">
                −{short.missingCount}
              </span>
            </div>
            {short.missingGuards && short.missingGuards.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {short.missingGuards.map((g) => (
                  <span key={g} className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {shorts.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-slate-400">No shortfalls.</div>
        )}
      </div>
    </ModalShell>
  );
}

// ─── Continuation Shift Modal ──────────────────────────────────────────────────

function ContinuationModal({
  shifts,
  sectorName,
  defaultHour,
  onClose,
}: {
  shifts: ContinuationShift[];
  sectorName: string;
  defaultHour?: 24 | 36 | 48 | 60 | null;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<24 | 36 | 48 | 60 | null>(defaultHour ?? null);
  const filtered = selected ? shifts.filter((s) => s.hours === selected) : shifts;
  const hours = ([24, 36, 48, 60] as const).filter((h) => shifts.some((s) => s.hours === h));

  const HOUR_STYLE: Record<24 | 36 | 48 | 60, string> = {
    24: 'border-amber-200/80 bg-amber-50/80 text-amber-800',
    36: 'border-orange-200/80 bg-orange-50/80 text-orange-800',
    48: 'border-rose-200/80 bg-rose-50/80 text-rose-800',
    60: 'border-red-200/80 bg-red-50/80 text-red-800',
  };

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader
        icon={<Timer className="h-4 w-4 text-violet-600" />}
        title={`Continuation Guards — ${sectorName}`}
        onClose={onClose}
      />
      {hours.length > 0 && (
        <div className="flex items-center gap-1.5 border-b border-slate-200/60 px-5 py-3">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black transition-all ${
              !selected ? 'border-violet-200/80 bg-violet-50/80 text-violet-800' : 'border-slate-200/70 bg-white/60 text-slate-500'
            }`}
          >
            All
          </button>
          {hours.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setSelected(h === selected ? null : h)}
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black transition-all ${
                selected === h ? HOUR_STYLE[h] : 'border-slate-200/70 bg-white/60 text-slate-500'
              }`}
            >
              {h}h
            </button>
          ))}
        </div>
      )}
      <div className="divide-y divide-slate-200/60 max-h-[60vh] overflow-y-auto">
        {filtered.map((shift, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5">
            <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border text-xs font-black ${HOUR_STYLE[shift.hours]}`}>
              {shift.hours}h
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">{shift.guard}</p>
              <p className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5">
                <MapPin className="h-2.5 w-2.5 flex-shrink-0" />
                <span className="truncate">{shift.site}</span>
              </p>
            </div>
            <span className="font-mono text-[10px] font-black text-indigo-600 bg-indigo-50 border border-indigo-200/60 rounded px-1.5 py-0.5 flex-shrink-0">
              {shift.siteCode}
            </span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-slate-400">No continuation shifts for this filter.</div>
        )}
      </div>
    </ModalShell>
  );
}

// ─── Deficits Modal (per-sector) ──────────────────────────────────────────────

interface DeficitSiteRow {
  site: string;
  siteCode: string;
  day: number;
  night: number;
  dayGuards: string[];
  nightGuards: string[];
}

function DeficitsModal({ sector, onClose }: { sector: SectorCard; onClose: () => void }) {
  const rows: DeficitSiteRow[] = [];

  const allSiteCodes = new Set([
    ...sector.dayShiftShorts.map((s) => s.siteCode),
    ...sector.nightShiftShorts.map((s) => s.siteCode),
  ]);

  allSiteCodes.forEach((code) => {
    const day   = sector.dayShiftShorts.find((s) => s.siteCode === code);
    const night = sector.nightShiftShorts.find((s) => s.siteCode === code);
    rows.push({
      site:        day?.site ?? night?.site ?? code,
      siteCode:    code,
      day:         day?.missingCount ?? 0,
      night:       night?.missingCount ?? 0,
      dayGuards:   day?.missingGuards ?? [],
      nightGuards: night?.missingGuards ?? [],
    });
  });

  const totalShort = rows.reduce((sum, r) => sum + r.day + r.night, 0);

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader
        icon={<UserMinus className="h-4 w-4 text-orange-600" />}
        title={`Guard Deficits — ${sector.name}`}
        badge={
          <span className="ml-1 inline-flex items-center rounded-full border border-orange-200/80 bg-orange-50 px-2 py-0.5 text-[10px] font-black text-orange-700">
            {totalShort} short
          </span>
        }
        onClose={onClose}
      />
      <div className="divide-y divide-slate-200/60 max-h-[70vh] overflow-y-auto">
        {rows.length === 0 && (
          <div className="px-5 py-8 text-center text-sm text-slate-400">No deficits recorded.</div>
        )}
        {rows.map((row) => (
          <div key={row.siteCode} className="px-5 py-4 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900 leading-snug">{row.site}</p>
                <span className="font-mono text-[11px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200/70 rounded-md px-2 py-0.5 inline-block mt-1">
                  {row.siteCode}
                </span>
              </div>
              <span className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full border border-orange-200/80 bg-orange-50 text-sm font-black text-orange-700">
                −{row.day + row.night}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {row.day > 0 && (
                <div className="rounded-xl border border-amber-200/70 bg-amber-50/60 px-3 py-2">
                  <p className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-amber-600 mb-1.5">
                    <Sun className="h-2.5 w-2.5" /> Day Shift −{row.day}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {row.dayGuards.map((g) => (
                      <span key={g} className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-2 py-0.5 text-[9px] font-semibold text-slate-600">
                        <span className="h-1 w-1 rounded-full bg-amber-400 flex-shrink-0" />{g}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {row.night > 0 && (
                <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/60 px-3 py-2">
                  <p className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-indigo-600 mb-1.5">
                    <Moon className="h-2.5 w-2.5" /> Night Shift −{row.night}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {row.nightGuards.map((g) => (
                      <span key={g} className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-2 py-0.5 text-[9px] font-semibold text-slate-600">
                        <span className="h-1 w-1 rounded-full bg-indigo-400 flex-shrink-0" />{g}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

// ─── Nearby off-duty guards (live from MNR) ───────────────────────────────────

interface NearbyGuard {
  name: string;
  empNo: string;
  distanceKm: number;
  phone: string;
  status: 'Off Duty' | 'On Leave';
}

function NearestGuardPopup({
  site,
  sectorName,
  onClose,
}: {
  site: string;
  sectorName: string;
  onClose: () => void;
}) {
  const [guards, setGuards] = useState<NearbyGuard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchOffDutyGuardsForSector(sectorName).then((rows) => {
      if (cancelled) return;
      setGuards(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sectorName]);

  return (
    <>
      <div className="fixed inset-0 z-[400]" onClick={onClose} />
      <div className="absolute right-0 top-full z-[400] mt-1.5 w-80 rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50">
              <MapPin className="h-3.5 w-3.5 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-900">Nearest Off-Duty Guards</p>
              <p className="text-[9px] text-slate-400 truncate max-w-[180px]">{site} · within 15 km</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
          {loading && (
            <div className="px-4 py-6 text-center text-xs text-slate-400">Loading off-duty guards…</div>
          )}
          {!loading && guards.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-slate-400">No guards found within 15 km.</div>
          )}
          {guards.map((g) => (
            <div key={g.empNo} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-black text-slate-700">
                {g.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-slate-900 truncate">{g.name}</p>
                <p className="font-mono text-[9px] text-slate-400">{g.empNo}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-black ${
                  g.distanceKm <= 5
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : g.distanceKm <= 10
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}>
                  <MapPin className="h-2 w-2" />
                  {g.distanceKm} km
                </span>
                <a
                  href={`tel:${g.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-0.5 rounded-lg border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-black text-indigo-700 transition hover:bg-indigo-100"
                >
                  <Phone className="h-2.5 w-2.5" />
                  Call
                </a>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 px-4 py-2">
          <p className="text-[9px] text-slate-400">
            {guards.filter((g) => g.status === 'Off Duty').length} off duty · {guards.filter((g) => g.status === 'On Leave').length} on leave
          </p>
        </div>
      </div>
    </>
  );
}

// ─── Guard Vacancies Modal ────────────────────────────────────────────────────

function GuardVacanciesModal({ sectors, onClose }: { sectors: SectorCard[]; onClose: () => void }) {
  const rows = sectors.flatMap((sector) =>
    [...sector.dayShiftShorts, ...sector.nightShiftShorts]
      .filter((short) => short.missingCount > 0)
      .map((short) => ({
        sector: sector.name,
        site: short.site,
        siteCode: short.siteCode,
        vacancies: short.missingCount,
      }))
  ).sort((a, b) => b.vacancies - a.vacancies);

  const totalVacancies = rows.reduce((sum, row) => sum + row.vacancies, 0);

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader
        icon={<Users className="h-4 w-4 text-indigo-600" />}
        title="Open Guard Vacancies"
        badge={
          <span className="ml-2 inline-flex items-center rounded-full border border-indigo-200/80 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-black text-indigo-700">
            {totalVacancies} open · {rows.length} sites
          </span>
        }
        onClose={onClose}
      />
      <div className="max-h-[60vh] divide-y divide-slate-200/60 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">No open vacancies.</div>
        ) : (
          rows.map((row) => (
            <div key={`${row.siteCode}-${row.sector}`} className="flex items-center gap-4 px-5 py-3.5">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-indigo-200/80 bg-indigo-50 text-sm font-black text-indigo-700">
                −{row.vacancies}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-900 leading-tight">{row.site}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">{row.sector}</p>
              </div>
              <span className="font-mono text-[10px] font-black text-indigo-600">{row.siteCode}</span>
            </div>
          ))
        )}
      </div>
    </ModalShell>
  );
}

// ─── Coverage Snapshot Modal ───────────────────────────────────────────────────

function CoverageSnapshotModal({
  sectors,
  dateView,
  onClose,
}: {
  sectors: SectorCard[];
  dateView: DateView;
  onClose: () => void;
}) {
  const summary = getSummary(sectors);
  const absent = summary.totalGuards - summary.totalOnShift;
  const onShiftShare = summary.totalGuards > 0 ? (summary.totalOnShift / summary.totalGuards) * 100 : 0;
  const absentShare = 100 - onShiftShare;
  const dateChip = DATE_VIEW_SHORTFALL_META[dateView].chip;

  const sectorRows = sectors
    .map((sector) => ({
      name: sector.name,
      pct: sector.guardsTotal > 0 ? Math.round((sector.guardsOnShift / sector.guardsTotal) * 100) : 0,
      onShift: sector.guardsOnShift,
      total: sector.guardsTotal,
    }))
    .sort((a, b) => a.pct - b.pct);

  return (
    <ModalShell onClose={onClose} wide>
      <ModalHeader
        icon={<Activity className="h-4 w-4 text-emerald-600" />}
        title="Coverage Analytics"
        badge={
          <span className="ml-2 inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black text-emerald-800">
            {summary.coveragePct}% · {dateChip}
          </span>
        }
        onClose={onClose}
      />
      <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'On shift', value: summary.totalOnShift, accent: 'text-emerald-800', bg: 'bg-emerald-50/80 border-emerald-100' },
            { label: 'Not on shift', value: absent, accent: 'text-rose-800', bg: 'bg-rose-50/80 border-rose-100' },
            { label: 'Active deficits', value: summary.totalDeficits, accent: 'text-amber-800', bg: 'bg-amber-50/80 border-amber-100' },
            { label: 'Open incidents', value: summary.totalIncidents, accent: 'text-indigo-800', bg: 'bg-indigo-50/80 border-indigo-100' },
          ].map((k) => (
            <div key={k.label} className={`rounded-xl border px-3 py-3 ${k.bg}`}>
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">{k.label}</p>
              <p className={`mt-1 text-xl font-black tabular-nums ${k.accent}`}>{k.value}</p>
            </div>
          ))}
        </div>

        <section className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Fleet roster split</p>
          <div className="mt-4 flex h-8 w-full overflow-hidden rounded-xl ring-1 ring-slate-200/80">
            <div className="flex items-center justify-center bg-emerald-500 text-[10px] font-black text-white" style={{ width: `${onShiftShare}%` }}>
              {onShiftShare >= 12 ? `${Math.round(onShiftShare)}%` : ''}
            </div>
            <div className="flex items-center justify-center bg-rose-400 text-[10px] font-black text-white" style={{ width: `${absentShare}%` }}>
              {absentShare >= 12 ? `${Math.round(absentShare)}%` : ''}
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sector coverage</p>
          {sectorRows.map((row) => (
            <div key={row.name} className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white px-3 py-2.5">
              <span className="min-w-[3rem] text-sm font-black tabular-nums text-slate-900">{row.pct}%</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">{row.name}</p>
                <p className="text-[10px] text-slate-500">{row.onShift}/{row.total} guards on shift</p>
              </div>
            </div>
          ))}
        </section>
      </div>
    </ModalShell>
  );
}

// ─── Tactical Deficits Modal (global, all sectors) ─────────────────────────────

function TacticalDeficitsModal({ sectors, onClose }: { sectors: SectorCard[]; onClose: () => void }) {
  const [activeSector, setActiveSector] = useState<string>('ALL');
  const [nearestGuardFor, setNearestGuardFor] = useState<{ siteCode: string; site: string; sectorName: string } | null>(null);

  const allRows: (DeficitSiteRow & { sector: string; sectorId: string })[] = [];

  sectors.forEach((sector) => {
    const allCodes = new Set([
      ...sector.dayShiftShorts.map((s) => s.siteCode),
      ...sector.nightShiftShorts.map((s) => s.siteCode),
    ]);
    allCodes.forEach((code) => {
      const day   = sector.dayShiftShorts.find((s) => s.siteCode === code);
      const night = sector.nightShiftShorts.find((s) => s.siteCode === code);
      const total = (day?.missingCount ?? 0) + (night?.missingCount ?? 0);
      if (total > 0) {
        allRows.push({
          sector:      sector.name,
          sectorId:    sector.id,
          site:        day?.site ?? night?.site ?? code,
          siteCode:    code,
          day:         day?.missingCount ?? 0,
          night:       night?.missingCount ?? 0,
          dayGuards:   day?.missingGuards ?? [],
          nightGuards: night?.missingGuards ?? [],
        });
      }
    });
  });

  allRows.sort((a, b) => (b.day + b.night) - (a.day + a.night));

  const sectorNames = Array.from(new Set(allRows.map((r) => r.sector)));
  const visibleRows = activeSector === 'ALL' ? allRows : allRows.filter((r) => r.sector === activeSector);

  const totalShort = allRows.reduce((sum, r) => sum + r.day + r.night, 0);
  const totalSites = allRows.length;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-white/75 bg-white/95 shadow-[0_24px_80px_-16px_rgba(15,23,42,0.3)] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader
          icon={<ShieldAlert className="h-4 w-4 text-orange-600" />}
          title="Live Tactical Deficits"
          badge={
            <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-orange-200/80 bg-orange-50 px-2.5 py-0.5 text-[10px] font-black text-orange-700">
              {totalShort} unassigned · {totalSites} sites
            </span>
          }
          onClose={onClose}
        />
        <div className="px-5 py-3 border-b border-slate-100 grid grid-cols-3 gap-3">
          {[
            { label: 'Total Unassigned', value: totalShort, color: 'text-orange-700' },
            { label: 'Sites Affected',   value: totalSites, color: 'text-rose-700' },
            { label: 'Sectors Affected', value: sectorNames.length, color: 'text-slate-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-slate-200/60 bg-slate-50/60 px-3 py-2.5 text-center">
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{label}</p>
              <p className={`mt-0.5 text-xl font-black tabular-nums ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── Sector Tabs ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 px-5 py-2.5 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveSector('ALL')}
            className={`flex-shrink-0 rounded-full border px-3 py-1 text-[10px] font-black transition-all ${
              activeSector === 'ALL'
                ? 'border-orange-300/80 bg-orange-50 text-orange-800'
                : 'border-slate-200/70 bg-white/60 text-slate-500 hover:bg-slate-50'
            }`}
          >
            All Sectors
          </button>
          {sectorNames.map((name) => {
            const count = allRows.filter((r) => r.sector === name).reduce((s, r) => s + r.day + r.night, 0);
            const isActive = activeSector === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => setActiveSector(name)}
                className={`flex-shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black transition-all ${
                  isActive
                    ? 'border-indigo-300/80 bg-indigo-50 text-indigo-800'
                    : 'border-slate-200/70 bg-white/60 text-slate-500 hover:bg-slate-50'
                }`}
              >
                {name}
                <span className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-black ${
                  isActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="divide-y divide-slate-200/60 max-h-[45vh] overflow-y-auto">
          {visibleRows.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No active deficits.</div>
          )}
          {visibleRows.map((row) => (
            <div key={`${row.sectorId}-${row.siteCode}`} className="flex items-center gap-4 px-5 py-3.5">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-orange-200/80 bg-orange-50 text-sm font-black text-orange-700">
                −{row.day + row.night}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-900 leading-tight">{row.site}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{row.sector}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
                {row.day > 0 && (
                  <span className="flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-700">
                    <Sun className="h-2.5 w-2.5" /> Day −{row.day}
                  </span>
                )}
                {row.night > 0 && (
                  <span className="flex items-center gap-1 rounded-full border border-indigo-200/80 bg-indigo-50 px-2 py-0.5 text-[9px] font-black text-indigo-700">
                    <Moon className="h-2.5 w-2.5" /> Night −{row.night}
                  </span>
                )}
                <span className="font-mono text-[10px] font-black text-indigo-600 bg-indigo-50 border border-indigo-200/60 rounded px-1.5 py-0.5">
                  {row.siteCode}
                </span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setNearestGuardFor(
                        nearestGuardFor?.siteCode === row.siteCode && nearestGuardFor?.sectorName === row.sector
                          ? null
                          : { siteCode: row.siteCode, site: row.site, sectorName: row.sector }
                      )
                    }
                    className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-black text-indigo-700 transition-all hover:bg-indigo-100 hover:border-indigo-300 active:scale-[0.97]"
                  >
                    <MapPin className="h-3 w-3" />
                    Find Nearest Guard (15km)
                  </button>
                  {nearestGuardFor?.siteCode === row.siteCode && nearestGuardFor?.sectorName === row.sector && (
                    <NearestGuardPopup
                      site={row.site}
                      sectorName={row.sector}
                      onClose={() => setNearestGuardFor(null)}
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Continuation Hour Pill styles ────────────────────────────────────────────

const CONT_HOUR_ACTIVE: Record<24 | 36 | 48 | 60, { pill: string; count: string; label: string }> = {
  24: { pill: 'border-amber-200/80 bg-amber-50/80 hover:bg-amber-100/80 cursor-pointer', count: 'text-amber-800', label: 'text-amber-600' },
  36: { pill: 'border-orange-200/80 bg-orange-50/80 hover:bg-orange-100/80 cursor-pointer', count: 'text-orange-800', label: 'text-orange-600' },
  48: { pill: 'border-rose-200/80 bg-rose-50/80 hover:bg-rose-100/80 cursor-pointer', count: 'text-rose-800', label: 'text-rose-600' },
  60: { pill: 'border-red-200/80 bg-red-50/80 hover:bg-red-100/80 cursor-pointer', count: 'text-red-800', label: 'text-red-600' },
};

// ─── Sector Card ─────────────────────────────────────────────────────────────

type SectorModal =
  | { kind: 'incidents' }
  | { kind: 'penalties' }
  | { kind: 'complaints' }
  | { kind: 'day-shorts' }
  | { kind: 'night-shorts' }
  | { kind: 'continuation'; hour?: 24 | 36 | 48 | 60 }
  | { kind: 'deficits' };

function SectorTile({ sector, dateView }: { sector: SectorCard; dateView: DateView }) {
  const s = SECTOR_STATUS_STYLES[sector.status];
  const shortfallMeta = DATE_VIEW_SHORTFALL_META[dateView];
  const [modal, setModal] = useState<SectorModal | null>(null);

  const pct             = sector.guardsTotal > 0 ? Math.round((sector.guardsOnShift / sector.guardsTotal) * 100) : 0;
  const coverageColor   = pct >= 90 ? 'text-emerald-700' : pct >= 75 ? 'text-amber-700' : 'text-rose-700';
  const totalDayShorts  = sector.dayShiftShorts.reduce((acc, x) => acc + x.missingCount, 0);
  const totalNightShorts = sector.nightShiftShorts.reduce((acc, x) => acc + x.missingCount, 0);

  const contByHour = { 24: 0, 36: 0, 48: 0, 60: 0 } as Record<24 | 36 | 48 | 60, number>;
  sector.continuationShifts.forEach((c) => { contByHour[c.hours]++; });
  const totalCont = sector.continuationShifts.length;

  const close = () => setModal(null);

  return (
    <>
      {modal?.kind === 'incidents'   && <IncidentModal  incidents={sector.incidents}         sectorName={sector.name} onClose={close} />}
      {modal?.kind === 'penalties'   && <PenaltyModal   penalties={sector.penalties}         sectorName={sector.name} onClose={close} />}
      {modal?.kind === 'complaints'  && <ComplaintModal complaints={sector.clientComplaints} sectorName={sector.name} onClose={close} />}
      {modal?.kind === 'day-shorts'  && <ShiftShortsModal shorts={sector.dayShiftShorts}   shiftType="Day"   sectorName={sector.name} onClose={close} />}
      {modal?.kind === 'night-shorts'&& <ShiftShortsModal shorts={sector.nightShiftShorts} shiftType="Night" sectorName={sector.name} onClose={close} />}
      {modal?.kind === 'continuation'&& <ContinuationModal shifts={sector.continuationShifts} sectorName={sector.name} defaultHour={modal.hour} onClose={close} />}
      {modal?.kind === 'deficits'    && <DeficitsModal sector={sector} onClose={close} />}

      <div
        className={`relative flex flex-col overflow-hidden rounded-2xl backdrop-blur-sm transition-all duration-200 ${s.frame} ${s.hoverFrame}`}
      >
        <div className={`absolute inset-x-0 top-0 h-[3px] ${s.stripe}`} />

        <div className="flex flex-1 flex-col pl-5 pr-5 pt-4 pb-4 gap-3">

          {/* ── Header ── */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${s.dot}`} />
                <h3 className="text-[14px] font-black leading-tight text-slate-900 truncate">{sector.name}</h3>
              </div>
              <p className="flex min-w-0 items-center gap-1 text-[10px] text-slate-500 pl-3.5">
                <Building2 className="h-2.5 w-2.5 flex-shrink-0 text-slate-400" />
                <span className="font-semibold text-slate-700 truncate">{sector.sm}</span>
                <span className="text-slate-300 flex-shrink-0">·</span>
                <span className="flex-shrink-0 font-mono">{sector.smPhone}</span>
              </p>
            </div>
            <span className={`flex-shrink-0 rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${s.badge}`}>
              {s.badgeText}
            </span>
          </div>

          {/* ── Stats strip ── */}
          <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200/60">
            <div className="border-r border-slate-200/60 bg-indigo-50/70 px-3 py-2 text-center">
              <p className="text-[8px] font-bold uppercase tracking-wider text-indigo-400">Guards</p>
              <p className="mt-0.5 text-sm font-black leading-none tabular-nums text-indigo-900">
                {sector.guardsOnShift}<span className="text-[10px] font-semibold text-indigo-400">/{sector.guardsTotal}</span>
              </p>
            </div>
            <div className="border-r border-slate-200/60 bg-violet-50/70 px-3 py-2 text-center">
              <p className="text-[8px] font-bold uppercase tracking-wider text-violet-400">Sites</p>
              <p className="mt-0.5 text-sm font-black leading-none tabular-nums text-violet-900">
                {sector.sitesToday}<span className="text-[10px] font-semibold text-violet-400">/{sector.sitesTotal}</span>
              </p>
            </div>
            <div className={`px-3 py-2 text-center ${pct >= 90 ? 'bg-emerald-50/70' : pct >= 75 ? 'bg-amber-50/70' : 'bg-rose-50/70'}`}>
              <p className={`text-[8px] font-bold uppercase tracking-wider ${pct >= 90 ? 'text-emerald-500' : pct >= 75 ? 'text-amber-500' : 'text-rose-500'}`}>Coverage</p>
              <p className={`mt-0.5 text-sm font-black leading-none tabular-nums ${coverageColor}`}>{pct}%</p>
            </div>
          </div>

          {/* ── Upcoming Shift Shortfalls ── */}
          <div>
            <p className="mb-1.5 text-[8px] font-black uppercase tracking-widest text-slate-400">{shortfallMeta.title}</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => totalDayShorts > 0 ? setModal({ kind: 'day-shorts' }) : undefined}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-all ${
                  totalDayShorts > 0
                    ? 'border-amber-200/80 bg-amber-50/70 hover:bg-amber-100/70'
                    : 'border-slate-200/50 bg-slate-50/40 opacity-50 cursor-default'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-amber-700">
                  <Sun className="h-3 w-3 flex-shrink-0" /> Day
                </span>
                <span className={`text-sm font-black tabular-nums ${totalDayShorts > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                  {totalDayShorts > 0 ? `−${totalDayShorts}` : '—'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => totalNightShorts > 0 ? setModal({ kind: 'night-shorts' }) : undefined}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-all ${
                  totalNightShorts > 0
                    ? 'border-indigo-200/80 bg-indigo-50/70 hover:bg-indigo-100/70'
                    : 'border-slate-200/50 bg-slate-50/40 opacity-50 cursor-default'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-indigo-700">
                  <Moon className="h-3 w-3 flex-shrink-0" /> Night
                </span>
                <span className={`text-sm font-black tabular-nums ${totalNightShorts > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                  {totalNightShorts > 0 ? `−${totalNightShorts}` : '—'}
                </span>
              </button>
            </div>
          </div>

          {/* ── Alerts ── */}
          <div>
            <p className="mb-1.5 text-[8px] font-black uppercase tracking-widest text-slate-400">Alerts</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => sector.openIncidents > 0 && setModal({ kind: 'incidents' })}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[10px] font-black transition-all ${
                  sector.openIncidents > 0
                    ? 'border-rose-200/80 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    : 'border-slate-200/50 bg-slate-50/40 text-slate-400 cursor-default'
                }`}
              >
                <Siren className="h-3 w-3 flex-shrink-0" />
                {sector.openIncidents} Incident{sector.openIncidents !== 1 ? 's' : ''}
              </button>
              <button
                type="button"
                onClick={() => sector.penalties.length > 0 && setModal({ kind: 'penalties' })}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[10px] font-black transition-all ${
                  sector.penalties.length > 0
                    ? 'border-amber-200/80 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : 'border-slate-200/50 bg-slate-50/40 text-slate-400 cursor-default'
                }`}
              >
                <Gavel className="h-3 w-3 flex-shrink-0" />
                {sector.penalties.length} Penalt{sector.penalties.length !== 1 ? 'ies' : 'y'}
              </button>
              <button
                type="button"
                onClick={() => sector.clientComplaints.length > 0 && setModal({ kind: 'complaints' })}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[10px] font-black transition-all ${
                  sector.clientComplaints.length > 0
                    ? 'border-violet-200/80 bg-violet-50 text-violet-700 hover:bg-violet-100'
                    : 'border-slate-200/50 bg-slate-50/40 text-slate-400 cursor-default'
                }`}
              >
                <MessageSquareWarning className="h-3 w-3 flex-shrink-0" />
                {sector.clientComplaints.length} Complaint{sector.clientComplaints.length !== 1 ? 's' : ''}
              </button>
              <button
                type="button"
                onClick={() => sector.deficits > 0 && setModal({ kind: 'deficits' })}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[10px] font-black transition-all ${
                  sector.deficits > 0
                    ? 'border-orange-200/80 bg-orange-50 text-orange-700 hover:bg-orange-100'
                    : 'border-slate-200/50 bg-slate-50/40 text-slate-400 cursor-default'
                }`}
              >
                <UserMinus className="h-3 w-3 flex-shrink-0" />
                {sector.deficits} Deficit{sector.deficits !== 1 ? 's' : ''}
              </button>
            </div>
          </div>

          {/* ── Continuation Guards ── */}
          <div>
            <p className="mb-1.5 text-[8px] font-black uppercase tracking-widest text-slate-400">Continuation Guards</p>
            <div className="grid grid-cols-4 gap-1">
              {([24, 36, 48, 60] as const).map((h) => {
                const count = contByHour[h];
                const a = CONT_HOUR_ACTIVE[h];
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => count > 0 && setModal({ kind: 'continuation', hour: h })}
                    className={`flex flex-col items-center rounded-xl border py-2 transition-all ${
                      count > 0
                        ? a.pill
                        : 'border-slate-200/50 bg-slate-50/40 cursor-default opacity-40'
                    }`}
                  >
                    <span className={`text-sm font-black tabular-nums leading-none ${count > 0 ? a.count : 'text-slate-400'}`}>
                      {count}
                    </span>
                    <span className={`mt-0.5 text-[8px] font-black uppercase tracking-wide ${count > 0 ? a.label : 'text-slate-400'}`}>
                      {h}h
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="mt-auto border-t border-slate-100 pt-2">
            <p className="flex items-center gap-1 text-[9px] text-slate-400">
              <Clock className="h-2.5 w-2.5" /> Sync {sector.lastUpdate}
            </p>
          </div>

        </div>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export type OperationsPortal = 'executive' | 'om';

function OperationsPageInner({ portal = 'executive' }: { portal?: OperationsPortal }) {
  const omPortal = portal === 'om';
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = tabFromSearchParam(searchParams.get('tab'));
  const [dateView, setDateView] = useState<DateView>('today');
  const [tacticalDeficitsOpen, setTacticalDeficitsOpen] = useState(false);
  const [vacanciesOpen, setVacanciesOpen] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [radarLoading, setRadarLoading] = useState(true);
  const [liveSectors, setLiveSectors] = useState<SectorCard[]>([]);
  const [liveIncidents, setLiveIncidents] = useState<FieldIncident[]>([]);
  const [radarError, setRadarError] = useState<string | undefined>();
  const incidentQueueRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (omPortal && activeTab === 'site-allocation') {
      router.replace('/om/sites/guards');
    }
  }, [omPortal, activeTab, router]);

  useEffect(() => {
    let cancelled = false;

    const run = async (silent: boolean) => {
      if (!silent) setRadarLoading(true);
      const radar = await getLiveFieldRadar();
      if (cancelled) return;
      setLiveSectors(radar.sectors as SectorCard[]);
      setLiveIncidents(radar.fieldIncidents as FieldIncident[]);
      setRadarError(radar.error);
      if (!silent) setRadarLoading(false);
    };

    run(false);
    const intervalId = window.setInterval(() => {
      void run(true);
    }, COMMAND_CENTER_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const activeSectors = getDateViewSectors(liveSectors, dateView);
  const summary = getSummary(activeSectors);
  const vacancyStats = getSectorVacancyStats(activeSectors);

  const scrollToIncidentQueue = useCallback(() => {
    scrollMainToElement(incidentQueueRef.current);
  }, []);

  const now = new Date();
  const timeLabel = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const modals = (
    <>
      {tacticalDeficitsOpen && (
        <TacticalDeficitsModal sectors={activeSectors} onClose={() => setTacticalDeficitsOpen(false)} />
      )}
      {vacanciesOpen && (
        <GuardVacanciesModal sectors={activeSectors} onClose={() => setVacanciesOpen(false)} />
      )}
      {coverageOpen && (
        <CoverageSnapshotModal
          sectors={activeSectors}
          dateView={dateView}
          onClose={() => setCoverageOpen(false)}
        />
      )}
    </>
  );

  const dateChip =
    activeTab === 'tactical' ? (
      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-slate-600 shadow-sm">
        Viewing: {DATE_VIEW_SHORTFALL_META[dateView].chip}
      </span>
    ) : null;

  const tabContent = (
    <>
        {activeTab === 'tactical' && (
          <div className="space-y-8">
            {radarError ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                {radarError}
              </p>
            ) : null}
            {radarLoading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-20 rounded-2xl bg-slate-100" />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-28 rounded-2xl bg-slate-100" />
                  ))}
                </div>
                <div className="h-64 rounded-2xl bg-slate-100" />
              </div>
            ) : (
            <>
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Field snapshot</p>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  Tap any KPI card below for coverage charts, vacancies, incidents, or deficits.
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-1 rounded-2xl border border-white/70 bg-slate-50/80 p-1 shadow-inner sm:w-auto">
                {([
                  { id: 'today', label: 'Today' },
                  { id: 'yesterday', label: 'Yesterday' },
                  { id: 'day-before', label: 'Day Before' },
                ] as { id: DateView; label: string }[]).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDateView(d.id)}
                    className={`flex-1 rounded-xl px-2 py-2 text-[10px] font-black transition-all sm:flex-none sm:px-4 sm:text-xs ${
                      dateView === d.id
                        ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryKpi
                icon={Users}
                label="Open Guard Vacancies"
                value={vacancyStats.totalVacancies}
                sub={`${vacancyStats.siteCount} sites need staffing`}
                accent="indigo"
                hint="View sites, ranks & counts"
                onClick={() => setVacanciesOpen(true)}
              />
              <SummaryKpi
                icon={Activity}
                label="Overall Coverage"
                value={`${summary.coveragePct}%`}
                sub={`${summary.totalOnShift}/${summary.totalGuards} guards on shift`}
                accent={summary.coveragePct >= 90 ? 'emerald' : summary.coveragePct >= 75 ? 'amber' : 'rose'}
                hint="View coverage charts"
                onClick={() => setCoverageOpen(true)}
              />
              <SummaryKpi
                icon={Siren}
                label="Open Field Incidents"
                value={summary.totalIncidents}
                sub={summary.totalIncidents > 0 ? 'Awaiting OM triage' : 'No active incidents'}
                accent={summary.totalIncidents > 0 ? 'rose' : 'emerald'}
                hint="Open incident command queue"
                onClick={scrollToIncidentQueue}
              />
              <SummaryKpi
                icon={UserMinus}
                label="Active Guard Deficits"
                value={summary.totalDeficits}
                sub="Unassigned posts today"
                accent={summary.totalDeficits > 8 ? 'rose' : summary.totalDeficits > 3 ? 'amber' : 'emerald'}
                hint="Open live tactical deficits"
                onClick={() => setTacticalDeficitsOpen(true)}
              />
            </div>

            <section>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-500" />
                  <div>
                    <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-700">
                      Sector-Level Live Status
                    </h2>
                    <p className="mt-0.5 text-[10px] font-medium text-slate-500">
                      {dateView === 'today'
                        ? 'Live roster plus upcoming day & night shift gaps per sector'
                        : DATE_VIEW_SHORTFALL_META[dateView].hint}
                    </p>
                  </div>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-slate-600 shadow-sm">
                  Viewing: {DATE_VIEW_SHORTFALL_META[dateView].chip}
                </span>
              </div>

              {activeSectors.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/60 px-6 py-16 text-center">
                  <MapPin className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-bold text-slate-700">No sector activity yet</p>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
                    Live vacancies, coverage, and deficits appear once sector managers, sites, and
                    guards are seeded in MNR and site assignments.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {activeSectors
                    .slice()
                    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
                    .map((sector) => (
                      <SectorTile key={sector.id} sector={sector} dateView={dateView} />
                    ))}
                </div>
              )}
            </section>

            <IncidentCommandQueue
              sectionRef={incidentQueueRef}
              seedIncidents={liveIncidents}
              currentRole={omPortal ? 'OM' : 'MD'}
            />
            </>
            )}
          </div>
        )}

        {activeTab === 'site-allocation' && <SiteAllocationTab />}

        {activeTab === 'guard-cards' && <GuardCardsTab />}
    </>
  );

  if (omPortal) {
    return (
      <>
        {modals}
        <OmCommandShellLayout
          title="Tactical dashboard"
          subtitle={`Live field radar · ${dateLabel} · ${timeLabel}`}
          icon={Activity}
          accent="rose"
          live
          maxWidth="wide"
          headerExtra={dateChip}
        >
          <div className="space-y-8">{tabContent}</div>
        </OmCommandShellLayout>
      </>
    );
  }

  return (
    <div className="min-h-0 pb-24 font-sans">
      {modals}

      <header className="sticky top-0 z-50 border-b border-white/60 bg-white/45 px-4 py-4 shadow-[0_8px_32px_-12px_rgba(15,23,42,0.08)] backdrop-blur-xl backdrop-saturate-150 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900 sm:text-2xl">
              CV Operations
            </h1>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-indigo-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
              Live Field Radar · {dateLabel} · {timeLabel}
            </p>
          </div>
          {dateChip}
        </div>
      </header>

      <div className="w-full space-y-8 px-6 py-8 lg:px-12 2xl:px-24">
        <OmSubnav
          commandCenterBase="/executive/operations"
          commandCenterTabs={['tactical', 'guard-cards']}
          showOperationsRoutes={false}
        />
        {tabContent}
      </div>
    </div>
  );
}

export default function OperationsPage({ portal = 'executive' }: { portal?: OperationsPortal }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] animate-pulse px-6 py-8 lg:px-12 2xl:px-24">
          <div className="mb-8 h-12 rounded-2xl bg-slate-100" />
          <div className="h-[4.5rem] rounded-2xl bg-slate-100" />
        </div>
      }
    >
      <OperationsPageInner portal={portal} />
    </Suspense>
  );
}
