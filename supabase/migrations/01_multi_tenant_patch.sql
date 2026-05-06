DROP POLICY IF EXISTS "Allow authenticated read" ON companies;
DROP POLICY IF EXISTS "Allow authenticated insert" ON attendance_logs;
DROP POLICY IF EXISTS "Allow authenticated read logs" ON attendance_logs;

-- 1. Create the central Companies table (The SaaS Forge Foundation)
CREATE TABLE IF NOT EXISTS companies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true, -- This is our Billing Kill-Switch
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Inject company_id into the existing attendance_logs table
ALTER TABLE attendance_logs 
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- 3. Enable Row Level Security (RLS) to prevent data bleed between clients
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

-- 4. Create Baseline Security Policies 
-- (We will tighten these to specific JWT roles in Phase 3, but this keeps the app working today)
DROP POLICY IF EXISTS "Allow authenticated read" ON companies;
CREATE POLICY "Allow authenticated read" ON companies FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Allow authenticated insert" ON attendance_logs;
CREATE POLICY "Allow authenticated insert" ON attendance_logs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Allow authenticated read logs" ON attendance_logs;
CREATE POLICY "Allow authenticated read logs" ON attendance_logs FOR SELECT TO authenticated USING (true);

-- 5. Create a default Super Admin company so your existing data doesn't break
INSERT INTO companies (id, name, is_active) 
VALUES ('00000000-0000-0000-0000-000000000000', 'HQ_MASTER_ACCOUNT', true)
ON CONFLICT DO NOTHING;

-- 6. Assign existing attendance logs to the default company
UPDATE attendance_logs 
SET company_id = '00000000-0000-0000-0000-000000000000' 
WHERE company_id IS NULL;
