-- R-CAFE-PHOTO-01: private bucket for café compliance task proofs (14-day purge).

INSERT INTO storage.buckets (id, name, public)
VALUES ('cafe_task_proofs', 'cafe_task_proofs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

UPDATE storage.buckets
SET public = false
WHERE id = 'cafe_task_proofs';
