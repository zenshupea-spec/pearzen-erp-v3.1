-- Normalize legacy sector manager corporate group to canonical Head Office + SM rank.
-- Pre-2026 induction stored active SMs as group SECTOR_MANAGER; HR now uses HEAD_OFFICE.

UPDATE employees
SET "group" = 'HEAD_OFFICE'
WHERE upper(trim(coalesce("group", ''))) = 'SECTOR_MANAGER'
  AND upper(trim(coalesce(rank, ''))) = 'SM'
  AND upper(trim(coalesce(status, ''))) = 'ACTIVE';
