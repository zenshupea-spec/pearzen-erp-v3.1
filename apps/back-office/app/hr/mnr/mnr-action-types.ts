/** Types for MNR server actions — keep out of `"use server"` files. */

export type MnrSectionKey = 'personal' | 'employment' | 'bank' | 'vetting' | 'offboarding';

export type SectionEditMeta = {
  at: string;
  by: string;
};

export type MnrAccess = {
  canEdit: boolean;
  role: string | null;
  signedIn: boolean;
  /** True when signed-in user is MD — may assign/edit MD & OD portal access. */
  canManageExecutive: boolean;
  viewerEmail: string | null;
};
