ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at timestamptz;

CREATE INDEX IF NOT EXISTS resources_ai_analysis_idx
  ON public.resources ((ai_analysis->>'recommended'), (ai_analysis->>'practical_value'))
  WHERE ai_analyzed_at IS NOT NULL;

COMMENT ON COLUMN public.resources.ai_analysis IS
  'Claude가 정책 원문에서 추출한 실질 혜택, 자격조건, 신청기간, 추천 가치와 근거';
