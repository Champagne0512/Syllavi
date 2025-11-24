-- 002_functions.sql
-- Edge/Postgres 函数，供小程序通过 RPC 使用。

CREATE OR REPLACE FUNCTION public.get_focus_stats(p_user_id UUID)
RETURNS TABLE (
  total_minutes BIGINT,
  session_count BIGINT,
  streak_days INTEGER,
  today_minutes BIGINT,
  week_minutes BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH completed_sessions AS (
    SELECT *
    FROM public.focus_sessions
    WHERE user_id = p_user_id AND completed = true
  ),
  streak_days_cte AS (
    SELECT
      COUNT(*) AS streak
    FROM (
      SELECT
        DATE(started_at) AS session_date,
        DATE(started_at) - ROW_NUMBER() OVER (ORDER BY DATE(started_at) DESC) AS grp
      FROM completed_sessions
      GROUP BY DATE(started_at)
    ) sub
    WHERE grp = (
      SELECT DATE(started_at) - ROW_NUMBER() OVER (ORDER BY DATE(started_at) DESC)
      FROM completed_sessions
      WHERE DATE(started_at) = CURRENT_DATE
      LIMIT 1
    )
  )
  SELECT
    COALESCE(SUM(duration), 0)::BIGINT AS total_minutes,
    COUNT(*)::BIGINT AS session_count,
    COALESCE((SELECT streak FROM streak_days_cte), 0)::INTEGER AS streak_days,
    COALESCE(SUM(CASE WHEN DATE(started_at) = CURRENT_DATE THEN duration ELSE 0 END), 0)::BIGINT AS today_minutes,
    COALESCE(SUM(CASE WHEN started_at >= CURRENT_DATE - INTERVAL '7 days' THEN duration ELSE 0 END), 0)::BIGINT AS week_minutes
  FROM completed_sessions;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_focus_stats(UUID) TO anon, authenticated;

-- 计划任务：清理过期的空教室数据
CREATE OR REPLACE FUNCTION public.cleanup_expired_room_reports()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.room_reports
  WHERE expires_at < now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_room_reports() TO service_role;
