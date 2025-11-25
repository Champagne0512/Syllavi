-- 006_fix_focus_stats.sql
-- 修正 get_focus_stats 函数以匹配个人资料页面的期望字段

-- 先删除现有函数
DROP FUNCTION IF EXISTS public.get_focus_stats(UUID);

-- 重新创建函数
CREATE FUNCTION public.get_focus_stats(p_user_id UUID)
RETURNS TABLE (
  today_minutes BIGINT,
  week_minutes BIGINT,
  total_minutes BIGINT,
  total_sessions BIGINT,
  continuous_days INTEGER,
  streak_days INTEGER
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
    COALESCE(SUM(CASE WHEN DATE(started_at) = CURRENT_DATE THEN duration ELSE 0 END), 0)::BIGINT AS today_minutes,
    COALESCE(SUM(CASE WHEN started_at >= CURRENT_DATE - INTERVAL '7 days' THEN duration ELSE 0 END), 0)::BIGINT AS week_minutes,
    COALESCE(SUM(duration), 0)::BIGINT AS total_minutes,
    COUNT(*)::BIGINT AS total_sessions,
    COALESCE((SELECT streak FROM streak_days_cte), 0)::INTEGER AS continuous_days,
    COALESCE((SELECT streak FROM streak_days_cte), 0)::INTEGER AS streak_days
  FROM completed_sessions;
END;
$$;

-- 授予执行权限
GRANT EXECUTE ON FUNCTION public.get_focus_stats(UUID) TO anon, authenticated;

-- 验证函数是否创建成功
SELECT 
  proname AS function_name,
  pg_get_function_arguments(oid) AS arguments,
  pg_get_function_result(oid) AS return_type
FROM pg_proc 
WHERE proname = 'get_focus_stats' 
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');