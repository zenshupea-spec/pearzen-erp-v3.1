-- Security marketing website lead capture (public quote / assessment requests).

CREATE TABLE IF NOT EXISTS public.security_website_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  contact_email text,
  contact_phone text NOT NULL,
  client_company text,
  site_district text,
  service_type text,
  guards_needed int,
  shift_pattern text,
  preferred_start date,
  estimated_monthly_lkr numeric(12, 2),
  notes text,
  source text NOT NULL DEFAULT 'quote_form',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_website_leads_company_created_idx
  ON public.security_website_leads (company_id, created_at DESC);

ALTER TABLE public.security_website_leads ENABLE ROW LEVEL SECURITY;

-- Staff read via service role; no direct anon table access.

CREATE OR REPLACE FUNCTION public.submit_security_website_lead(
  p_company_id uuid,
  p_contact_name text,
  p_contact_phone text,
  p_contact_email text DEFAULT NULL,
  p_client_company text DEFAULT NULL,
  p_site_district text DEFAULT NULL,
  p_service_type text DEFAULT NULL,
  p_guards_needed int DEFAULT NULL,
  p_shift_pattern text DEFAULT NULL,
  p_preferred_start date DEFAULT NULL,
  p_estimated_monthly_lkr numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_source text DEFAULT 'quote_form'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text;
  v_phone text;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id required';
  END IF;

  v_name := trim(p_contact_name);
  v_phone := trim(p_contact_phone);

  IF v_name = '' OR v_phone = '' THEN
    RAISE EXCEPTION 'contact_name and contact_phone required';
  END IF;

  INSERT INTO public.security_website_leads (
    company_id,
    contact_name,
    contact_email,
    contact_phone,
    client_company,
    site_district,
    service_type,
    guards_needed,
    shift_pattern,
    preferred_start,
    estimated_monthly_lkr,
    notes,
    source
  )
  VALUES (
    p_company_id,
    v_name,
    NULLIF(trim(p_contact_email), ''),
    v_phone,
    NULLIF(trim(p_client_company), ''),
    NULLIF(trim(p_site_district), ''),
    NULLIF(trim(p_service_type), ''),
    p_guards_needed,
    NULLIF(trim(p_shift_pattern), ''),
    p_preferred_start,
    p_estimated_monthly_lkr,
    NULLIF(trim(p_notes), ''),
    COALESCE(NULLIF(trim(p_source), ''), 'quote_form')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_security_website_lead(
  uuid, text, text, text, text, text, text, int, text, date, numeric, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_security_website_lead(
  uuid, text, text, text, text, text, text, int, text, date, numeric, text, text
) TO anon, authenticated;

COMMENT ON FUNCTION public.submit_security_website_lead IS
  'Public marketing lead capture for security company website quote and assessment forms.';
