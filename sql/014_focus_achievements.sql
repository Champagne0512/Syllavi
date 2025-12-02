-- 014_focus_achievements.sql
-- 番茄钟功能增强：添加新的成就类型和更新统计函数

-- 创建成就定义表（若尚未存在）
CREATE TABLE IF NOT EXISTS public.achievement_definitions (
  achievement_id TEXT PRIMARY KEY,
  achievement_name TEXT NOT NULL,
  achievement_desc TEXT,
  achievement_icon TEXT,
  category TEXT DEFAULT 'general',
  unlock_condition TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 自动更新时间戳
DROP TRIGGER IF EXISTS trg_achievement_definitions_updated_at ON public.achievement_definitions;
CREATE TRIGGER trg_achievement_definitions_updated_at
  BEFORE UPDATE ON public.achievement_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- 添加新的成就类型到成就定义表
INSERT INTO public.achievement_definitions (achievement_id, achievement_name, achievement_desc, achievement_icon, category, unlock_condition)
VALUES 
  ('deepDiver', '潜行者', '单次专注超过60分钟', '🌊', 'focus', 'single_session_60min'),
  ('nightOwl', '夜猫子', '晚上10点后专注', '🦉', 'focus', 'late_night_study'),
  ('earlyBird', '早鸟', '早上6点前专注', '🌅', 'focus', 'early_morning_study')
ON CONFLICT (achievement_id) DO NOTHING;

-- 确保兼容：若旧版函数存在则先移除
DROP FUNCTION IF EXISTS public.get_focus_stats(UUID);

-- 更新 get_focus_stats 函数以支持更多统计维度
CREATE OR REPLACE FUNCTION public.get_focus_stats(p_user_id UUID)
RETURNS TABLE (
  total_minutes BIGINT,
  session_count BIGINT,
  streak_days INTEGER,
  today_minutes BIGINT,
  week_minutes BIGINT,
  longest_session INTEGER,
  avg_session_length NUMERIC,
  night_owl_sessions INTEGER,
  early_bird_sessions INTEGER,
  deep_diver_sessions INTEGER
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
  ),
  session_stats AS (
    SELECT
      MAX(duration) as max_duration,
      AVG(duration) as avg_duration,
      COUNT(CASE WHEN EXTRACT(HOUR FROM started_at) >= 22 THEN 1 END) as night_sessions,
      COUNT(CASE WHEN EXTRACT(HOUR FROM started_at) <= 6 THEN 1 END) as early_sessions,
      COUNT(CASE WHEN duration >= 60 THEN 1 END) as deep_sessions
    FROM completed_sessions
  )
  SELECT
    COALESCE(SUM(duration), 0)::BIGINT AS total_minutes,
    COUNT(*)::BIGINT AS session_count,
    COALESCE((SELECT streak FROM streak_days_cte), 0)::INTEGER AS streak_days,
    COALESCE(SUM(CASE WHEN DATE(started_at) = CURRENT_DATE THEN duration ELSE 0 END), 0)::BIGINT AS today_minutes,
    COALESCE(SUM(CASE WHEN started_at >= CURRENT_DATE - INTERVAL '7 days' THEN duration ELSE 0 END), 0)::BIGINT AS week_minutes,
    COALESCE((SELECT max_duration FROM session_stats), 0)::INTEGER AS longest_session,
    COALESCE((SELECT avg_duration FROM session_stats), 0)::NUMERIC AS avg_session_length,
    COALESCE((SELECT night_sessions FROM session_stats), 0)::INTEGER AS night_owl_sessions,
    COALESCE((SELECT early_sessions FROM session_stats), 0)::INTEGER AS early_bird_sessions,
    COALESCE((SELECT deep_sessions FROM session_stats), 0)::INTEGER AS deep_diver_sessions
  FROM completed_sessions;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_focus_stats(UUID) TO anon, authenticated;

-- 若旧版成就检查函数存在则先删除
DROP FUNCTION IF EXISTS public.check_and_unlock_achievements(UUID);

-- 更新 check_and_unlock_achievements 函数以支持新的成就类型
CREATE OR REPLACE FUNCTION public.check_and_unlock_achievements(p_user_id UUID)
RETURNS TABLE(
  achievement_id TEXT,
  achievement_name TEXT,
  achievement_desc TEXT,
  achievement_icon TEXT,
  newly_unlocked BOOLEAN
) AS $$
DECLARE
  v_total_focus_hours NUMERIC;
  v_completed_tasks INT;
  v_continuous_days INT;
  v_total_sessions INT;
  v_achievement RECORD;
  v_is_new INT;
  v_longest_session INTEGER;
  v_night_owl_sessions INTEGER;
  v_early_bird_sessions INTEGER;
  v_deep_diver_sessions INTEGER;
BEGIN
  -- 获取用户统计数据
  SELECT
    COALESCE(SUM(duration), 0) / 60.0,
    COUNT(DISTINCT id),
    MAX(duration),
    COUNT(CASE WHEN EXTRACT(HOUR FROM started_at) >= 22 THEN 1 END),
    COUNT(CASE WHEN EXTRACT(HOUR FROM started_at) <= 6 THEN 1 END),
    COUNT(CASE WHEN duration >= 60 THEN 1 END)
  INTO v_total_focus_hours, v_total_sessions, v_longest_session, v_night_owl_sessions, v_early_bird_sessions, v_deep_diver_sessions
  FROM public.focus_sessions
  WHERE user_id = p_user_id AND completed = true;

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
      ('spark', '星火', '第一次完成专注', '✨', v_total_sessions > 0),
      ('focused_1h', '专注达人', '累计专注1小时', '⏰', v_total_focus_hours >= 1),
      ('focused_10h', '时间管理大师', '累计专注10小时', '⏳', v_total_focus_hours >= 10),
      ('focused_50h', '学霸之光', '累计专注50小时', '🔥', v_total_focus_hours >= 50),
      ('focused_100h', '百炼成钢', '累计专注100小时', '💎', v_total_focus_hours >= 100),
      ('timeLord', '时间领主', '累计专注100小时', '⏰', v_total_focus_hours >= 100),
      ('task_10', '行动派', '完成10个任务', '✅', v_completed_tasks >= 10),
      ('task_50', '执行力MAX', '完成50个任务', '🎯', v_completed_tasks >= 50),
      ('continuous_7', '坚持不懈', '连续学习7天', '📅', v_continuous_days >= 7),
      ('weekWarrior', '周战士', '连续7天专注', '🔥', v_continuous_days >= 7),
      ('continuous_30', '习惯养成', '连续学习30天', '🏆', v_continuous_days >= 30),
      ('deepDiver', '潜行者', '单次专注超过60分钟', '🌊', v_longest_session >= 60),
      ('nightOwl', '夜猫子', '晚上10点后专注', '🦉', v_night_owl_sessions > 0),
      ('earlyBird', '早鸟', '早上6点前专注', '🌅', v_early_bird_sessions > 0)
    ) AS a(ach_id, ach_name, ach_desc, ach_icon, unlocked)
  LOOP
    IF v_achievement.unlocked THEN
      -- 尝试插入成就，如果已存在则忽略
      INSERT INTO public.achievements (user_id, achievement_id, achievement_name, achievement_desc, achievement_icon)
      VALUES (p_user_id, v_achievement.ach_id, v_achievement.ach_name, v_achievement.ach_desc, v_achievement.ach_icon)
      ON CONFLICT ON CONSTRAINT achievements_user_id_achievement_id_key DO NOTHING;
      
      GET DIAGNOSTICS v_is_new = ROW_COUNT;
      
      IF v_is_new > 0 THEN
        RETURN QUERY SELECT v_achievement.ach_id, v_achievement.ach_name, v_achievement.ach_desc, v_achievement.ach_icon, true;
      END IF;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- 创建专注记录后自动更新热力图的触发器
CREATE OR REPLACE FUNCTION update_learning_heatmap_on_focus()
RETURNS TRIGGER AS $$
BEGIN
  -- 更新或创建热力图记录
  INSERT INTO public.learning_heatmap (user_id, date, focus_minutes, level)
  VALUES (
    NEW.user_id,
    DATE(NEW.started_at),
    NEW.duration,
    CASE 
      WHEN NEW.duration >= 120 THEN 4
      WHEN NEW.duration >= 90 THEN 3
      WHEN NEW.duration >= 60 THEN 2
      WHEN NEW.duration >= 30 THEN 1
      ELSE 0
    END
  )
  ON CONFLICT (user_id, date) 
  DO UPDATE SET
    focus_minutes = learning_heatmap.focus_minutes + EXCLUDED.focus_minutes,
    level = CASE 
      WHEN (learning_heatmap.focus_minutes + EXCLUDED.focus_minutes) >= 120 THEN 4
      WHEN (learning_heatmap.focus_minutes + EXCLUDED.focus_minutes) >= 90 THEN 3
      WHEN (learning_heatmap.focus_minutes + EXCLUDED.focus_minutes) >= 60 THEN 2
      WHEN (learning_heatmap.focus_minutes + EXCLUDED.focus_minutes) >= 30 THEN 1
      ELSE 0
    END,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'auto_update_heatmap_on_focus') THEN
    CREATE TRIGGER auto_update_heatmap_on_focus
      AFTER INSERT ON public.focus_sessions
      FOR EACH ROW
      EXECUTE FUNCTION update_learning_heatmap_on_focus();
  END IF;
END $$;

-- 添加行级安全策略（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'achievement_definitions') THEN
    ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- 为 achievement_definitions 表添加查询策略
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'achievement_definitions' 
    AND policyname = 'Anyone can read achievement definitions'
  ) THEN
    CREATE POLICY "Anyone can read achievement definitions"
      ON public.achievement_definitions FOR SELECT
      USING (true);
  END IF;
END $$;

-- 添加注释
COMMENT ON TABLE public.achievement_definitions IS '成就定义表，包含所有可解锁的成就类型';
COMMENT ON TABLE public.achievements IS '用户成就记录表，记录用户已解锁的成就';
COMMENT ON TABLE public.learning_heatmap IS '学习热力图表，记录用户每日学习活跃度';
COMMENT ON FUNCTION public.get_focus_stats(UUID) IS '获取用户专注统计数据，包括总时长、连续天数、时段分布等';
COMMENT ON FUNCTION public.check_and_unlock_achievements(UUID) IS '检查并解锁用户成就，支持多种成就类型';
COMMENT ON FUNCTION public.update_learning_heatmap_on_focus() IS '专注记录创建后自动更新热力图数据的触发器函数';
