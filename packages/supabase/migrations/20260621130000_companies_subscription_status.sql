-- Tenant ERP subscription lifecycle (Forge roster + billing kill-switch sync)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_subscription_status') THEN
    CREATE TYPE public.company_subscription_status AS ENUM (
      'trial',
      'active',
      'past_due',
      'suspended'
    );
  END IF;
END
$$;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS subscription_status public.company_subscription_status NOT NULL DEFAULT 'active';

UPDATE public.companies
SET subscription_status = CASE
  WHEN COALESCE(is_suspended, false) OR COALESCE(is_active, true) = false THEN 'suspended'::public.company_subscription_status
  ELSE 'active'::public.company_subscription_status
END
WHERE subscription_status IS NULL
   OR subscription_status = 'active'::public.company_subscription_status
     AND (COALESCE(is_suspended, false) OR COALESCE(is_active, true) = false);

CREATE OR REPLACE FUNCTION public.sync_company_subscription_kill_switch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    CASE COALESCE(NEW.subscription_status, 'active'::public.company_subscription_status)
      WHEN 'suspended'::public.company_subscription_status THEN
        NEW.is_active := false;
        NEW.is_suspended := true;
      ELSE
        NEW.is_active := COALESCE(NEW.is_active, true);
        NEW.is_suspended := COALESCE(NEW.is_suspended, false);
    END CASE;
    RETURN NEW;
  END IF;

  IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
    CASE NEW.subscription_status
      WHEN 'suspended'::public.company_subscription_status THEN
        NEW.is_active := false;
        NEW.is_suspended := true;
      ELSE
        NEW.is_active := true;
        NEW.is_suspended := false;
    END CASE;
  ELSIF (
    NEW.is_active IS DISTINCT FROM OLD.is_active
    OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended
  )
  AND NEW.subscription_status IS NOT DISTINCT FROM OLD.subscription_status THEN
    IF COALESCE(NEW.is_suspended, false) OR COALESCE(NEW.is_active, true) = false THEN
      NEW.subscription_status := 'suspended'::public.company_subscription_status;
    ELSIF OLD.subscription_status = 'suspended'::public.company_subscription_status THEN
      NEW.subscription_status := 'active'::public.company_subscription_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_subscription_kill_switch ON public.companies;

CREATE TRIGGER companies_subscription_kill_switch
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_company_subscription_kill_switch();

CREATE INDEX IF NOT EXISTS companies_subscription_status_idx
  ON public.companies (subscription_status);
