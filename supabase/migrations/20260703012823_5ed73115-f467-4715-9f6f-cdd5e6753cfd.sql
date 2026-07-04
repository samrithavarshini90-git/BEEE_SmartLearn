
-- =========== 1. syllabus_units ===========
CREATE TABLE public.syllabus_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_number INT NOT NULL UNIQUE CHECK (unit_number BETWEEN 1 AND 6),
  title TEXT NOT NULL,
  description TEXT,
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.syllabus_units TO authenticated;
GRANT ALL ON public.syllabus_units TO service_role;
ALTER TABLE public.syllabus_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY su_read_auth ON public.syllabus_units FOR SELECT TO authenticated USING (true);
CREATE POLICY su_admin_write ON public.syllabus_units FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========== 2. formulas: add unit + latex + wipe stale ===========
DELETE FROM public.formulas;
ALTER TABLE public.formulas ADD COLUMN IF NOT EXISTS unit_number INT;
ALTER TABLE public.formulas ADD COLUMN IF NOT EXISTS latex TEXT;
ALTER TABLE public.formulas ALTER COLUMN unit_number SET NOT NULL;
ALTER TABLE public.formulas ADD CONSTRAINT formulas_unit_range CHECK (unit_number BETWEEN 1 AND 6);
CREATE INDEX IF NOT EXISTS formulas_unit_idx ON public.formulas(unit_number, topic);

-- =========== 3. important_questions: add unit + diagram_hint + full_answer + wipe stale ===========
DELETE FROM public.important_questions;
ALTER TABLE public.important_questions ADD COLUMN IF NOT EXISTS unit_number INT;
ALTER TABLE public.important_questions ADD COLUMN IF NOT EXISTS diagram_hint TEXT;
ALTER TABLE public.important_questions ADD COLUMN IF NOT EXISTS formulas_used JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.important_questions ALTER COLUMN unit_number SET NOT NULL;
ALTER TABLE public.important_questions ADD CONSTRAINT iq_unit_range CHECK (unit_number BETWEEN 1 AND 6);
CREATE INDEX IF NOT EXISTS iq_unit_idx ON public.important_questions(unit_number, marks, topic);

-- =========== 4. numerical_problems ===========
CREATE TABLE public.numerical_problems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_number INT NOT NULL CHECK (unit_number BETWEEN 1 AND 6),
  topic TEXT NOT NULL,
  problem TEXT NOT NULL,
  solution_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  final_answer TEXT,
  formulas_used JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.numerical_problems TO authenticated;
GRANT ALL ON public.numerical_problems TO service_role;
ALTER TABLE public.numerical_problems ENABLE ROW LEVEL SECURITY;
CREATE POLICY np_read_auth ON public.numerical_problems FOR SELECT TO authenticated USING (true);
CREATE POLICY np_admin_write ON public.numerical_problems FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX np_unit_idx ON public.numerical_problems(unit_number, topic);

-- =========== 5. quiz_questions ===========
CREATE TABLE public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_number INT NOT NULL CHECK (unit_number BETWEEN 1 AND 6),
  topic TEXT NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL,           -- ["A","B","C","D"]
  correct_index INT NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  explanation TEXT,
  difficulty TEXT NOT NULL DEFAULT 'easy' CHECK (difficulty IN ('easy','medium','hard')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.quiz_questions TO authenticated;
GRANT ALL ON public.quiz_questions TO service_role;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY qq_read_auth ON public.quiz_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY qq_admin_write ON public.quiz_questions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX qq_unit_idx ON public.quiz_questions(unit_number);

-- =========== 6. quiz_attempts ===========
CREATE TABLE public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_number INT NOT NULL CHECK (unit_number BETWEEN 1 AND 6),
  score INT NOT NULL DEFAULT 0,           -- points earned
  total INT NOT NULL DEFAULT 0,           -- total questions
  correct INT NOT NULL DEFAULT 0,
  duration_seconds INT NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '[]'::jsonb, -- per-question record
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.quiz_attempts TO authenticated;
GRANT ALL ON public.quiz_attempts TO service_role;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY qa_own_insert ON public.quiz_attempts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY qa_own_or_admin_select ON public.quiz_attempts FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX qa_user_idx ON public.quiz_attempts(user_id, created_at DESC);
CREATE INDEX qa_leaderboard_idx ON public.quiz_attempts(score DESC, created_at DESC);

-- =========== 7. user_progress ===========
CREATE TABLE public.user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_number INT NOT NULL CHECK (unit_number BETWEEN 1 AND 6),
  items_completed INT NOT NULL DEFAULT 0,
  points_earned INT NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, unit_number)
);
GRANT SELECT, INSERT, UPDATE ON public.user_progress TO authenticated;
GRANT ALL ON public.user_progress TO service_role;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY up_own_manage ON public.user_progress FOR ALL TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = user_id);

-- =========== 8. achievements catalog + user_achievements ===========
CREATE TABLE public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'trophy',
  points INT NOT NULL DEFAULT 10,
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.achievements TO authenticated;
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY ach_read_auth ON public.achievements FOR SELECT TO authenticated USING (true);
CREATE POLICY ach_admin_write ON public.achievements FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_code TEXT NOT NULL REFERENCES public.achievements(code) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_code)
);
GRANT SELECT, INSERT ON public.user_achievements TO authenticated;
GRANT ALL ON public.user_achievements TO service_role;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY ua_own_or_admin_select ON public.user_achievements FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY ua_own_insert ON public.user_achievements FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- =========== 9. seed base data: units + achievements ===========
INSERT INTO public.syllabus_units (unit_number, title, description) VALUES
 (1, 'DC Circuits', 'Circuit elements, laws, network analysis and theorems.'),
 (2, 'AC Circuits', 'Sinusoidal waveforms, single- and three-phase analysis, resonance.'),
 (3, 'Electrical Safety & Machines', 'Safety, wiring, transformers and rotating machines.'),
 (4, 'Semiconductor Diodes', 'PN junction, rectifiers, Zener, LED, solar panel.'),
 (5, 'Transistors', 'BJT, JFET and MOSFET construction, operation and biasing.'),
 (6, 'Communication Systems', 'Analog and digital communication, spectrum and channels.');

INSERT INTO public.achievements (code, title, description, icon, points, criteria) VALUES
 ('first_solve', 'First Solve', 'Solved your first BEEE problem.', 'sparkles', 10, '{"type":"solve","count":1}'),
 ('solver_10', 'Problem Hunter', 'Solved 10 problems in the AI Solver.', 'target', 25, '{"type":"solve","count":10}'),
 ('quiz_first', 'Quiz Rookie', 'Completed your first quiz.', 'graduation-cap', 10, '{"type":"quiz","count":1}'),
 ('quiz_perfect', 'Perfect Score', 'Scored 100% on any unit quiz.', 'crown', 50, '{"type":"quiz_perfect"}'),
 ('unit_all', 'Six-Unit Scholar', 'Attempted a quiz on all 6 syllabus units.', 'medal', 100, '{"type":"units","count":6}');
