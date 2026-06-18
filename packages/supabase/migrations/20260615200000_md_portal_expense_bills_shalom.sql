-- MD portal: accounts payable bills + Shalom residence rental desk

CREATE TABLE IF NOT EXISTS expense_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  bill_date date NOT NULL DEFAULT CURRENT_DATE,
  submitted_by text NOT NULL DEFAULT '',
  cost_center text NOT NULL CHECK (cost_center IN ('Security', 'Café', 'BnB')),
  description text NOT NULL DEFAULT '',
  amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  receipt_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PENDING_APPROVAL'
    CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users (id),
  is_split boolean NOT NULL DEFAULT false,
  split_allocations jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expense_bills_company_date_idx
  ON expense_bills (company_id, bill_date DESC);

CREATE INDEX IF NOT EXISTS expense_bills_status_idx
  ON expense_bills (company_id, status);

ALTER TABLE expense_bills ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_expense_bills ON expense_bills
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE expense_bills IS
  'MD accounts payable queue — operational bills awaiting approval';

-- ─── Shalom residence ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shalom_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  name text NOT NULL,
  location text NOT NULL DEFAULT '',
  bedrooms int NOT NULL DEFAULT 1 CHECK (bedrooms >= 0),
  overhead_lkr numeric(14, 2) NOT NULL DEFAULT 0,
  occupancy_target_pct int NOT NULL DEFAULT 60 CHECK (occupancy_target_pct BETWEEN 0 AND 100),
  ota_channels text[] NOT NULL DEFAULT ARRAY['AIRBNB', 'BOOKING']::text[],
  airbnb_ical_url text NOT NULL DEFAULT '',
  booking_ical_url text NOT NULL DEFAULT '',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shalom_properties_company_idx
  ON shalom_properties (company_id);

CREATE TABLE IF NOT EXISTS shalom_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES shalom_properties (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  guest_name text NOT NULL DEFAULT '',
  channel text NOT NULL DEFAULT 'DIRECT'
    CHECK (channel IN ('AIRBNB', 'BOOKING', 'DIRECT', 'BLOCKED', 'AUTO_BLOCK')),
  check_in date NOT NULL,
  check_out date NOT NULL,
  nights int NOT NULL DEFAULT 1 CHECK (nights >= 0),
  rate_per_night numeric(12, 2) NOT NULL DEFAULT 0,
  total_revenue numeric(14, 2) NOT NULL DEFAULT 0,
  paid boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  enriched boolean NOT NULL DEFAULT false,
  enriched_contact text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out > check_in)
);

CREATE INDEX IF NOT EXISTS shalom_bookings_property_dates_idx
  ON shalom_bookings (property_id, check_in, check_out);

ALTER TABLE shalom_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE shalom_bookings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_shalom_properties ON shalom_properties
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY service_role_shalom_bookings ON shalom_bookings
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE shalom_properties IS 'Shalom Residence rental properties (MD desk)';
COMMENT ON TABLE shalom_bookings IS 'Shalom Residence bookings and calendar blocks';
