-- =============================================
-- 课程表 & 待办 - 数据视图与辅助函数
-- =============================================

-- Week schedule view (course info + lesson slots)
CREATE OR REPLACE VIEW public.v_weekly_schedule AS
SELECT
  cs.id,
  cs.user_id,
  cs.course_id,
  cs.day_of_week,
  cs.start_section,
  cs.length,
  cs.weeks,
  cs.location AS schedule_location,
  c.name  AS course_name,
  c.color AS course_color,
  COALESCE(cs.location, c.location) AS final_location,
  c.teacher
FROM public.course_schedules cs
JOIN public.courses c ON c.id = cs.course_id;

COMMENT ON VIEW public.v_weekly_schedule IS 'Joined course schedule + course metadata for client week view';

GRANT SELECT ON public.v_weekly_schedule TO anon, authenticated;

-- Upcoming tasks helper (default next 7 days)
CREATE OR REPLACE FUNCTION public.get_upcoming_tasks(
  p_user_id UUID,
  p_days INTEGER DEFAULT 7
) RETURNS TABLE (
  id UUID,
  title TEXT,
  type TEXT,
  deadline TIMESTAMPTZ,
  related_course_id UUID,
  is_completed BOOLEAN
) LANGUAGE sql SECURITY INVOKER AS $$
  SELECT t.id, t.title, t.type, t.deadline, t.related_course_id, t.is_completed
  FROM public.tasks t
  WHERE t.user_id = p_user_id
    AND t.deadline >= NOW()
    AND t.deadline < NOW() + make_interval(days => p_days)
  ORDER BY t.deadline ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_upcoming_tasks(UUID, INTEGER) TO anon, authenticated;

-- Monthly stats helper for dashboard cards
CREATE OR REPLACE FUNCTION public.get_task_month_stats(
  p_user_id UUID,
  p_reference_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  total_tasks INT,
  completed_tasks INT,
  exams INT,
  busiest_day DATE
) LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  month_start DATE := date_trunc('month', p_reference_date)::DATE;
  month_end   DATE := (date_trunc('month', p_reference_date) + INTERVAL '1 month')::DATE;
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT *
    FROM public.tasks t
    WHERE t.user_id = p_user_id
      AND t.deadline >= month_start
      AND t.deadline < month_end
  ),
  counts AS (
    SELECT date(deadline) AS d, COUNT(*) AS c
    FROM filtered
    GROUP BY date(deadline)
    ORDER BY c DESC
    LIMIT 1
  )
  SELECT
    (SELECT COUNT(*) FROM filtered),
    (SELECT COUNT(*) FROM filtered WHERE is_completed),
    (SELECT COUNT(*) FROM filtered WHERE type = 'exam'),
    (SELECT d FROM counts LIMIT 1)
  ;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_task_month_stats(UUID, DATE) TO anon, authenticated;
