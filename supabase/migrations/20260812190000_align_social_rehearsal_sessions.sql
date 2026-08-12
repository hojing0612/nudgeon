-- Align the rehearsal result table with the fields written by src/App.tsx.
-- Transcript content remains opt-in; anonymous clients may insert but cannot read rows back.

ALTER TABLE public.social_rehearsal_sessions
  ADD COLUMN IF NOT EXISTS scenario_id text,
  ADD COLUMN IF NOT EXISTS burden_before int,
  ADD COLUMN IF NOT EXISTS burden_after int,
  ADD COLUMN IF NOT EXISTS readiness_after text,
  ADD COLUMN IF NOT EXISTS completed_turns int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_response_latency_seconds int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prompt_help_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rewrite_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selected_next_step text,
  ADD COLUMN IF NOT EXISTS transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS session_token uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.social_rehearsal_sessions
  DROP CONSTRAINT IF EXISTS social_rehearsal_sessions_burden_before_check,
  DROP CONSTRAINT IF EXISTS social_rehearsal_sessions_burden_after_check,
  DROP CONSTRAINT IF EXISTS social_rehearsal_sessions_readiness_after_check;

ALTER TABLE public.social_rehearsal_sessions
  ADD CONSTRAINT social_rehearsal_sessions_burden_before_check
    CHECK (burden_before IS NULL OR burden_before BETWEEN 1 AND 5),
  ADD CONSTRAINT social_rehearsal_sessions_burden_after_check
    CHECK (burden_after IS NULL OR burden_after BETWEEN 1 AND 5),
  ADD CONSTRAINT social_rehearsal_sessions_readiness_after_check
    CHECK (readiness_after IS NULL OR readiness_after IN ('hard', 'small', 'now'));

ALTER TABLE public.social_rehearsal_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_rehearsals" ON public.social_rehearsal_sessions;
CREATE POLICY "anon_insert_rehearsals"
ON public.social_rehearsal_sessions FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_rehearsals" ON public.social_rehearsal_sessions;
DROP POLICY IF EXISTS "anon_update_rehearsals" ON public.social_rehearsal_sessions;
DROP POLICY IF EXISTS "anon_delete_rehearsals" ON public.social_rehearsal_sessions;

GRANT INSERT ON public.social_rehearsal_sessions TO anon, authenticated;
REVOKE SELECT, UPDATE, DELETE ON public.social_rehearsal_sessions FROM anon;
