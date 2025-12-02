-- 018_focus_snapshots.sql
-- 为前端提供免登录的聚合接口，便于演示番茄钟数据

DROP FUNCTION IF EXISTS public.get_focus_heatmap(UUID, INTEGER);
CREATE OR REPLACE FUNCTION public.get_focus_heatmap(p_user_id UUID, p_days INTEGER DEFAULT 365)
RETURNS TABLE(
  focus_date DATE,
  focus_minutes INTEGER,
  level INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lh.date AS focus_date,
    lh.focus_minutes,
    lh.level
  FROM public.learning_heatmap lh
  WHERE lh.user_id = p_user_id
    AND lh.date >= (CURRENT_DATE - (p_days || ' days')::interval)
  ORDER BY lh.date;
$$;

GRANT EXECUTE ON FUNCTION public.get_focus_heatmap(UUID, INTEGER) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_focus_distribution(UUID);
CREATE OR REPLACE FUNCTION public.get_focus_distribution(p_user_id UUID)
RETURNS TABLE(
  hour INTEGER,
  minutes BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXTRACT(HOUR FROM fs.started_at)::INTEGER AS hour,
    SUM(fs.duration)::BIGINT AS minutes
  FROM public.focus_sessions fs
  WHERE fs.user_id = p_user_id
    AND fs.completed = true
  GROUP BY hour
  ORDER BY hour;
$$;

GRANT EXECUTE ON FUNCTION public.get_focus_distribution(UUID) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_focus_achievements(UUID);
CREATE OR REPLACE FUNCTION public.get_focus_achievements(p_user_id UUID)
RETURNS TABLE(
  achievement_id TEXT,
  achievement_name TEXT,
  achievement_desc TEXT,
  achievement_icon TEXT,
  unlocked_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.achievement_id,
    a.achievement_name,
    a.achievement_desc,
    a.achievement_icon,
    a.unlocked_at
  FROM public.achievements a
  WHERE a.user_id = p_user_id
  ORDER BY a.unlocked_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_focus_achievements(UUID) TO anon, authenticated;