-- 为用户96a64db3-5c14-46b7-9174-1a98e19afeb4添加专注功能的测试数据

-- 设置用户ID变量
DO $$
DECLARE
  target_user_id UUID := '96a64db3-5c14-46b7-9174-1a98e19afeb4';
  current_date DATE := CURRENT_DATE;
  start_date DATE := CURRENT_DATE - INTERVAL '60 days'; -- 生成过去60天的数据
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
  -- 检查用户是否存在，如果不存在则创建基础用户信息
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id) THEN
    INSERT INTO public.profiles (id, nickname, school_name, grade)
    VALUES (target_user_id, '测试用户', '清华大学', '大三');
  END IF;
  
  -- 补全基础信息
  UPDATE public.profiles
  SET nickname = COALESCE(nickname, '测试用户'),
      school_name = COALESCE(school_name, '清华大学'),
      grade = COALESCE(grade, '大三')
  WHERE id = target_user_id;

  -- 清理旧数据，保证脚本可重复执行
  DELETE FROM public.focus_sessions WHERE user_id = target_user_id;
  DELETE FROM public.learning_heatmap WHERE user_id = target_user_id;
  DELETE FROM public.achievements WHERE user_id = target_user_id;

  -- 遍历过去60天的每一天
  date_counter := start_date;
  WHILE date_counter <= current_date LOOP
    day_of_week := EXTRACT(DOW FROM date_counter);
    is_weekend := day_of_week = 0 OR day_of_week = 6; -- 0=周日, 6=周六
    
    -- 周末专注次数较少，工作日专注次数较多
    IF is_weekend THEN
      focus_count := CASE 
        WHEN random() < 0.2 THEN 0  -- 20%概率不专注
        WHEN random() < 0.5 THEN 1  -- 30%概率专注1次
        ELSE 2                      -- 50%概率专注2次
      END;
    ELSE
      focus_count := CASE 
        WHEN random() < 0.05 THEN 0  -- 5%概率不专注
        WHEN random() < 0.25 THEN 1  -- 20%概率专注1次
        WHEN random() < 0.75 THEN 2  -- 50%概率专注2次
        ELSE 3                       -- 25%概率专注3次
      END;
    END IF;

    -- 生成当天的专注记录
    FOR i IN 1..focus_count LOOP
      -- 随机生成专注时长（25-180分钟）
      focus_duration := CASE 
        WHEN random() < 0.5 THEN 25 + floor(random() * 10)::INTEGER   -- 50%概率25-35分钟（标准番茄钟）
        WHEN random() < 0.8 THEN 45 + floor(random() * 15)::INTEGER  -- 30%概率45-60分钟
        ELSE 60 + floor(random() * 120)::INTEGER                     -- 20%概率60-180分钟
      END;

      -- 根据工作日/周末选择不同的时间段
      IF is_weekend THEN
        -- 周末：上午9-11点或下午2-5点或晚上7-10点
        start_hour := CASE 
          WHEN random() < 0.3 THEN 9 + floor(random() * 2)::INTEGER   -- 上午
          WHEN random() < 0.6 THEN 14 + floor(random() * 3)::INTEGER  -- 下午
          ELSE 19 + floor(random() * 3)::INTEGER                      -- 晚上
        END;
      ELSE
        -- 工作日：上午8-11点或下午2-6点或晚上7-11点
        start_hour := CASE 
          WHEN random() < 0.2 THEN 8 + floor(random() * 3)::INTEGER   -- 上午
          WHEN random() < 0.5 THEN 14 + floor(random() * 4)::INTEGER  -- 下午
          ELSE 19 + floor(random() * 4)::INTEGER                      -- 晚上
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
        target_user_id,
        focus_duration,
        start_time,
        end_time,
        true
      );
    END LOOP;

    date_counter := (date_counter + INTERVAL '1 day')::DATE;
  END LOOP;

  -- 添加一些特殊成就的触发数据
  -- 1. 潜行者成就（单次专注超过60分钟）
  INSERT INTO public.focus_sessions (
    user_id, duration, started_at, ended_at, completed
  ) VALUES (
    target_user_id,
    90, -- 90分钟
    current_date - INTERVAL '5 days' + INTERVAL '14 hours',
    current_date - INTERVAL '5 days' + INTERVAL '15 hours 30 minutes',
    true
  );

  -- 2. 夜猫子成就（晚上10点后专注）
  INSERT INTO public.focus_sessions (
    user_id, duration, started_at, ended_at, completed
  ) VALUES (
    target_user_id,
    30, -- 30分钟
    current_date - INTERVAL '10 days' + INTERVAL '22 hours 30 minutes',
    current_date - INTERVAL '10 days' + INTERVAL '23 hours',
    true
  );

  -- 3. 早鸟成就（早上6点前专注）
  INSERT INTO public.focus_sessions (
    user_id, duration, started_at, ended_at, completed
  ) VALUES (
    target_user_id,
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
      target_user_id,
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
      target_user_id,
      25 + floor(random() * 20)::INTEGER,
      current_date - INTERVAL '40 days' - (i || ' days')::INTERVAL + INTERVAL '15 hours',
      current_date - INTERVAL '40 days' - (i || ' days')::INTERVAL + INTERVAL '15 hours 25 minutes',
      true
    );
  END LOOP;

  -- 6. 连续60天成就数据
  i := 0;
  WHILE i < 60 LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.focus_sessions 
      WHERE user_id = target_user_id 
      AND DATE(started_at) = current_date - INTERVAL '60 days' + (i || ' days')::INTERVAL
      LIMIT 1
    ) THEN
      INSERT INTO public.focus_sessions (
        user_id, duration, started_at, ended_at, completed
      ) VALUES (
        target_user_id,
        25 + floor(random() * 20)::INTEGER,
        current_date - INTERVAL '60 days' + (i || ' days')::INTERVAL + INTERVAL '15 hours 25 minutes',
        current_date - INTERVAL '60 days' + (i || ' days')::INTERVAL + INTERVAL '15 hours 50 minutes',
        true
      );
    END IF;
    i := i + 1;
  END LOOP;

  RAISE NOTICE '已成功插入专注会话数据，用户ID: %', target_user_id;
END $$;

-- 触发热力图数据更新
DO $$
DECLARE
  target_user_id UUID := '96a64db3-5c14-46b7-9174-1a98e19afeb4';
  current_date DATE := CURRENT_DATE;
  start_date DATE := CURRENT_DATE - INTERVAL '60 days';
  date_counter DATE;
BEGIN
  -- 遍历每一天，根据专注会话数据更新热力图
  date_counter := start_date;
  WHILE date_counter <= current_date LOOP
    INSERT INTO public.learning_heatmap AS lh (user_id, date, focus_minutes, level)
    SELECT 
      target_user_id,
      date_counter,
      COALESCE(SUM(duration), 0),
      CASE 
        WHEN COALESCE(SUM(duration), 0) >= 120 THEN 4
        WHEN COALESCE(SUM(duration), 0) >= 90 THEN 3
        WHEN COALESCE(SUM(duration), 0) >= 60 THEN 2
        WHEN COALESCE(SUM(duration), 0) >= 30 THEN 1
        ELSE 0
      END
    FROM public.focus_sessions 
    WHERE user_id = target_user_id
      AND DATE(started_at) = date_counter
    GROUP BY user_id, DATE(started_at)
    ON CONFLICT (user_id, date) 
    DO UPDATE SET
      focus_minutes = EXCLUDED.focus_minutes,
      level = EXCLUDED.level,
      updated_at = NOW();
      
    date_counter := date_counter + INTERVAL '1 day';
  END LOOP;
  
  RAISE NOTICE '已更新学习热力图数据，用户ID: %', target_user_id;
END $$;

-- 手动触发成就解锁
DO $$
DECLARE
  target_user_id UUID := '96a64db3-5c14-46b7-9174-1a98e19afeb4';
BEGIN
  -- 调用成就解锁函数
  PERFORM public.check_and_unlock_achievements(target_user_id);
  
  RAISE NOTICE '已触发成就解锁检查，用户ID: %', target_user_id;
END $$;

-- 验证数据插入结果
-- 专注会话统计
SELECT 
  '专注会话统计' as 统计类型,
  COUNT(*) as 总会话数,
  SUM(duration) as 总分钟数,
  COUNT(DISTINCT DATE(started_at)) as 活跃天数,
  MAX(duration) as 最长单次专注
FROM public.focus_sessions 
WHERE user_id = '96a64db3-5c14-46b7-9174-1a98e19afeb4'

UNION ALL

-- 热力图统计
SELECT 
  '热力图统计' as 统计类型,
  COUNT(*) as 记录天数,
  SUM(focus_minutes) as 总分钟数,
  COUNT(CASE WHEN level > 0 THEN 1 END) as 活跃天数,
  MAX(focus_minutes) as 最高单日专注
FROM public.learning_heatmap 
WHERE user_id = '96a64db3-5c14-46b7-9174-1a98e19afeb4'

UNION ALL

-- 成就统计
SELECT 
  '成就统计' as 统计类型,
  COUNT(*) as 获得成就数,
  0 as 总分钟数,
  0 as 活跃天数,
  0 as 最长单次专注
FROM public.achievements 
WHERE user_id = '96a64db3-5c14-46b7-9174-1a98e19afeb4';

-- 查看最近7天的专注数据
SELECT 
  '最近7天专注数据' as 数据类型,
  DATE(started_at) as 日期,
  COUNT(*) as 专注次数,
  SUM(duration) as 总分钟数
FROM public.focus_sessions 
WHERE user_id = '96a64db3-5c14-46b7-9174-1a98e19afeb4'
  AND DATE(started_at) >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(started_at)
ORDER BY DATE(started_at) DESC;

-- 查看获得的成就
SELECT 
  a.achievement_id as 成就ID,
  a.achievement_name as 成就名称,
  a.achievement_desc as 成就描述,
  a.achievement_icon as 图标,
  a.unlocked_at as 获得时间
FROM public.achievements a
WHERE a.user_id = '96a64db3-5c14-46b7-9174-1a98e19afeb4'
ORDER BY a.unlocked_at;