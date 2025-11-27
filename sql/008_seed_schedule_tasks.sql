-- =============================================
-- Demo Seed for Curriculum + Tasks
-- 说明：自动选取已有 profile（若没有则尝试用第一位 auth 用户填充），
-- 再写入课程、排课、待办。若你想针对指定用户，请修改 target_user CTE。
-- =============================================

WITH target_user AS (
  SELECT id AS user_id
  FROM public.profiles
  ORDER BY created_at
  LIMIT 1
),
ensure_profile AS (
  INSERT INTO public.profiles (id, nickname)
  SELECT au.id, COALESCE(au.raw_user_meta_data->>'nickname', 'Demo User')
  FROM auth.users au
  WHERE NOT EXISTS (SELECT 1 FROM target_user)
  ORDER BY au.created_at
  LIMIT 1
  ON CONFLICT (id) DO NOTHING
  RETURNING id AS user_id
),
final_user AS (
  SELECT user_id FROM target_user
  UNION
  SELECT user_id FROM ensure_profile
)

-- 1) 课程
, ins_courses AS (
  INSERT INTO public.courses (id, user_id, name, color, location, teacher, credits)
  SELECT *
  FROM (
    VALUES
      ('11111111-1111-1111-1111-111111111111'::uuid, (SELECT user_id FROM final_user), '操作系统', '#9BB5CE', 'C3-201', '李老师', 3.0),
      ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT user_id FROM final_user), '线性代数', '#C9A5A0', 'B1-105', '张老师', 4.0),
      ('33333333-3333-3333-3333-333333333333'::uuid, (SELECT user_id FROM final_user), '人工智能导论', '#A3B18A', 'A2-404', '王老师', 3.0),
      ('44444444-4444-4444-4444-444444444444'::uuid, (SELECT user_id FROM final_user), '英语视听说', '#D6CDEA', 'D1-302', 'Eva', 2.0),
      ('55555555-5555-5555-5555-555555555555'::uuid, (SELECT user_id FROM final_user), '计算机网络', '#E0C3A5', 'C3-101', '赵老师', 3.0)
  ) AS t(id, user_id, name, color, location, teacher, credits)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    color = EXCLUDED.color,
    location = EXCLUDED.location,
    teacher = EXCLUDED.teacher,
    credits = EXCLUDED.credits
  RETURNING id
)

-- 2) 排课
, ins_schedules AS (
  INSERT INTO public.course_schedules (id, user_id, course_id, day_of_week, start_section, length, weeks, location)
  VALUES
    ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa1', (SELECT user_id FROM final_user), '11111111-1111-1111-1111-111111111111', 1, 2, 2, ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16], 'C3-201'),
    ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa2', (SELECT user_id FROM final_user), '22222222-2222-2222-2222-222222222222', 2, 1, 2, ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16], 'B1-105'),
    ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa3', (SELECT user_id FROM final_user), '33333333-3333-3333-3333-333333333333', 3, 6, 3, ARRAY[1,3,5,7,9,11,13,15], 'A2-404'),
    ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa4', (SELECT user_id FROM final_user), '44444444-4444-4444-4444-444444444444', 4, 3, 2, ARRAY[1,2,3,4,5,6,7,8], 'D1-302'),
    ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaa5', (SELECT user_id FROM final_user), '55555555-5555-5555-5555-555555555555', 5, 1, 2, ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16], 'C3-101')
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)

-- 3) 待办任务
INSERT INTO public.tasks (id, user_id, type, title, description, deadline, is_completed, progress, related_course_id)
VALUES
  ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb1', (SELECT user_id FROM final_user), 'homework', '操作系统实验报告', '时间轮调度实验 + 1500 字报告', NOW() + INTERVAL '1 day', false, 20, '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb2', (SELECT user_id FROM final_user), 'homework', '线代作业第 5 次', 'P145-练习 6', NOW() + INTERVAL '3 days', false, 0, '22222222-2222-2222-2222-222222222222'),
  ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb3', (SELECT user_id FROM final_user), 'exam', '人工智能导论 Quiz', '知识图谱与启发式搜索', NOW() + INTERVAL '5 days', false, 0, '33333333-3333-3333-3333-333333333333'),
  ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb4', (SELECT user_id FROM final_user), 'homework', '英语视听说配音作业', '30 秒新闻片段配音 + 字幕', NOW() - INTERVAL '1 day', true, 100, '44444444-4444-4444-4444-444444444444'),
  ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb5', (SELECT user_id FROM final_user), 'homework', '计算机网络 Wireshark 报告', '截获 HTTP 报文并分析', NOW() + INTERVAL '7 days', false, 0, '55555555-5555-5555-5555-555555555555')
ON CONFLICT (id) DO UPDATE SET
  type = EXCLUDED.type,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  deadline = EXCLUDED.deadline,
  is_completed = EXCLUDED.is_completed,
  progress = EXCLUDED.progress,
  related_course_id = EXCLUDED.related_course_id;
