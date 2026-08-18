-- Store only the selected practice level and completed goal labels.
-- The generated final draft remains on-device and is never persisted here.

ALTER TABLE public.social_rehearsal_sessions
  ADD COLUMN IF NOT EXISTS difficulty text,
  ADD COLUMN IF NOT EXISTS achieved_goals jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.social_rehearsal_sessions
  DROP CONSTRAINT IF EXISTS social_rehearsal_sessions_difficulty_check;

ALTER TABLE public.social_rehearsal_sessions
  ADD CONSTRAINT social_rehearsal_sessions_difficulty_check
    CHECK (difficulty IS NULL OR difficulty IN ('gentle', 'standard', 'realistic'));
