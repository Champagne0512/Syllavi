-- 检查并修复 get_focus_stats 函数
-- 1. 先删除可能存在的函数
DROP FUNCTION IF EXISTS public.get_focus_stats(UUID);

-- 2. 重新创建函数，使用更简单的实现
CREATE OR REPLACE FUNCTION public.get_focus_stats(p_user_id UUID)
RETURNS TABLE (
  today_minutes BIGINT,
  week_minutes BIGINT,
  total_minutes BIGINT,
  total_sessions BIGINT,
  continuous_days INTEGER,
  streak_days INTEGER
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN DATE(started_at) = CURRENT_DATE THEN duration ELSE 0 END), 0)::BIGINT AS today_minutes,
    COALESCE(SUM(CASE WHEN started_at >= CURRENT_DATE - INTERVAL '7 days' THEN duration ELSE 0 END), 0)::BIGINT AS week_minutes,
    COALESCE(SUM(duration), 0)::BIGINT AS total_minutes,
    COUNT(*)::BIGINT AS total_sessions,
    0::INTEGER AS continuous_days,
    0::INTEGER AS streak_days
  FROM public.focus_sessions
  WHERE user_id = p_user_id AND completed = true;
$$;

-- 3. 授权给所有用户
GRANT EXECUTE ON FUNCTION public.get_focus_stats(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_focus_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_focus_stats(UUID) TO service_role;

-- 4. 验证函数是否创建成功
SELECT 
  proname AS function_name,
  proowner AS owner,
  prolang AS language
FROM pg_proc 
WHERE proname = 'get_focus_stats';