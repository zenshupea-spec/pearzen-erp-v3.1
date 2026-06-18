-- Public careers apply: NIC/passport back photo no longer required.

ALTER TABLE public.guard_job_applications
  ALTER COLUMN id_doc_back_url DROP NOT NULL;
