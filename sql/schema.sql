-- WorkerRights.ai Case Management Schema
-- Run this in Supabase: Dashboard → SQL Editor → New Query → Paste → Run

-- Referral firms directory
CREATE TABLE IF NOT EXISTS firms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  states TEXT[],
  contact_name TEXT,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  fee_percentage NUMERIC DEFAULT 25,
  active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inbound leads from WorkerRights.ai
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT,
  email TEXT,
  phone TEXT,
  state TEXT,
  situation TEXT,
  timeline TEXT,
  employer_size TEXT,
  claim_types TEXT[],
  tier TEXT,
  claims TEXT,
  strength_notes TEXT,
  deadline_urgency TEXT,
  estimated_value TEXT,
  salary TEXT,
  tenure TEXT,
  evidence TEXT,
  red_flags TEXT,
  recommended_action TEXT,
  user_summary TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cases: a lead referred to a firm
CREATE TABLE IF NOT EXISTS cases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  firm_id UUID REFERENCES firms(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'referred',
  referred_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  settlement_amount NUMERIC,
  expected_fee NUMERIC,
  received_fee NUMERIC,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Status update history per case
CREATE TABLE IF NOT EXISTS status_updates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  status TEXT,
  update_text TEXT,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS (private admin tool, all access through service key)
ALTER TABLE firms DISABLE ROW LEVEL SECURITY;
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE cases DISABLE ROW LEVEL SECURITY;
ALTER TABLE status_updates DISABLE ROW LEVEL SECURITY;

-- Migrations (safe to run on existing databases — adds columns if missing)
ALTER TABLE firms ADD COLUMN IF NOT EXISTS states TEXT[];
ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_summary TEXT;
