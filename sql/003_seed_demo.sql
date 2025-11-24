-- 003_seed_demo.sql
-- Demo 数据：便于本地预览与游客模式演示。

DO $$
DECLARE
  demo_id CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.profiles (id, nickname, school_name, grade)
  VALUES (demo_id, 'Syllaby 同学', '理想大学', '大二')
  ON CONFLICT (id) DO UPDATE
    SET nickname = EXCLUDED.nickname,
        school_name = EXCLUDED.school_name,
        grade = EXCLUDED.grade;
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE '请先在 auth.users 中创建 id=% 的用户，再运行种子数据脚本。', demo_id;
END $$;

WITH demo AS (
  SELECT id FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001'
)
INSERT INTO public.courses (user_id, name, color, location, teacher, credits)
SELECT demo.id, c.name, c.color, c.location, c.teacher, c.credits
FROM demo
JOIN (VALUES
  ('高等数学', '#9BB5CE', 'A3-302', '王老师', 4.0),
  ('计算机网络', '#C9A5A0', '信息楼401', '李老师', 3.0),
  ('AI 工程实践', '#A3B18A', '创新中心', '陈老师', 2.0)
) AS c(name, color, location, teacher, credits) ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.courses existing
  WHERE existing.user_id = demo.id AND existing.name = c.name
);

WITH demo AS (
  SELECT id FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001'
),
course_map AS (
  SELECT id, name FROM public.courses WHERE user_id = (SELECT id FROM demo)
)
INSERT INTO public.course_schedules (user_id, course_id, day_of_week, start_section, length, weeks, location)
SELECT demo.id,
       cm.id,
       s.day_of_week,
       s.start_section,
       s.length,
       s.weeks,
       s.location
FROM demo
JOIN (VALUES
  ('高等数学', 1, 1, 2, ARRAY[1,2,3,4,5,6,7,8]::SMALLINT[], 'A3-302'),
  ('高等数学', 3, 1, 2, ARRAY[1,2,3,4,5,6,7,8]::SMALLINT[], 'A3-302'),
  ('计算机网络', 2, 5, 2, ARRAY[1,2,3,4,5,6,7,8]::SMALLINT[], '信息楼401'),
  ('AI 工程实践', 4, 7, 2, ARRAY[5,6,7,8,9,10,11,12]::SMALLINT[], '创新中心 Lab')
) AS s(course_name, day_of_week, start_section, length, weeks, location)
  ON TRUE
JOIN course_map cm ON cm.name = s.course_name
WHERE NOT EXISTS (
  SELECT 1 FROM public.course_schedules existing
  WHERE existing.user_id = demo.id
    AND existing.course_id = cm.id
    AND existing.day_of_week = s.day_of_week
    AND existing.start_section = s.start_section
);

WITH demo AS (
  SELECT id FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001'
),
course_map AS (
  SELECT id, name FROM public.courses WHERE user_id = (SELECT id FROM demo)
)
INSERT INTO public.tasks (user_id, type, title, description, deadline, progress, related_course_id)
SELECT demo.id,
       t.type,
       t.title,
       t.description,
       now() + t.deadline_offset,
       t.progress,
       cm.id
FROM demo
JOIN (VALUES
  ('homework', '线性代数作业', '完成第5章的习题', INTERVAL '3 days', 20, '高等数学'),
  ('exam', '计算机网络测验', '复习第4章与第5章', INTERVAL '7 days', 60, '计算机网络')
) AS t(type, title, description, deadline_offset, progress, course_name) ON TRUE
LEFT JOIN course_map cm ON cm.name = t.course_name
WHERE NOT EXISTS (
  SELECT 1 FROM public.tasks existing
  WHERE existing.user_id = demo.id AND existing.title = t.title
);

WITH demo AS (
  SELECT id FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001'
)
INSERT INTO public.resources (user_id, file_name, file_url, file_type, file_size, subject)
SELECT demo.id, r.file_name, r.file_url, r.file_type, r.file_size, r.subject
FROM demo
JOIN (VALUES
  ('高数期中重点.pdf', 'https://example.com/demo/math.pdf', 'pdf', 5242880, '数学'),
  ('计网答疑录音.mp3', 'https://example.com/demo/network.mp3', 'other', 2097152, '计算机网络')
) AS r(file_name, file_url, file_type, file_size, subject) ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.resources existing
  WHERE existing.user_id = demo.id AND existing.file_name = r.file_name
);

WITH demo AS (
  SELECT id FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001'
),
course_map AS (
  SELECT id, name FROM public.courses WHERE user_id = (SELECT id FROM demo)
)
INSERT INTO public.focus_sessions (user_id, duration, started_at, ended_at, related_course_id)
SELECT demo.id,
       f.duration,
       now() - f.started_offset,
       now() - f.started_offset + make_interval(mins => f.duration),
       cm.id
FROM demo
JOIN (VALUES
  (50, INTERVAL '1 day', '高等数学'),
  (90, INTERVAL '2 hours', 'AI 工程实践')
) AS f(duration, started_offset, course_name) ON TRUE
LEFT JOIN course_map cm ON cm.name = f.course_name
WHERE NOT EXISTS (
  SELECT 1 FROM public.focus_sessions existing
  WHERE existing.user_id = demo.id AND existing.duration = f.duration AND ABS(EXTRACT(EPOCH FROM (existing.started_at - (now() - f.started_offset)))) < 60
);

WITH demo AS (
  SELECT id FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001'
)
INSERT INTO public.room_reports (reported_by, building, room_name, floor, status, features, expires_at)
SELECT demo.id,
       r.building,
       r.room_name,
       r.floor,
       r.status,
       r.features,
       now() + r.ttl
FROM demo
JOIN (VALUES
  ('图书馆', '4F-静音区', 4, 'available', ARRAY['静音','插座丰富']::TEXT[], INTERVAL '2 hours'),
  ('信息楼', '203', 2, 'available', ARRAY['空调']::TEXT[], INTERVAL '90 minutes')
) AS r(building, room_name, floor, status, features, ttl) ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.room_reports existing
  WHERE existing.building = r.building AND existing.room_name = r.room_name AND existing.reported_by = demo.id
);
