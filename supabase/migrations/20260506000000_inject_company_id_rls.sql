-- 1. Create the core companies table
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create baseline tables IF THEY DO NOT EXIST
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    full_name TEXT,
    emp_number TEXT UNIQUE,
    role TEXT
);

CREATE TABLE IF NOT EXISTS public.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    geofence_radius INTEGER DEFAULT 50
);

CREATE TABLE IF NOT EXISTS public.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id),
    location_id UUID REFERENCES public.locations(id),
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    profile_id UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Inject company_id into the tables
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- 4. Create a SECURITY DEFINER function to get the current user's company_id
CREATE OR REPLACE FUNCTION public.get_current_user_company_id()
RETURNS UUID AS $$
DECLARE
    v_company_id UUID;
BEGIN
    SELECT company_id INTO v_company_id 
    FROM public.profiles 
    WHERE id = auth.uid()
    LIMIT 1;
    
    RETURN v_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 6. Apply Tenant Isolation Policies
DROP POLICY IF EXISTS "Users can view their own company" ON public.companies;
CREATE POLICY "Users can view their own company" ON public.companies FOR SELECT USING (id = public.get_current_user_company_id());

DROP POLICY IF EXISTS "Tenant isolation for profiles" ON public.profiles;
CREATE POLICY "Tenant isolation for profiles" ON public.profiles FOR ALL USING (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS "Tenant isolation for shifts" ON public.shifts;
CREATE POLICY "Tenant isolation for shifts" ON public.shifts FOR ALL USING (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS "Tenant isolation for locations" ON public.locations;
CREATE POLICY "Tenant isolation for locations" ON public.locations FOR ALL USING (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS "Tenant isolation for audit logs" ON public.audit_logs;
CREATE POLICY "Tenant isolation for audit logs" ON public.audit_logs FOR SELECT USING (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS "Insert only for audit logs" ON public.audit_logs;
CREATE POLICY "Insert only for audit logs" ON public.audit_logs FOR INSERT WITH CHECK (company_id = public.get_current_user_company_id());
