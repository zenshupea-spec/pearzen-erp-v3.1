-- R-INFRA-01: private bucket for CVS logical database dumps (off-site from live DB rows).

INSERT INTO storage.buckets (id, name, public)
VALUES ('cvs-database-backups', 'cvs-database-backups', false)
ON CONFLICT (id) DO UPDATE SET public = false;

UPDATE storage.buckets
SET public = false
WHERE id = 'cvs-database-backups';
