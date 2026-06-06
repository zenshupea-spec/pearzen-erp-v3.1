-- ==========================================
-- PHASE 8: THE TIME ENGINE
-- TABLES: time_rosters, time_shifts
-- ==========================================

-- 1. TIME ROSTERS (Planned Shifts)
CREATE TABLE time_rosters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, -- STRICT TENANT ISOLATION
    employee_id UUID NOT NULL,
    site_id UUID NOT NULL,
    shift_date DATE NOT NULL, -- THE ORIGIN RULE: Day the shift officially starts
    planned_start_time TIMESTAMPTZ NOT NULL,
    planned_end_time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TIME SHIFTS (Actual Execution & Verification)
CREATE TABLE time_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL, -- STRICT TENANT ISOLATION
    roster_id UUID REFERENCES time_rosters(id),
    employee_id UUID NOT NULL,
    site_id UUID NOT NULL,
    shift_date DATE NOT NULL, -- THE ORIGIN RULE
    
    -- CHECK-IN DATA
    check_in_time TIMESTAMPTZ NOT NULL,
    check_in_device_time TIMESTAMPTZ NOT NULL, -- OFFLINE TAMPERING FAILSAFE
    check_in_gps JSONB NOT NULL, -- { lat, lng, accuracy }
    check_in_photo_url TEXT NOT NULL,
    
    -- CHECK-OUT DATA (Nullable until shift ends)
    check_out_time TIMESTAMPTZ,
    check_out_device_time TIMESTAMPTZ,
    check_out_gps JSONB,
    check_out_photo_url TEXT,
    
    -- OM VERIFICATION QUEUE
    verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
    om_verified_by UUID,
    om_verified_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. ROW LEVEL SECURITY (RLS)
ALTER TABLE time_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_time_rosters" 
ON time_rosters FOR ALL 
USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "tenant_isolation_time_shifts" 
ON time_shifts FOR ALL 
USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- 4. TRIGGERS FOR UPDATED_AT
CREATE TRIGGER set_timestamp_time_rosters
BEFORE UPDATE ON time_rosters
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TRIGGER set_timestamp_time_shifts
BEFORE UPDATE ON time_shifts
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
