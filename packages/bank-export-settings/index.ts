export const BANK_EXPORT_FORMAT_IDS = ['commercial_csv', 'commercial_txt'] as const;

export type BankExportFormatId = (typeof BANK_EXPORT_FORMAT_IDS)[number];

export type BankExportSettings = {
  masterFormatId: BankExportFormatId;
  enforceFormatGlobally: boolean;
  isolateExternalBank: boolean;
};

export const DEFAULT_BANK_EXPORT_SETTINGS: BankExportSettings = {
  masterFormatId: 'commercial_csv',
  enforceFormatGlobally: true,
  isolateExternalBank: true,
};

export function parseBankExportSettings(raw: unknown): BankExportSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_BANK_EXPORT_SETTINGS;
  const row = raw as Record<string, unknown>;
  const formatId = String(
    row.masterFormatId ?? row.master_format_id ?? DEFAULT_BANK_EXPORT_SETTINGS.masterFormatId,
  );
  const masterFormatId = BANK_EXPORT_FORMAT_IDS.includes(formatId as BankExportFormatId)
    ? (formatId as BankExportFormatId)
    : DEFAULT_BANK_EXPORT_SETTINGS.masterFormatId;

  return {
    masterFormatId,
    enforceFormatGlobally: row.enforceFormatGlobally !== false && row.enforce_format_globally !== false,
    isolateExternalBank: row.isolateExternalBank !== false && row.isolate_external_bank !== false,
  };
}

export const BANK_EXPORT_FORMAT_LABELS: Record<BankExportFormatId, string> = {
  commercial_csv: 'Commercial Bank — CSV',
  commercial_txt: 'Commercial Bank — TXT',
};
