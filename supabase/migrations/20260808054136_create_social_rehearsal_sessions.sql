/*
# Create social_rehearsal_sessions table (single-tenant, no auth)

1. New Tables
- `social_rehearsal_sessions`
  - `id` (uuid, primary key)
  - `scenario` (text, e.g. "면접 자기소개" — which situation the user practiced)
  - `duration_seconds` (int, how long the rehearsal lasted)
  - `wpm` (int, average words-per-minute speaking rate)
  - `tremor` (int, 0–100 voice tremor/shakiness score)
  - `volume` (int, 0–100 average volume level)
  - `gaze_focus` (int, 0–100 gaze focus ratio from camera analysis)
  - `overall_score` (int, 0–100 composite rehearsal score)
  - `tips` (jsonb, array of AI coaching tip strings)
  - `created_at` (timestamptz)

2. Security
- Enable RLS on `social_rehearsal_sessions`.
- Allow anon + authenticated CRUD because the app is intentionally shared/public (no sign-in screen).
*/

CREATE TABLE IF NOT EXISTS social_rehearsal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario text NOT NULL DEFAULT '면접 자기소개',
  duration_seconds int NOT NULL DEFAULT 0,
  wpm int NOT NULL DEFAULT 0,
  tremor int NOT NULL DEFAULT 0,
  volume int NOT NULL DEFAULT 0,
  gaze_focus int NOT NULL DEFAULT 0,
  overall_score int NOT NULL DEFAULT 0,
  tips jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE social_rehearsal_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_rehearsals" ON social_rehearsal_sessions;
CREATE POLICY "anon_select_rehearsals"
ON social_rehearsal_sessions FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_rehearsals" ON social_rehearsal_sessions;
CREATE POLICY "anon_insert_rehearsals"
ON social_rehearsal_sessions FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_rehearsals" ON social_rehearsal_sessions;
CREATE POLICY "anon_update_rehearsals"
ON social_rehearsal_sessions FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_rehearsals" ON social_rehearsal_sessions;
CREATE POLICY "anon_delete_rehearsals"
ON social_rehearsal_sessions FOR DELETE
TO anon, authenticated USING (true);
