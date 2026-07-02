import type { SupabaseClient } from '@supabase/supabase-js';

import { parseCafeTaskProofStorageRef } from './cafe-task-proof-storage';

export const CAFE_TASK_PROOF_PURGE_BATCH = 500;

export type PurgeCafeTaskProofsResult = {
  rowsCleared: number;
  objectsRemoved: number;
  referenceDate: string;
};

export async function purgeCafeTaskProofs(
  supabase: SupabaseClient,
  referenceDate = new Date().toISOString().slice(0, 10),
): Promise<PurgeCafeTaskProofsResult> {
  const pathsByBucket = new Map<string, Set<string>>();
  let rowsCleared = 0;

  const { data: rows, error } = await supabase
    .from('cafe_task_completions')
    .select('id, proof_url, purge_after')
    .not('proof_url', 'is', null)
    .lt('purge_after', referenceDate)
    .limit(CAFE_TASK_PROOF_PURGE_BATCH);

  if (error) {
    throw new Error(`cafe_task_completions fetch: ${error.message}`);
  }

  for (const row of rows ?? []) {
    const ref = parseCafeTaskProofStorageRef(row.proof_url as string);
    if (ref) {
      const bucketPaths = pathsByBucket.get(ref.bucket) ?? new Set<string>();
      bucketPaths.add(ref.objectPath);
      pathsByBucket.set(ref.bucket, bucketPaths);
    }

    const { error: updateError } = await supabase
      .from('cafe_task_completions')
      .update({ proof_url: null })
      .eq('id', row.id);

    if (!updateError) rowsCleared += 1;
  }

  let objectsRemoved = 0;
  for (const [bucket, paths] of pathsByBucket) {
    if (paths.size === 0) continue;
    const { error: removeError } = await supabase.storage
      .from(bucket)
      .remove([...paths]);
    if (!removeError) objectsRemoved += paths.size;
  }

  return {
    rowsCleared,
    objectsRemoved,
    referenceDate,
  };
}
