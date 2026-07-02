-- R-OPEX-01: private bucket for executive OpEx bill receipts (60-day purge when amount <= LKR 30k).

INSERT INTO storage.buckets (id, name, public)
VALUES ('opex-receipts', 'opex-receipts', false)
ON CONFLICT (id) DO UPDATE SET public = false;

UPDATE storage.buckets
SET public = false
WHERE id = 'opex-receipts';
