# 04 - 数据库设计

## 4.1 数据模型概览

### ER图

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│  profiles   │       │   courses   │       │course_sched │
│─────────────│       │─────────────│       │─────────────│
│ id (PK)     │<──┐   │ id (PK)     │<──┐   │ id (PK)     │
│ school_name │   │   │ user_id (FK)│───┘   │ user_id (FK)│
│ grade       │   │   │ name        │       │ course_id   │
│ theme_pref  │   │   │ color       │       │ day_of_week │
│ created_at  │   │   │ location    │       │ start_sect  │
└─────────────┘   │   │ teacher     │       │ length      │
                  │   └─────────────┘       │ weeks       │
                  │                         └─────────────┘
                  │
                  │   ┌─────────────┐       ┌─────────────┐
                  │   │    tasks    │       │  resources  │
                  │   │─────────────│       │─────────────│
                  ├───│ user_id (FK)│       │ user_id (FK)│───┐
                  │   │ type        │       │ file_name   │   │
                  │   │ title       │       │ file_url    │   │
                  │   │ deadline    │       │ file_type   │   │
                  │   │ is_complete │       │ subject     │   │
                  │   │ course_id   │       │ ai_summary  │   │
                  │   └─────────────┘       └─────────────┘   │
                  │                                           │
                  │   ┌─────────────┐       ┌─────────────┐   │
                  │   │focus_sessio │       │room_reports │   │
                  │   │─────────────│       │─────────────│   │
                  └───│ user_id (FK)│       │ reported_by │───┘
                      │ duration    │       │ room_name   │
                      │ started_at  │       │ building    │
                      │ ended_at    │       │ status      │
                      │ course_id   │       │ expires_at  │
                      └─────────────┘       └─────────────┘
```

---

## 4.2 表结构详细设计

### 4.2.1 profiles - 用户表

存储用户基本信息和设置偏好。

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | uuid | PK, FK | - | 关联 auth.users |
| wechat_openid | text | UNIQUE | - | 微信openid |
| nickname | text | - | '同学' | 昵称 |
| avatar_url | text | - | null | 头像URL |
| school_name | text | - | null | 学校名称 |
| grade | text | - | null | 年级 |
| section_times | jsonb | - | 默认时间表 | 节次时间配置 |
| theme_preference | jsonb | - | {} | 主题设置 |
| created_at | timestamptz | NOT NULL | now() | 创建时间 |
| updated_at | timestamptz | NOT NULL | now() | 更新时间 |

**SQL创建语句**:

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wechat_openid TEXT UNIQUE,
  nickname TEXT DEFAULT '同学',
  avatar_url TEXT,
  school_name TEXT,
  grade TEXT CHECK (grade IN ('大一', '大二', '大三', '大四', '研一', '研二', '研三', '博士', NULL)),
  section_times JSONB DEFAULT '[
    {"section": 1, "start": "08:00", "end": "08:45"},
    {"section": 2, "start": "08:55", "end": "09:40"},
    {"section": 3, "start": "10:00", "end": "10:45"},
    {"section": 4, "start": "10:55", "end": "11:40"},
    {"section": 5, "start": "14:00", "end": "14:45"},
    {"section": 6, "start": "14:55", "end": "15:40"},
    {"section": 7, "start": "16:00", "end": "16:45"},
    {"section": 8, "start": "16:55", "end": "17:40"},
    {"section": 9, "start": "19:00", "end": "19:45"},
    {"section": 10, "start": "19:55", "end": "20:40"},
    {"section": 11, "start": "20:50", "end": "21:35"},
    {"section": 12, "start": "21:45", "end": "22:30"}
  ]'::jsonb,
  theme_preference JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS 策略
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);
```

---

### 4.2.2 courses - 课程元数据表

存储课程基本信息。

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | uuid | PK | gen_random_uuid() | 主键 |
| user_id | uuid | FK, NOT NULL | - | 用户ID |
| name | text | NOT NULL | - | 课程名称 |
| color | text | NOT NULL | - | 颜色Hex值 |
| location | text | - | null | 默认教室 |
| teacher | text | - | null | 教师姓名 |
| credits | numeric(3,1) | - | null | 学分 |
| created_at | timestamptz | NOT NULL | now() | 创建时间 |
| updated_at | timestamptz | NOT NULL | now() | 更新时间 |

**SQL创建语句**:

```sql
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) <= 50),
  color TEXT NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  location TEXT CHECK (char_length(location) <= 100),
  teacher TEXT CHECK (char_length(teacher) <= 50),
  credits NUMERIC(3,1) CHECK (credits >= 0 AND credits <= 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX courses_user_id_idx ON courses(user_id);

-- 更新时间触发器
CREATE TRIGGER courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS 策略
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own courses"
  ON courses FOR ALL
  USING (auth.uid() = user_id);
```

---

### 4.2.3 course_schedules - 排课表

存储具体的上课时间安排。

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | uuid | PK | gen_random_uuid() | 主键 |
| user_id | uuid | FK, NOT NULL | - | 用户ID |
| course_id | uuid | FK, NOT NULL | - | 课程ID |
| day_of_week | smallint | NOT NULL | - | 星期几(1-7) |
| start_section | smallint | NOT NULL | - | 起始节次(1-12) |
| length | smallint | NOT NULL | - | 持续节数(1-4) |
| weeks | smallint[] | NOT NULL | - | 上课周数 |
| location | text | - | null | 教室(可覆盖课程默认) |
| created_at | timestamptz | NOT NULL | now() | 创建时间 |

**SQL创建语句**:

```sql
CREATE TABLE course_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_section SMALLINT NOT NULL CHECK (start_section BETWEEN 1 AND 12),
  length SMALLINT NOT NULL CHECK (length BETWEEN 1 AND 4),
  weeks SMALLINT[] NOT NULL CHECK (array_length(weeks, 1) > 0),
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 检查节次不超出范围
  CONSTRAINT valid_sections CHECK (start_section + length - 1 <= 12)
);

-- 索引
CREATE INDEX schedules_user_id_idx ON course_schedules(user_id);
CREATE INDEX schedules_course_id_idx ON course_schedules(course_id);
CREATE INDEX schedules_day_idx ON course_schedules(day_of_week);

-- RLS 策略
ALTER TABLE course_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own schedules"
  ON course_schedules FOR ALL
  USING (auth.uid() = user_id);
```

---

### 4.2.4 tasks - 任务表

存储作业和考试信息。

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | uuid | PK | gen_random_uuid() | 主键 |
| user_id | uuid | FK, NOT NULL | - | 用户ID |
| type | text | NOT NULL | - | homework/exam |
| title | text | NOT NULL | - | 任务标题 |
| description | text | - | null | 详细描述 |
| deadline | timestamptz | NOT NULL | - | 截止时间 |
| is_completed | boolean | NOT NULL | false | 是否完成 |
| progress | smallint | NOT NULL | 0 | 进度(0-100) |
| related_course_id | uuid | FK | null | 关联课程 |
| reminder_sent | boolean | NOT NULL | false | 是否已发提醒 |
| created_at | timestamptz | NOT NULL | now() | 创建时间 |
| updated_at | timestamptz | NOT NULL | now() | 更新时间 |

**SQL创建语句**:

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('homework', 'exam')),
  title TEXT NOT NULL CHECK (char_length(title) <= 100),
  description TEXT CHECK (char_length(description) <= 500),
  deadline TIMESTAMPTZ NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  related_course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  reminder_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX tasks_user_id_idx ON tasks(user_id);
CREATE INDEX tasks_deadline_idx ON tasks(deadline);
CREATE INDEX tasks_type_idx ON tasks(type);
CREATE INDEX tasks_completed_idx ON tasks(is_completed) WHERE NOT is_completed;

-- 更新时间触发器
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS 策略
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own tasks"
  ON tasks FOR ALL
  USING (auth.uid() = user_id);
```

---

### 4.2.5 resources - 资料表

存储用户上传的学习资料。

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | uuid | PK | gen_random_uuid() | 主键 |
| user_id | uuid | FK, NOT NULL | - | 用户ID |
| file_name | text | NOT NULL | - | 原始文件名 |
| file_url | text | NOT NULL | - | Storage URL |
| file_type | text | NOT NULL | - | 文件类型 |
| file_size | bigint | - | null | 文件大小(bytes) |
| subject | text | - | '未分类' | 科目分类 |
| ai_summary | text | - | null | AI生成摘要 |
| created_at | timestamptz | NOT NULL | now() | 创建时间 |

**SQL创建语句**:

```sql
CREATE TABLE resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL CHECK (char_length(file_name) <= 255),
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'ppt', 'pptx', 'doc', 'docx', 'jpg', 'png', 'other')),
  file_size BIGINT CHECK (file_size > 0),
  subject TEXT DEFAULT '未分类' CHECK (char_length(subject) <= 50),
  ai_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX resources_user_id_idx ON resources(user_id);
CREATE INDEX resources_subject_idx ON resources(subject);

-- RLS 策略
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own resources"
  ON resources FOR ALL
  USING (auth.uid() = user_id);
```

---

### 4.2.6 focus_sessions - 专注记录表

存储用户的专注学习记录。

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | uuid | PK | gen_random_uuid() | 主键 |
| user_id | uuid | FK, NOT NULL | - | 用户ID |
| duration | integer | NOT NULL | - | 专注时长(分钟) |
| started_at | timestamptz | NOT NULL | - | 开始时间 |
| ended_at | timestamptz | NOT NULL | - | 结束时间 |
| related_course_id | uuid | FK | null | 关联课程 |
| completed | boolean | NOT NULL | true | 是否完成 |

**SQL创建语句**:

```sql
CREATE TABLE focus_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  duration INTEGER NOT NULL CHECK (duration > 0 AND duration <= 180),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  related_course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  completed BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT valid_time_range CHECK (ended_at > started_at)
);

-- 索引
CREATE INDEX focus_user_id_idx ON focus_sessions(user_id);
CREATE INDEX focus_started_at_idx ON focus_sessions(started_at);

-- RLS 策略
ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own focus sessions"
  ON focus_sessions FOR ALL
  USING (auth.uid() = user_id);
```

---

### 4.2.7 room_reports - 空教室报告表 (P2)

存储用户众包标记的空教室信息。

| 字段 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | uuid | PK | gen_random_uuid() | 主键 |
| reported_by | uuid | FK, NOT NULL | - | 报告者ID |
| building | text | NOT NULL | - | 教学楼 |
| room_name | text | NOT NULL | - | 教室号 |
| floor | smallint | - | null | 楼层 |
| status | text | NOT NULL | - | 状态 |
| features | text[] | - | {} | 特点标签 |
| expires_at | timestamptz | NOT NULL | - | 过期时间 |
| created_at | timestamptz | NOT NULL | now() | 创建时间 |

**SQL创建语句**:

```sql
CREATE TABLE room_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  building TEXT NOT NULL CHECK (char_length(building) <= 50),
  room_name TEXT NOT NULL CHECK (char_length(room_name) <= 20),
  floor SMALLINT CHECK (floor BETWEEN 1 AND 50),
  status TEXT NOT NULL CHECK (status IN ('available', 'occupied', 'uncertain')),
  features TEXT[] DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 过期时间必须在未来
  CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

-- 索引
CREATE INDEX rooms_building_idx ON room_reports(building);
CREATE INDEX rooms_expires_idx ON room_reports(expires_at);

-- RLS 策略 (空教室信息对所有用户可见)
ALTER TABLE room_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view room reports"
  ON room_reports FOR SELECT
  USING (true);

CREATE POLICY "Users can insert room reports"
  ON room_reports FOR INSERT
  WITH CHECK (auth.uid() = reported_by);

CREATE POLICY "Users can delete own reports"
  ON room_reports FOR DELETE
  USING (auth.uid() = reported_by);
```

---

## 4.3 数据库函数

### 4.3.1 获取本周课程

```sql
CREATE OR REPLACE FUNCTION get_week_schedule(
  p_user_id UUID,
  p_week_number INTEGER DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  day_of_week SMALLINT,
  start_section SMALLINT,
  length SMALLINT,
  location TEXT,
  course_name TEXT,
  course_color TEXT
) AS $$
DECLARE
  v_week INTEGER;
BEGIN
  -- 如果没有指定周次，计算当前周次
  IF p_week_number IS NULL THEN
    -- 假设学期从9月1日开始，这里简化处理
    v_week := EXTRACT(WEEK FROM CURRENT_DATE) - 35;
    IF v_week < 1 THEN v_week := 1; END IF;
    IF v_week > 20 THEN v_week := 20; END IF;
  ELSE
    v_week := p_week_number;
  END IF;

  RETURN QUERY
  SELECT
    cs.id,
    cs.day_of_week,
    cs.start_section,
    cs.length,
    COALESCE(cs.location, c.location) AS location,
    c.name AS course_name,
    c.color AS course_color
  FROM course_schedules cs
  JOIN courses c ON cs.course_id = c.id
  WHERE cs.user_id = p_user_id
    AND v_week = ANY(cs.weeks)
  ORDER BY cs.day_of_week, cs.start_section;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 4.3.2 获取专注统计

```sql
CREATE OR REPLACE FUNCTION get_focus_stats(p_user_id UUID)
RETURNS TABLE (
  total_minutes BIGINT,
  session_count BIGINT,
  streak_days INTEGER,
  today_minutes BIGINT,
  week_minutes BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH daily_sessions AS (
    SELECT DATE(started_at) AS session_date
    FROM focus_sessions
    WHERE user_id = p_user_id AND completed = true
    GROUP BY DATE(started_at)
    ORDER BY session_date DESC
  ),
  streak AS (
    SELECT COUNT(*) AS days
    FROM (
      SELECT session_date,
             session_date - (ROW_NUMBER() OVER (ORDER BY session_date DESC))::int AS grp
      FROM daily_sessions
      WHERE session_date >= CURRENT_DATE - 30
    ) t
    WHERE grp = (
      SELECT session_date - (ROW_NUMBER() OVER (ORDER BY session_date DESC))::int
      FROM daily_sessions
      WHERE session_date = CURRENT_DATE
      LIMIT 1
    )
  )
  SELECT
    COALESCE(SUM(duration), 0)::BIGINT AS total_minutes,
    COUNT(*)::BIGINT AS session_count,
    COALESCE((SELECT days FROM streak), 0)::INTEGER AS streak_days,
    COALESCE(SUM(CASE WHEN DATE(started_at) = CURRENT_DATE THEN duration ELSE 0 END), 0)::BIGINT AS today_minutes,
    COALESCE(SUM(CASE WHEN started_at >= CURRENT_DATE - 7 THEN duration ELSE 0 END), 0)::BIGINT AS week_minutes
  FROM focus_sessions
  WHERE user_id = p_user_id AND completed = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 4.3.3 清理过期数据

```sql
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS void AS $$
BEGIN
  -- 清理过期的空教室报告
  DELETE FROM room_reports
  WHERE expires_at < NOW();

  -- 可以添加更多清理逻辑
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建定时任务（使用 pg_cron 扩展）
-- SELECT cron.schedule('cleanup-expired', '0 * * * *', 'SELECT cleanup_expired_data()');
```

---

## 4.4 Storage 配置

### Bucket 设计

| Bucket | 访问级别 | 用途 |
|--------|----------|------|
| avatars | public | 用户头像 |
| resources | private | 用户资料文件 |
| temp | private | 临时文件(OCR上传) |

### Storage 策略

```sql
-- 创建 Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('resources', 'resources', false),
  ('temp', 'temp', false);

-- avatars bucket 策略
CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- resources bucket 策略
CREATE POLICY "Users can CRUD own resources"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'resources' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- temp bucket 策略
CREATE POLICY "Users can use temp storage"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'temp' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
```

---

## 4.5 初始化脚本

### 完整的迁移脚本

```sql
-- migrations/20250101000000_init.sql

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 创建更新时间函数
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建所有表
-- (上面各表的 CREATE TABLE 语句)

-- 创建所有索引
-- (上面各表的 CREATE INDEX 语句)

-- 创建所有触发器
-- (上面各表的 CREATE TRIGGER 语句)

-- 启用 RLS 并创建策略
-- (上面各表的 RLS 策略)

-- 创建函数
-- (上面的函数定义)
```

### 种子数据

```sql
-- seed.sql

-- 测试用户 (需要先在 auth.users 中创建)
INSERT INTO profiles (id, wechat_openid, nickname, school_name, grade)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'test_openid_001', '测试同学', '北京大学', '大三');

-- 测试课程
INSERT INTO courses (id, user_id, name, color, location, teacher)
VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '高等数学', '#9BB5CE', 'A3-302', '张教授'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '计算机网络', '#C9A5A0', '信息楼401', '李教授'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'AI工程实践', '#A3B18A', '创新中心', '王教授');

-- 测试排课
INSERT INTO course_schedules (user_id, course_id, day_of_week, start_section, length, weeks)
VALUES
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 1, 2, ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 1, 3, 2, ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 3, 5, 3, ARRAY[1,3,5,7,9,11,13,15]);

-- 测试任务
INSERT INTO tasks (user_id, type, title, deadline, related_course_id)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'homework', '操作系统实验报告', NOW() + INTERVAL '3 days', NULL),
  ('00000000-0000-0000-0000-000000000001', 'exam', '高等数学期中考试', NOW() + INTERVAL '7 days', '10000000-0000-0000-0000-000000000001');
```

---

*下一章: [05 - API设计](./05-api-design.md)*
