-- 001_schema_core.sql
-- 核心表结构：涵盖用户、课程、排课、任务、资料、专注记录与空教室众包。

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 用户资料
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  wechat_openid TEXT UNIQUE,
  nickname TEXT NOT NULL DEFAULT '同学',
  avatar_url TEXT,
  school_name TEXT,
  grade TEXT CHECK (grade IN ('大一','大二','大三','大四','研一','研二','研三','博士')),
  section_times JSONB NOT NULL DEFAULT '[
    {"section":1,"start":"08:00","end":"08:45"},
    {"section":2,"start":"08:55","end":"09:40"},
    {"section":3,"start":"10:00","end":"10:45"},
    {"section":4,"start":"10:55","end":"11:40"},
    {"section":5,"start":"14:00","end":"14:45"},
    {"section":6,"start":"14:55","end":"15:40"},
    {"section":7,"start":"16:00","end":"16:45"},
    {"section":8,"start":"16:55","end":"17:40"},
    {"section":9,"start":"18:30","end":"19:15"},
    {"section":10,"start":"19:25","end":"20:10"}
  ]'::jsonb,
  theme_preference JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 课程表
CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) <= 60),
  color TEXT NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  location TEXT,
  teacher TEXT,
  credits NUMERIC(3,1) CHECK (credits >= 0 AND credits <= 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS courses_user_idx ON public.courses(user_id);

CREATE TRIGGER courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY courses_crud_own
  ON public.courses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 排课
CREATE TABLE IF NOT EXISTS public.course_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_section SMALLINT NOT NULL CHECK (start_section BETWEEN 1 AND 12),
  length SMALLINT NOT NULL CHECK (length BETWEEN 1 AND 4),
  weeks SMALLINT[] NOT NULL CHECK (array_length(weeks, 1) >= 1),
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT course_section_window CHECK (start_section + length - 1 <= 12)
);

CREATE INDEX IF NOT EXISTS course_schedules_user_idx ON public.course_schedules(user_id);
CREATE INDEX IF NOT EXISTS course_schedules_course_idx ON public.course_schedules(course_id);
CREATE INDEX IF NOT EXISTS course_schedules_day_idx ON public.course_schedules(day_of_week);

ALTER TABLE public.course_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY schedules_crud_own
  ON public.course_schedules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 任务
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('homework','exam')),
  title TEXT NOT NULL CHECK (char_length(title) <= 120),
  description TEXT,
  deadline TIMESTAMPTZ NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  related_course_id UUID REFERENCES public.courses (id) ON DELETE SET NULL,
  reminder_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_user_idx ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS tasks_deadline_idx ON public.tasks(deadline);
CREATE INDEX IF NOT EXISTS tasks_open_idx ON public.tasks(is_completed) WHERE is_completed = false;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_crud_own
  ON public.tasks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 资料库
CREATE TABLE IF NOT EXISTS public.resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  file_name TEXT NOT NULL CHECK (char_length(file_name) <= 255),
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf','ppt','pptx','doc','docx','jpg','png','other')),
  file_size BIGINT CHECK (file_size IS NULL OR file_size > 0),
  subject TEXT NOT NULL DEFAULT '未分类' CHECK (char_length(subject) <= 60),
  ai_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resources_user_idx ON public.resources(user_id);
CREATE INDEX IF NOT EXISTS resources_subject_idx ON public.resources(subject);

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY resources_crud_own
  ON public.resources FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 专注记录
CREATE TABLE IF NOT EXISTS public.focus_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  duration INTEGER NOT NULL CHECK (duration BETWEEN 1 AND 240),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  related_course_id UUID REFERENCES public.courses (id) ON DELETE SET NULL,
  completed BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT focus_valid_window CHECK (ended_at > started_at)
);

CREATE INDEX IF NOT EXISTS focus_user_idx ON public.focus_sessions(user_id);
CREATE INDEX IF NOT EXISTS focus_started_idx ON public.focus_sessions(started_at);

ALTER TABLE public.focus_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY focus_crud_own
  ON public.focus_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 空教室众包
CREATE TABLE IF NOT EXISTS public.room_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_by UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  building TEXT NOT NULL CHECK (char_length(building) <= 60),
  room_name TEXT NOT NULL CHECK (char_length(room_name) <= 30),
  floor SMALLINT CHECK (floor BETWEEN 1 AND 50),
  status TEXT NOT NULL CHECK (status IN ('available','occupied','uncertain')),
  features TEXT[] NOT NULL DEFAULT '{}'::text[],
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS room_reports_building_idx ON public.room_reports(building);
CREATE INDEX IF NOT EXISTS room_reports_expires_idx ON public.room_reports(expires_at);

ALTER TABLE public.room_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY room_reports_select_all
  ON public.room_reports FOR SELECT
  USING (true);

CREATE POLICY room_reports_insert_own
  ON public.room_reports FOR INSERT
  WITH CHECK (auth.uid() = reported_by);

CREATE POLICY room_reports_delete_own
  ON public.room_reports FOR DELETE
  USING (auth.uid() = reported_by);
