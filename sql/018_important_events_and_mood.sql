-- 018_important_events_and_mood.sql
-- 重要事件类型和心情打卡功能相关数据库结构
-- 基于现有的 profiles 和 tasks 表进行扩展

-- 1. 扩展任务表，添加重要事件类型支持
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS event_type VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_important BOOLEAN DEFAULT FALSE;

-- 更新任务表的类型约束
ALTER TABLE public.tasks 
DROP CONSTRAINT IF EXISTS tasks_type_check,
ADD CONSTRAINT tasks_type_check CHECK (type IN ('homework','exam','deadline','holiday','birthday','anniversary','group_task'));

-- 2. 创建心情打卡表
CREATE TABLE IF NOT EXISTS public.mood_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    checkin_date DATE NOT NULL,
    mood VARCHAR(20) NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, checkin_date)
);

-- 创建心情打卡表的更新触发器
CREATE TRIGGER mood_checkins_updated_at
  BEFORE UPDATE ON public.mood_checkins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 3. 创建月度成就表
CREATE TABLE IF NOT EXISTS public.monthly_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    achievement_type VARCHAR(30) NOT NULL,
    achievement_data JSONB,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, year, month, achievement_type)
);

-- 4. 创建心情打卡配置表
CREATE TABLE IF NOT EXISTS public.mood_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mood_key VARCHAR(20) UNIQUE NOT NULL,
    mood_name VARCHAR(10) NOT NULL,
    emoji VARCHAR(5) NOT NULL,
    color VARCHAR(7) NOT NULL,
    score INTEGER DEFAULT 3,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0
);

-- 5. 插入默认心情配置
INSERT INTO public.mood_configs (mood_key, mood_name, emoji, color, score, sort_order) VALUES
('happy', '开心', '😊', '#FFD93D', 5, 1),
('productive', '充实', '💪', '#6BCF7F', 4, 2),
('calm', '平静', '😌', '#87CEEB', 3, 3),
('excited', '兴奋', '🎉', '#DDA0DD', 4, 4),
('tired', '疲惫', '😴', '#E08E79', 2, 5),
('anxious', '焦虑', '😰', '#95A5A6', 1, 6)
ON CONFLICT (mood_key) DO NOTHING;

-- 6. 创建事件类型配置表
CREATE TABLE IF NOT EXISTS public.event_type_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_key VARCHAR(20) UNIQUE NOT NULL,
    type_name VARCHAR(10) NOT NULL,
    emoji VARCHAR(5) NOT NULL,
    color VARCHAR(7) NOT NULL,
    is_important BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0
);

-- 7. 插入默认事件类型配置
INSERT INTO public.event_type_configs (type_key, type_name, emoji, color, is_important, sort_order) VALUES
('exam', '考试', '📝', '#FF6B6B', TRUE, 1),
('deadline', '截止', '⏰', '#FFD93D', TRUE, 2),
('holiday', '假期', '🎉', '#6BCF7F', TRUE, 3),
('birthday', '生日', '🎂', '#DDA0DD', TRUE, 4),
('anniversary', '纪念日', '💝', '#87A8A4', TRUE, 5)
ON CONFLICT (type_key) DO NOTHING;

-- 8. 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_mood_checkins_user_date ON public.mood_checkins(user_id, checkin_date);
CREATE INDEX IF NOT EXISTS idx_mood_checkins_date ON public.mood_checkins(checkin_date);
CREATE INDEX IF NOT EXISTS idx_monthly_achievements_user_period ON public.monthly_achievements(user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_tasks_event_type ON public.tasks(event_type) WHERE event_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_important ON public.tasks(is_important) WHERE is_important = TRUE;

-- 9. 创建心情统计视图
CREATE OR REPLACE VIEW public.mood_monthly_stats AS
SELECT 
    p.id as user_id,
    EXTRACT(YEAR FROM mc.checkin_date) as year,
    EXTRACT(MONTH FROM mc.checkin_date) as month,
    COUNT(*) as total_days,
    COUNT(CASE WHEN mc.mood = 'happy' THEN 1 END) as happy_days,
    COUNT(CASE WHEN mc.mood = 'productive' THEN 1 END) as productive_days,
    COUNT(CASE WHEN mc.mood = 'calm' THEN 1 END) as calm_days,
    COUNT(CASE WHEN mc.mood = 'excited' THEN 1 END) as excited_days,
    COUNT(CASE WHEN mc.mood = 'tired' THEN 1 END) as tired_days,
    COUNT(CASE WHEN mc.mood = 'anxious' THEN 1 END) as anxious_days,
    ROUND(AVG(mcfg.score), 1) as avg_mood_score,
    MAX(CASE WHEN mc.mood IN ('happy', 'productive') THEN 1 ELSE 0 END) as has_high_energy_days
FROM public.profiles p
LEFT JOIN public.mood_checkins mc ON p.id = mc.user_id
LEFT JOIN public.mood_configs mcfg ON mc.mood = mcfg.mood_key
GROUP BY p.id, EXTRACT(YEAR FROM mc.checkin_date), EXTRACT(MONTH FROM mc.checkin_date);

-- 10. 创建重要事件统计视图
CREATE OR REPLACE VIEW public.important_events_stats AS
SELECT 
    p.id as user_id,
    EXTRACT(YEAR FROM t.deadline) as year,
    EXTRACT(MONTH FROM t.deadline) as month,
    COUNT(CASE WHEN t.event_type IN ('exam', 'deadline', 'holiday', 'birthday', 'anniversary') OR t.is_important THEN 1 END) as important_events,
    COUNT(CASE WHEN t.deadline >= CURRENT_DATE AND t.deadline <= CURRENT_DATE + INTERVAL '7 days' 
                AND (t.event_type IN ('exam', 'deadline', 'holiday', 'birthday', 'anniversary') OR t.is_important) THEN 1 END) as near_events,
    COUNT(CASE WHEN t.is_completed = TRUE AND (t.event_type IN ('exam', 'deadline', 'holiday', 'birthday', 'anniversary') OR t.is_important) THEN 1 END) as completed_events
FROM public.profiles p
LEFT JOIN public.tasks t ON p.id = t.user_id
WHERE t.deadline IS NOT NULL
GROUP BY p.id, EXTRACT(YEAR FROM t.deadline), EXTRACT(MONTH FROM t.deadline);

-- 11. 创建获取心情配置的函数
CREATE OR REPLACE FUNCTION public.get_mood_configs()
RETURNS TABLE (
    mood_key VARCHAR(20),
    mood_name VARCHAR(10),
    emoji VARCHAR(5),
    color VARCHAR(7),
    score INTEGER,
    sort_order INTEGER
) LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
    RETURN QUERY
    SELECT mc.mood_key, mc.mood_name, mc.emoji, mc.color, mc.score, mc.sort_order
    FROM public.mood_configs mc
    WHERE mc.is_active = TRUE
    ORDER BY mc.sort_order;
END;
$$;

-- 12. 创建获取事件类型配置的函数
CREATE OR REPLACE FUNCTION public.get_event_type_configs()
RETURNS TABLE (
    type_key VARCHAR(20),
    type_name VARCHAR(10),
    emoji VARCHAR(5),
    color VARCHAR(7),
    is_important BOOLEAN,
    sort_order INTEGER
) LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
    RETURN QUERY
    SELECT etc.type_key, etc.type_name, etc.emoji, etc.color, etc.is_important, etc.sort_order
    FROM public.event_type_configs etc
    ORDER BY etc.sort_order;
END;
$$;

-- 13. 创建检查月度成就的函数
CREATE OR REPLACE FUNCTION public.check_monthly_achievements(
    p_user_id UUID,
    p_year INTEGER,
    p_month INTEGER
)
RETURNS TABLE (
    achievement_type VARCHAR(30),
    achievement_data JSONB
) LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
    days_in_month INTEGER;
    mood_days INTEGER;
    current_streak INTEGER;
    high_energy_days INTEGER;
    important_events_completed INTEGER;
BEGIN
    -- 计算当月天数
    days_in_month := EXTRACT(DAY FROM (p_year || '-' || p_month || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day');
    
    -- 获取心情打卡天数
    SELECT COUNT(*) INTO mood_days
    FROM public.mood_checkins
    WHERE user_id = p_user_id 
    AND EXTRACT(YEAR FROM checkin_date) = p_year
    AND EXTRACT(MONTH FROM checkin_date) = p_month;
    
    -- 获取连续打卡天数
    WITH streak_days AS (
        SELECT checkin_date, 
               LAG(checkin_date) OVER (ORDER BY checkin_date DESC) as prev_date
        FROM public.mood_checkins
        WHERE user_id = p_user_id
        AND checkin_date <= (p_year || '-' || p_month || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
    )
    SELECT COUNT(*) + 1 INTO current_streak
    FROM streak_days
    WHERE prev_date - checkin_date = INTERVAL '1 day'
    OR prev_date IS NULL
    LIMIT 1;
    
    -- 获取高能量天数
    SELECT COUNT(*) INTO high_energy_days
    FROM public.mood_checkins mc
    JOIN public.mood_configs mcfg ON mc.mood = mcfg.mood_key
    WHERE mc.user_id = p_user_id
    AND EXTRACT(YEAR FROM mc.checkin_date) = p_year
    AND EXTRACT(MONTH FROM mc.checkin_date) = p_month
    AND mc.mood IN ('happy', 'productive');
    
    -- 获取完成的重要事件数
    SELECT COUNT(*) INTO important_events_completed
    FROM public.tasks
    WHERE user_id = p_user_id
    AND EXTRACT(YEAR FROM deadline) = p_year
    AND EXTRACT(MONTH FROM deadline) = p_month
    AND is_completed = TRUE
    AND (event_type IN ('exam', 'deadline', 'holiday', 'birthday', 'anniversary') OR is_important = TRUE);
    
    -- 返回成就
    RETURN QUERY
    -- 全勤成就
    SELECT 'perfect_attendance'::VARCHAR(30), 
           jsonb_build_object('name', '全勤大师', 'description', '整月完成心情打卡', 'icon', '🏆', 'color', '#FFD700')
    WHERE mood_days = days_in_month
    
    UNION ALL
    
    -- 连续打卡成就
    SELECT 'week_streak'::VARCHAR(30),
           jsonb_build_object('name', '七日连击', 'description', '连续打卡7天', 'icon', '🔥', 'color', '#FF6347')
    WHERE current_streak >= 7
    
    UNION ALL
    
    -- 高能量成就
    SELECT 'high_energy'::VARCHAR(30),
           jsonb_build_object('name', '能量满满', 'description', '70%以上日子状态良好', 'icon', '⚡', 'color', '#32CD32')
    WHERE high_energy_days >= days_in_month * 0.7
    
    UNION ALL
    
    -- 事件征服者成就
    SELECT 'event_conqueror'::VARCHAR(30),
           jsonb_build_object('name', '事件征服者', 'description', '完成多个重要事件', 'icon', '👑', 'color', '#9370DB')
    WHERE important_events_completed >= 3;
END;
$$;

-- 14. 先删除现有的 get_task_month_stats 函数，然后重新创建
DROP FUNCTION IF EXISTS public.get_task_month_stats(UUID, DATE);

-- 创建新的 get_task_month_stats 函数以支持重要事件
CREATE OR REPLACE FUNCTION public.get_task_month_stats(
  p_user_id UUID,
  p_reference_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  total_tasks INT,
  completed_tasks INT,
  exams INT,
  busiest_day DATE,
  important_events INT,
  near_events INT
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
    (SELECT d FROM counts LIMIT 1),
    (SELECT COUNT(*) FROM filtered WHERE event_type IN ('exam', 'deadline', 'holiday', 'birthday', 'anniversary') OR is_important),
    (SELECT COUNT(*) FROM filtered 
     WHERE deadline >= CURRENT_DATE 
     AND deadline <= CURRENT_DATE + INTERVAL '7 days'
     AND (event_type IN ('exam', 'deadline', 'holiday', 'birthday', 'anniversary') OR is_important))
  ;
END;
$$;

-- 15. 创建心情打卡函数
CREATE OR REPLACE FUNCTION public.save_mood_checkin(
  p_user_id UUID,
  p_checkin_date DATE,
  p_mood VARCHAR(20),
  p_note TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  INSERT INTO public.mood_checkins (user_id, checkin_date, mood, note)
  VALUES (p_user_id, p_checkin_date, p_mood, p_note)
  ON CONFLICT (user_id, checkin_date) 
  DO UPDATE SET 
    mood = EXCLUDED.mood,
    note = EXCLUDED.note,
    updated_at = NOW();
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

-- 16. 启用行级安全策略
ALTER TABLE public.mood_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_achievements ENABLE ROW LEVEL SECURITY;

-- 心情打卡安全策略
CREATE POLICY "Users can manage own mood checkins" ON public.mood_checkins
  FOR ALL USING (auth.uid() = user_id);

-- 月度成就安全策略  
CREATE POLICY "Users can view own achievements" ON public.monthly_achievements
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert achievements" ON public.monthly_achievements
  FOR INSERT WITH CHECK (true);

-- 17. 授权访问
GRANT SELECT, INSERT, UPDATE ON public.mood_checkins TO authenticated;
GRANT SELECT ON public.mood_checkins TO anon;
GRANT SELECT ON public.monthly_achievements TO authenticated;
GRANT SELECT ON public.mood_configs TO anon, authenticated;
GRANT SELECT ON public.event_type_configs TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_mood_configs() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_type_configs() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_monthly_achievements(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_mood_checkin(UUID, DATE, VARCHAR, TEXT) TO authenticated;
GRANT SELECT ON public.mood_monthly_stats TO authenticated;
GRANT SELECT ON public.important_events_stats TO authenticated;