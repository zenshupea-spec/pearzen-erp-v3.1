import {
  processShiftPay,
  EmployeeFinancialProfile,
  calculateAdjustedBasic,
} from './compensation-engine';

const testGuard: EmployeeFinancialProfile = {
  emp_number: 'G-001',
  starting_basic: 40000,
  annual_increment: 1000,
  years_of_service: 2,
  pay_structure_tag: 'GUARD_STATUTORY',
  requires_md_approval: false,
};

const B = calculateAdjustedBasic(testGuard);

console.log('\n======================================================');
console.log(' 🧮 PEARZEN ERP v3.1 - FINANCIAL ENGINE UNIT TEST');
console.log('======================================================');
console.log(` PROFILE: ${testGuard.emp_number}`);
console.log(` STARTING BASIC: LKR ${testGuard.starting_basic.toLocaleString()}`);
console.log(` ADJUSTED BASIC (B): LKR ${B.toLocaleString()}`);
console.log('------------------------------------------------------\n');

const dayTypes: Array<'STANDARD' | 'POYA' | 'WEEKLY_HOLIDAY' | 'SATURDAY'> = [
  'STANDARD',
  'POYA',
  'WEEKLY_HOLIDAY',
  'SATURDAY',
];

dayTypes.forEach((type) => {
  const result = processShiftPay(testGuard, type);

  console.log(`▶ SHIFT TYPE: ${result.shiftType}`);
  console.log(`  Base Component:     LKR ${result.breakdown.baseComponent.toFixed(2)}`);
  console.log(`  Leave Component:    LKR ${result.breakdown.leaveComponent.toFixed(2)}`);
  console.log(`  Overtime Component: LKR ${result.breakdown.overtimeComponent.toFixed(2)}`);
  console.log(`  --------------------------------`);
  console.log(`  TOTAL GROSS PAY:    LKR ${result.grossPay.toFixed(2)}\n`);
});

console.log('======================================================\n');
