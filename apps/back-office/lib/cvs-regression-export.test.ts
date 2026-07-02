import { writeFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildCvsRegressionResults,
  formatCvsRegressionCsv,
  summarizeCvsRegressionScenarios,
} from './cvs-regression-export';

describe('CVS regression export (§2.14.2)', () => {
  it('meets ≥9/10 scenario PASS target', () => {
    const rows = buildCvsRegressionResults();
    const summary = summarizeCvsRegressionScenarios(rows);
    expect(summary.scenariosTotal).toBe(10);
    expect(summary.scenariosPassCount).toBeGreaterThanOrEqual(9);
    expect(summary.meetsTarget).toBe(true);
    expect(summary.scenariosFail).toEqual([]);
  });

  it('exports audit-evidence/cvs/regression-results-v1.csv when requested', () => {
    const rows = buildCvsRegressionResults();
    const csv = formatCvsRegressionCsv(rows);
    expect(csv).toContain('CVS-CALC-01');
    expect(csv).toContain('CVS-CALC-10');

    if (process.env.EXPORT_CVS_REGRESSION === '1') {
      const outPath = join(
        process.cwd(),
        'audit-evidence/cvs/regression-results-v1.csv',
      );
      writeFileSync(outPath, csv, 'utf8');
    }
  });
});
