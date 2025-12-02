-- 015_focus_demo_data.sql
-- 番茄钟演示数据：插入大量历史数据，用于项目演示

-- 假设的用户ID（需要在实际使用时替换为真实的用户ID）
DO $$
DECLARE
  demo_user_id CONSTANT UUID := 'c39d692c-3db6-42e1-8b81-ac09cacafb20';
  current_date DATE := '2025-12-01'::date;
  start_date DATE := (CURRENT_DATE - INTERVAL '90 days')::DATE;
  date_counter DATE;
  focus_duration INTEGER;
  start_hour INTEGER;
  start_time TIMESTAMPTZ;
  end_time TIMESTAMPTZ;
  day_of_week INTEGER;
  is_weekend BOOLEAN;
  focus_count INTEGER;
  i INTEGER;
BEGIN
  -- 若用户不存在则提示
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = demo_user_id) THEN
    RAISE EXCEPTION 'Profile % 不存在，请先在 auth.users/profiles 中创建该用户后再运行 015 脚本。', demo_user_id;
  END IF;

  -- 补全基础信息，避免空数据影响页面展示
  UPDATE public.profiles
  SET nickname = COALESCE(nickname, '演示同学'),
      school_name = COALESCE(school_name, '理想大学'),
      grade = COALESCE(grade, '大二')
  WHERE id = demo_user_id;

  -- 清理旧数据，保证脚本可重复执行
  DELETE FROM public.focus_sessions WHERE user_id = demo_user_id;
  DELETE FROM public.learning_heatmap WHERE user_id = demo_user_id;
  DELETE FROM public.achievements WHERE user_id = demo_user_id;

  -- 遍历过去90天的每一天
  date_counter := start_date;
  WHILE date_counter <= current_date LOOP
    day_of_week := EXTRACT(DOW FROM date_counter);
    is_weekend := day_of_week = 0 OR day_of_week = 6; -- 0=周日, 6=周六
    
    -- 周末专注次数较少，工作日专注次数较多
    IF is_weekend THEN
      focus_count := CASE 
        WHEN random() < 0.3 THEN 0  -- 30%概率不专注
        WHEN random() < 0.6 THEN 1  -- 30%概率专注1次
        ELSE 2                      -- 40%概率专注2次
      END;
    ELSE
      focus_count := CASE 
        WHEN random() < 0.1 THEN 0  -- 10%概率不专注
        WHEN random() < 0.4 THEN 1  -- 30%概率专注1次
        WHEN random() < 0.8 THEN 2  -- 40%概率专注2次
        ELSE 3                      -- 20%概率专注3次
      END;
    END IF;

    -- 生成当天的专注记录
    FOR i IN 1..focus_count LOOP
      -- 随机生成专注时长（25-180分钟）
      focus_duration := CASE 
        WHEN random() < 0.6 THEN 25 + floor(random() * 10)::INTEGER  -- 60%概率25-35分钟
        WHEN random() < 0.8 THEN 45 + floor(random() * 15)::INTEGER  -- 20%概率45-60分钟
        ELSE 60 + floor(random() * 120)::INTEGER                     -- 20%概率60-180分钟
      END;

      -- 根据工作日/周末选择不同的时间段
      IF is_weekend THEN
        -- 周末：上午9-11点或下午2-5点或晚上7-10点
        start_hour := CASE 
          WHEN random() < 0.4 THEN 9 + floor(random() * 2)::INTEGER  -- 上午
          WHEN random() < 0.7 THEN 14 + floor(random() * 3)::INTEGER -- 下午
          ELSE 19 + floor(random() * 3)::INTEGER                     -- 晚上
        END;
      ELSE
        -- 工作日：上午8-11点或下午2-6点或晚上7-11点
        start_hour := CASE 
          WHEN random() < 0.3 THEN 8 + floor(random() * 3)::INTEGER  -- 上午
          WHEN random() < 0.6 THEN 14 + floor(random() * 4)::INTEGER -- 下午
          ELSE 19 + floor(random() * 4)::INTEGER                     -- 晚上
        END;
      END IF;

      -- 生成具体的时间
      start_time := date_counter::timestamptz + (start_hour || ' hours')::INTERVAL + 
                   (floor(random() * 60) || ' minutes')::INTERVAL;
      end_time := start_time + (focus_duration || ' minutes')::INTERVAL;

      -- 插入专注记录
      INSERT INTO public.focus_sessions (
        user_id, duration, started_at, ended_at, completed
      ) VALUES (
        demo_user_id,
        focus_duration,
        start_time,
        end_time,
        true
      );
    END LOOP;

    date_counter := (date_counter + INTERVAL '1 day')::DATE;
  END LOOP;

  -- 手动添加一些特殊成就的触发数据
  -- 1. 潜行者成就（单次专注超过60分钟）
  INSERT INTO public.focus_sessions (
    user_id, duration, started_at, ended_at, completed
  ) VALUES (
    demo_user_id,
    90, -- 90分钟
    current_date - INTERVAL '5 days' + INTERVAL '14 hours',
    current_date - INTERVAL '5 days' + INTERVAL '15 hours 30 minutes',
    true
  );

  -- 2. 夜猫子成就（晚上10点后专注）
  INSERT INTO public.focus_sessions (
    user_id, duration, started_at, ended_at, completed
  ) VALUES (
    demo_user_id,
    30, -- 30分钟
    current_date - INTERVAL '10 days' + INTERVAL '22 hours 30 minutes',
    current_date - INTERVAL '10 days' + INTERVAL '23 hours',
    true
  );

  -- 3. 早鸟成就（早上6点前专注）
  INSERT INTO public.focus_sessions (
    user_id, duration, started_at, ended_at, completed
  ) VALUES (
    demo_user_id,
    25, -- 25分钟
    current_date - INTERVAL '15 days' + INTERVAL '5 hours 45 minutes',
    current_date - INTERVAL '15 days' + INTERVAL '6 hours 10 minutes',
    true
  );

  -- 4. 连续7天成就数据
  FOR i IN 0..6 LOOP
    INSERT INTO public.focus_sessions (
      user_id, duration, started_at, ended_at, completed
    ) VALUES (
      demo_user_id,
      30 + floor(random() * 30)::INTEGER,
      current_date - INTERVAL '20 days' - (i || ' days')::INTERVAL + INTERVAL '14 hours',
      current_date - INTERVAL '20 days' - (i || ' days')::INTERVAL + INTERVAL '14 hours 30 minutes',
      true
    );
  END LOOP;

  -- 5. 连续30天成就数据
  FOR i IN 0..29 LOOP
    INSERT INTO public.focus_sessions (
      user_id, duration, started_at, ended_at, completed
    ) VALUES (
      demo_user_id,
      25 + floor(random() * 20)::INTEGER,
      current_date - INTERVAL '50 days' - (i || ' days')::INTERVAL + INTERVAL '15 hours',
      current_date - INTERVAL '50 days' - (i || ' days')::INTERVAL + INTERVAL '15 hours 25 minutes',
      true
    );
  END LOOP;

  RAISE NOTICE '已成功插入演示数据，用户ID: %', demo_user_id;
END $$;

-- 手动触发成就解锁（确保所有成就都能被检测到）
DO $$
DECLARE
  demo_user_id UUID := 'c39d692c-3db6-42e1-8b81-ac09cacafb20';
BEGIN
  -- 调用成就解锁函数
  PERFORM public.check_and_unlock_achievements(demo_user_id);
  
  RAISE NOTICE '已触发成就解锁检查';
END $$;

-- 验证数据插入结果
SELECT 
  COUNT(*) as total_sessions,
  SUM(duration) as total_minutes,
  COUNT(DISTINCT DATE(started_at)) as active_days,
  MAX(duration) as longest_session
FROM public.focus_sessions 
WHERE user_id = 'c39d692c-3db6-42e1-8b81-ac09cacafb20';

-- 查看成就解锁情况
SELECT 
  a.achievement_id,
  a.achievement_name,
  a.achievement_desc,
  a.unlocked_at
FROM public.achievements a
WHERE a.user_id = 'c39d692c-3db6-42e1-8b81-ac09cacafb20'
ORDER BY a.unlocked_at DESC;

-- 查看热力图数据统计
SELECT 
  COUNT(*) as total_days,
  SUM(focus_minutes) as total_minutes,
  AVG(focus_minutes) as avg_daily_minutes,
  MAX(focus_minutes) as max_daily_minutes
FROM public.learning_heatmap 
WHERE user_id = 'c39d692c-3db6-42e1-8b81-ac09cacafb20';

-- 查看最近7天的专注数据
SELECT 
  DATE(started_at) as focus_date,
  COUNT(*) as session_count,
  SUM(duration) as total_minutes,
  STRING_AGG(duration::TEXT || 'min', ', ') as sessions
FROM public.focus_sessions 
WHERE user_id = 'c39d692c-3db6-42e1-8b81-ac09cacafb20'
  AND DATE(started_at) >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(started_at)
ORDER BY focus_date DESC;

-- 查看专注时段分布
SELECT 
  CASE 
    WHEN EXTRACT(HOUR FROM started_at) BETWEEN 5 AND 11 THEN '上午 (5-11点)'
    WHEN EXTRACT(HOUR FROM started_at) BETWEEN 12 AND 17 THEN '下午 (12-17点)'
    WHEN EXTRACT(HOUR FROM started_at) BETWEEN 18 AND 23 THEN '晚上 (18-23点)'
    ELSE '深夜 (0-4点)'
  END as time_period,
  COUNT(*) as session_count,
  SUM(duration) as total_minutes
FROM public.focus_sessions 
WHERE user_id = 'c39d692c-3db6-42e1-8b81-ac09cacafb20'
GROUP BY time_period
ORDER BY total_minutes DESC;
