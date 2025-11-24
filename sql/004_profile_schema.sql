-- ============================================
-- Syllaby 个人主页相关数据库表结构
-- ============================================

-- 1. 扩展 profiles 表（添加个人主页需要的字段）
-- 注意：profiles 表已存在，只添加缺失的字段
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '让学习成为一种习惯';

-- 2. 成就表 (achievements)
-- 用户解锁的成就记录
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  achievement_id TEXT NOT NULL,
  achievement_name TEXT NOT NULL,
  achievement_desc TEXT,
  achievement_icon TEXT,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

-- 为 achievements 表创建索引
CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON public.achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_unlocked_at ON public.achievements(unlocked_at DESC);

-- 3. 学习热力图数据表 (learning_heatmap)
-- 记录每天的学习活跃度
CREATE TABLE IF NOT EXISTS public.learning_heatmap (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  focus_minutes INT DEFAULT 0,
  tasks_completed INT DEFAULT 0,
  level INT DEFAULT 0, -- 活跃度等级 0-4
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- 为 learning_heatmap 表创建索引
CREATE INDEX IF NOT EXISTS idx_heatmap_user_date ON public.learning_heatmap(user_id, date DESC);

-- 创建热力图更新触发器
DROP TRIGGER IF EXISTS update_heatmap_updated_at ON public.learning_heatmap;
CREATE TRIGGER update_heatmap_updated_at
    BEFORE UPDATE ON public.learning_heatmap
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- 4. 用户统计视图 (user_stats)
-- 实时统计用户学习数据的视图
CREATE OR REPLACE VIEW public.user_stats AS
SELECT
  p.id as user_id,
  p.nickname,
  p.school_name,
  p.grade,
  p.avatar_url,
  p.bio,
  -- 专注统计（注意：focus_sessions 表中字段是 duration，不是 duration_minutes）
  COALESCE(SUM(CASE
    WHEN fs.started_at::date = CURRENT_DATE
    THEN fs.duration
    ELSE 0
  END), 0) as today_focus_minutes,
  COALESCE(SUM(CASE
    WHEN fs.started_at >= date_trunc('week', CURRENT_DATE)
    THEN fs.duration
    ELSE 0
  END), 0) as week_focus_minutes,
  COALESCE(SUM(fs.duration), 0) as total_focus_minutes,
  COUNT(DISTINCT fs.id) as total_sessions,
  -- 任务统计
  COUNT(DISTINCT CASE WHEN t.is_completed = true THEN t.id END) as completed_tasks,
  COUNT(DISTINCT t.id) as total_tasks,
  -- 资源统计
  COUNT(DISTINCT r.id) as total_resources,
  -- 课程统计
  COUNT(DISTINCT c.id) as total_courses,
  -- 成就统计
  COUNT(DISTINCT a.id) as total_achievements
FROM public.profiles p
LEFT JOIN public.focus_sessions fs ON fs.user_id = p.id
LEFT JOIN public.tasks t ON t.user_id = p.id
LEFT JOIN public.resources r ON r.user_id = p.id
LEFT JOIN public.courses c ON c.user_id = p.id
LEFT JOIN public.achievements a ON a.user_id = p.id
GROUP BY p.id, p.nickname, p.school_name, p.grade, p.avatar_url, p.bio;

-- 5. 获取用户统计数据的函数
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS TABLE(
  today_focus_minutes INT,
  week_focus_minutes INT,
  total_focus_minutes INT,
  total_sessions BIGINT,
  completed_tasks BIGINT,
  total_tasks BIGINT,
  total_resources BIGINT,
  total_courses BIGINT,
  total_achievements BIGINT,
  continuous_days INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    us.today_focus_minutes::INT,
    us.week_focus_minutes::INT,
    us.total_focus_minutes::INT,
    us.total_sessions,
    us.completed_tasks,
    us.total_tasks,
    us.total_resources,
    us.total_courses,
    us.total_achievements,
    -- 计算连续学习天数
    (
      SELECT COUNT(DISTINCT date)::INT
      FROM public.learning_heatmap
      WHERE user_id = p_user_id
        AND date >= CURRENT_DATE - INTERVAL '30 days'
        AND level > 0
    ) as continuous_days
  FROM public.user_stats us
  WHERE us.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- 6. 更新学习热力图的函数
CREATE OR REPLACE FUNCTION update_learning_heatmap(
  p_user_id UUID,
  p_date DATE,
  p_focus_minutes INT DEFAULT 0,
  p_tasks_completed INT DEFAULT 0
)
RETURNS void AS $$
DECLARE
  v_level INT;
BEGIN
  -- 计算活跃度等级 (0-4)
  -- 0: 0分钟, 1: 1-30分钟, 2: 31-60分钟, 3: 61-90分钟, 4: 90+分钟
  v_level := CASE
    WHEN p_focus_minutes = 0 THEN 0
    WHEN p_focus_minutes <= 30 THEN 1
    WHEN p_focus_minutes <= 60 THEN 2
    WHEN p_focus_minutes <= 90 THEN 3
    ELSE 4
  END;

  -- 插入或更新热力图数据
  INSERT INTO public.learning_heatmap AS lh (user_id, date, focus_minutes, tasks_completed, level)
  VALUES (p_user_id, p_date, p_focus_minutes, p_tasks_completed, v_level)
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    focus_minutes = lh.focus_minutes + EXCLUDED.focus_minutes,
    tasks_completed = lh.tasks_completed + EXCLUDED.tasks_completed,
    level = CASE
      WHEN (lh.focus_minutes + EXCLUDED.focus_minutes) = 0 THEN 0
      WHEN (lh.focus_minutes + EXCLUDED.focus_minutes) <= 30 THEN 1
      WHEN (lh.focus_minutes + EXCLUDED.focus_minutes) <= 60 THEN 2
      WHEN (lh.focus_minutes + EXCLUDED.focus_minutes) <= 90 THEN 3
      ELSE 4
    END,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 7. 检查并解锁成就的函数
CREATE OR REPLACE FUNCTION check_and_unlock_achievements(p_user_id UUID)
RETURNS TABLE(
  achievement_id TEXT,
  achievement_name TEXT,
  newly_unlocked BOOLEAN
) AS $$
DECLARE
  v_total_focus_hours NUMERIC;
  v_completed_tasks INT;
  v_continuous_days INT;
  v_total_sessions INT;
  v_achievement RECORD;
  v_is_new BOOLEAN;
BEGIN
  -- 获取用户统计数据
  SELECT
    COALESCE(SUM(duration), 0) / 60.0,
    COUNT(DISTINCT id)
  INTO v_total_focus_hours, v_total_sessions
  FROM public.focus_sessions
  WHERE user_id = p_user_id;

  SELECT COUNT(id)
  INTO v_completed_tasks
  FROM public.tasks
  WHERE user_id = p_user_id AND is_completed = true;

  SELECT COUNT(DISTINCT date)
  INTO v_continuous_days
  FROM public.learning_heatmap
  WHERE user_id = p_user_id
    AND date >= CURRENT_DATE - INTERVAL '30 days'
    AND level > 0;

  -- 定义成就列表并检查解锁条件
  FOR v_achievement IN
    SELECT * FROM (VALUES
      ('beginner', '初出茅庐', '完成首次专注', '🌱', v_total_sessions > 0),
      ('focused_1h', '专注达人', '累计专注1小时', '⏰', v_total_focus_hours >= 1),
      ('focused_10h', '时间管理大师', '累计专注10小时', '⏳', v_total_focus_hours >= 10),
      ('focused_50h', '学霸之光', '累计专注50小时', '🔥', v_total_focus_hours >= 50),
      ('focused_100h', '百炼成钢', '累计专注100小时', '💎', v_total_focus_hours >= 100),
      ('task_10', '行动派', '完成10个任务', '✅', v_completed_tasks >= 10),
      ('task_50', '执行力MAX', '完成50个任务', '🎯', v_completed_tasks >= 50),
      ('continuous_7', '坚持不懈', '连续学习7天', '📅', v_continuous_days >= 7),
      ('continuous_30', '习惯养成', '连续学习30天', '🏆', v_continuous_days >= 30)
    ) AS a(ach_id, ach_name, ach_desc, ach_icon, unlocked)
  LOOP
    IF v_achievement.unlocked THEN
      -- 尝试插入成就，如果已存在则忽略
      INSERT INTO public.achievements (user_id, achievement_id, achievement_name, achievement_desc, achievement_icon)
      VALUES (p_user_id, v_achievement.ach_id, v_achievement.ach_name, v_achievement.ach_desc, v_achievement.ach_icon)
      ON CONFLICT (user_id, achievement_id) DO NOTHING
      RETURNING true INTO v_is_new;

      -- 返回成就信息
      achievement_id := v_achievement.ach_id;
      achievement_name := v_achievement.ach_name;
      newly_unlocked := COALESCE(v_is_new, false);
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 8. 触发器：当创建专注会话时更新热力图
CREATE OR REPLACE FUNCTION trigger_update_heatmap_on_focus()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_learning_heatmap(
    NEW.user_id,
    NEW.started_at::date,
    NEW.duration,
    0
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_update_heatmap_on_focus ON public.focus_sessions;
CREATE TRIGGER auto_update_heatmap_on_focus
  AFTER INSERT ON public.focus_sessions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_heatmap_on_focus();

-- 9. 触发器：当完成任务时更新热力图
CREATE OR REPLACE FUNCTION trigger_update_heatmap_on_task()
RETURNS TRIGGER AS $$
DECLARE
  was_completed BOOLEAN := CASE
    WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.is_completed, false)
    ELSE false
  END;
BEGIN
  IF NEW.is_completed = true AND was_completed = false THEN
    PERFORM update_learning_heatmap(
      NEW.user_id,
      CURRENT_DATE,
      0,
      1
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_update_heatmap_on_task ON public.tasks;
CREATE TRIGGER auto_update_heatmap_on_task
  AFTER INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_heatmap_on_task();

-- 10. RLS (Row Level Security) 策略
-- 启用 RLS
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_heatmap ENABLE ROW LEVEL SECURITY;

-- achievements 表策略
DROP POLICY IF EXISTS "Users can view their own achievements" ON public.achievements;
CREATE POLICY "Users can view their own achievements"
  ON public.achievements FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own achievements" ON public.achievements;
CREATE POLICY "Users can insert their own achievements"
  ON public.achievements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- learning_heatmap 表策略
DROP POLICY IF EXISTS "Users can view their own heatmap" ON public.learning_heatmap;
CREATE POLICY "Users can view their own heatmap"
  ON public.learning_heatmap FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own heatmap" ON public.learning_heatmap;
CREATE POLICY "Users can manage their own heatmap"
  ON public.learning_heatmap FOR ALL
  USING (auth.uid() = user_id);

-- 11. 为测试用户初始化数据（可选）
-- 注意：在生产环境中应该删除这部分
-- 为测试用户生成一些热力图数据
DO $$
DECLARE
  test_user_id UUID := '00000000-0000-0000-0000-000000000001';
  i INT;
  random_minutes INT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = test_user_id) THEN
    FOR i IN 0..29 LOOP
      random_minutes := (random() * 120)::INT;
      INSERT INTO public.learning_heatmap (user_id, date, focus_minutes, level)
      VALUES (
        test_user_id,
        CURRENT_DATE - i,
        random_minutes,
        CASE
          WHEN random_minutes = 0 THEN 0
          WHEN random_minutes <= 30 THEN 1
          WHEN random_minutes <= 60 THEN 2
          WHEN random_minutes <= 90 THEN 3
          ELSE 4
        END
      )
      ON CONFLICT (user_id, date) DO NOTHING;
    END LOOP;
  END IF;
END $$;

-- ============================================
-- 说明文档
-- ============================================
--
-- 使用方法：
-- 1. 在 Supabase 控制台的 SQL Editor 中执行此脚本
-- 2. 确保已经创建了以下依赖表：
--    - focus_sessions (专注会话表)
--    - tasks (任务表)
--    - resources (资源表)
--    - courses (课程表)
--
-- 主要功能：
-- 1. profiles 表：存储用户个人资料
-- 2. achievements 表：记录用户解锁的成就
-- 3. learning_heatmap 表：记录每日学习活跃度
-- 4. user_stats 视图：实时统计用户数据
-- 5. 自动触发器：专注和任务完成时自动更新热力图
-- 6. RLS 策略：确保数据安全
--
-- API 调用示例：
-- - 获取用户统计：SELECT * FROM get_user_stats('user-uuid');
-- - 检查成就：SELECT * FROM check_and_unlock_achievements('user-uuid');
-- - 更新热力图：SELECT update_learning_heatmap('user-uuid', '2025-01-01', 60, 3);
