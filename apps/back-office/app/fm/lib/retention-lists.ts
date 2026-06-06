/** Guards on hard stop — previous month shifts below threshold (Apr 2026). */
export const FM_PREV_MONTH_STOP_LIST = [
  { empNo: 'G-007', name: 'Kasun Herath', shiftsHere: 0, totalGross: 0, totalDeductions: 0, netTakeHome: 0, prevShifts: 8 },
  { empNo: 'G-011', name: 'Tharaka Gunawardena', shiftsHere: 0, totalGross: 0, totalDeductions: 0, netTakeHome: 0, prevShifts: 12 },
  { empNo: 'G-014', name: 'Manoj Karunasena', shiftsHere: 0, totalGross: 0, totalDeductions: 0, netTakeHome: 0, prevShifts: 6 },
  { empNo: 'G-019', name: 'Nisith Wickrama', shiftsHere: 0, totalGross: 0, totalDeductions: 0, netTakeHome: 0, prevShifts: 14 },
  { empNo: 'G-023', name: 'Lahiru Pathirana', shiftsHere: 0, totalGross: 0, totalDeductions: 0, netTakeHome: 0, prevShifts: 9 },
  { empNo: 'G-031', name: 'Chathura Seneviratne', shiftsHere: 0, totalGross: 0, totalDeductions: 0, netTakeHome: 0, prevShifts: 11 },
  { empNo: 'G-038', name: 'Rohan Kumarasinghe', shiftsHere: 0, totalGross: 0, totalDeductions: 0, netTakeHome: 0, prevShifts: 7 },
  { empNo: 'G-045', name: 'Saman Dissanayake', shiftsHere: 0, totalGross: 0, totalDeductions: 0, netTakeHome: 0, prevShifts: 15 },
  { empNo: 'G-052', name: 'Dinesh Abeywickrama', shiftsHere: 0, totalGross: 0, totalDeductions: 0, netTakeHome: 0, prevShifts: 10 },
  { empNo: 'G-061', name: 'Prasanna Jayasinghe', shiftsHere: 0, totalGross: 0, totalDeductions: 0, netTakeHome: 0, prevShifts: 13 },
  { empNo: 'G-074', name: 'Nuwan Fernandopulle', shiftsHere: 0, totalGross: 0, totalDeductions: 0, netTakeHome: 0, prevShifts: 5 },
  { empNo: 'G-083', name: 'Thilak Samarawickrama', shiftsHere: 0, totalGross: 0, totalDeductions: 0, netTakeHome: 0, prevShifts: 16 },
  { empNo: 'G-091', name: 'Gayan Weerasekara', shiftsHere: 0, totalGross: 0, totalDeductions: 0, netTakeHome: 0, prevShifts: 4 },
  { empNo: 'G-102', name: 'Ravindu Kotelawala', shiftsHere: 0, totalGross: 0, totalDeductions: 0, netTakeHome: 0, prevShifts: 17 },
] as const;

/** Guards on half salary hold — May 2026 shifts below salary-month threshold. */
export const FM_SALARY_MONTH_HALF_HOLD_LIST = [
  { empNo: 'G-003', name: 'Chamara Bandara', shiftsHere: 6, totalGross: 28_400, totalDeductions: 2_100, netTakeHome: 13_150, mayShifts: 6 },
  { empNo: 'G-005', name: 'Dinesh Fernando', shiftsHere: 8, totalGross: 31_200, totalDeductions: 1_800, netTakeHome: 14_800, mayShifts: 8 },
  { empNo: 'G-012', name: 'Nuwan Bandara', shiftsHere: 5, totalGross: 24_600, totalDeductions: 900, netTakeHome: 11_400, mayShifts: 5 },
  { empNo: 'G-018', name: 'Sunil Mendis', shiftsHere: 9, totalGross: 33_800, totalDeductions: 2_400, netTakeHome: 15_500, mayShifts: 9 },
  { empNo: 'G-027', name: 'Hasitha Perera', shiftsHere: 7, totalGross: 29_100, totalDeductions: 1_200, netTakeHome: 13_750, mayShifts: 7 },
  { empNo: 'G-034', name: 'Malith Jayasuriya', shiftsHere: 4, totalGross: 22_800, totalDeductions: 600, netTakeHome: 10_500, mayShifts: 4 },
  { empNo: 'G-041', name: 'Roshan Silva', shiftsHere: 8, totalGross: 30_500, totalDeductions: 1_500, netTakeHome: 14_250, mayShifts: 8 },
  { empNo: 'G-049', name: 'Kamal Wickramasinghe', shiftsHere: 6, totalGross: 27_200, totalDeductions: 1_100, netTakeHome: 12_450, mayShifts: 6 },
  /** HR seed guard — MNR clearance modal test (emp_number D-107) */
  { empNo: 'D-107', name: 'AMARASINGHE P.R.', shiftsHere: 7, totalGross: 29_500, totalDeductions: 2_200, netTakeHome: 13_650, mayShifts: 7 },
] as const;

export type RetentionGuardRow = {
  empNo: string;
  name: string;
  shiftsHere: number;
  totalGross: number;
  totalDeductions: number;
  netTakeHome: number;
};
