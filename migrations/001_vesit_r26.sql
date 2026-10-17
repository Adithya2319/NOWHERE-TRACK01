-- Optional future Supabase adapter. Does not modify or seed legacy tables.
-- The current application persists locally; do not run seed.sql to migrate user data.
CREATE TABLE IF NOT EXISTS public.vesit_academic_records (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  academic_year text NOT NULL DEFAULT '2026-27',
  semester smallint NOT NULL CHECK (semester IN (1, 2)),
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, academic_year, semester)
);
ALTER TABLE public.vesit_academic_records ENABLE ROW LEVEL SECURITY;
-- Run this migration once through your managed migration system.
CREATE POLICY own_academic_records ON public.vesit_academic_records
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
