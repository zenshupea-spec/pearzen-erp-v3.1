-- Store applicant height in feet (public careers form).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'guard_job_applications'
      AND column_name = 'height_cm'
  ) THEN
    UPDATE public.guard_job_applications
    SET height_cm = ROUND((height_cm / 30.48)::numeric, 1)
    WHERE height_cm > 10;

    ALTER TABLE public.guard_job_applications
      RENAME COLUMN height_cm TO height_ft;
  END IF;
END $$;

COMMENT ON COLUMN public.guard_job_applications.height_ft IS 'Applicant height in feet';
