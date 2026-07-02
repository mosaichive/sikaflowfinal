
-- Surveys
CREATE TABLE public.surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX surveys_one_enabled ON public.surveys ((enabled)) WHERE enabled = true;
GRANT SELECT ON public.surveys TO authenticated;
GRANT ALL ON public.surveys TO service_role;
ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view enabled surveys" ON public.surveys FOR SELECT TO authenticated
  USING (enabled = true OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "super admin manage surveys" ON public.surveys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_surveys_updated_at BEFORE UPDATE ON public.surveys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Survey questions
CREATE TABLE public.survey_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('rating','multiple_choice','checkbox','short_text','long_text')),
  label text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX survey_questions_survey_idx ON public.survey_questions (survey_id, position);
GRANT SELECT ON public.survey_questions TO authenticated;
GRANT ALL ON public.survey_questions TO service_role;
ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view questions for visible surveys" ON public.survey_questions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR EXISTS (SELECT 1 FROM public.surveys s WHERE s.id = survey_id AND s.enabled = true)
  );
CREATE POLICY "super admin manage questions" ON public.survey_questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_survey_questions_updated_at BEFORE UPDATE ON public.survey_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Survey responses
CREATE TABLE public.survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid,
  name text,
  email text,
  phone text,
  rating integer,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (survey_id, user_id)
);
CREATE INDEX survey_responses_survey_idx ON public.survey_responses (survey_id, submitted_at DESC);
GRANT SELECT, INSERT ON public.survey_responses TO authenticated;
GRANT ALL ON public.survey_responses TO service_role;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user insert own response" ON public.survey_responses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user view own or admin view all" ON public.survey_responses FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'));

-- Survey response answers
CREATE TABLE public.survey_response_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.survey_responses(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.survey_questions(id) ON DELETE CASCADE,
  answer jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX survey_response_answers_resp_idx ON public.survey_response_answers (response_id);
GRANT SELECT, INSERT ON public.survey_response_answers TO authenticated;
GRANT ALL ON public.survey_response_answers TO service_role;
ALTER TABLE public.survey_response_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert answers for own response" ON public.survey_response_answers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.survey_responses r WHERE r.id = response_id AND r.user_id = auth.uid()));
CREATE POLICY "view answers for own or admin" ON public.survey_response_answers FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR EXISTS (SELECT 1 FROM public.survey_responses r WHERE r.id = response_id AND r.user_id = auth.uid())
  );

-- Survey user status (skip/shown tracking)
CREATE TABLE public.survey_user_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('shown','skipped','completed')),
  shown_at timestamptz,
  skipped_at timestamptz,
  submitted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (survey_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.survey_user_status TO authenticated;
GRANT ALL ON public.survey_user_status TO service_role;
ALTER TABLE public.survey_user_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user manage own status" ON public.survey_user_status FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_survey_user_status_updated_at BEFORE UPDATE ON public.survey_user_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
