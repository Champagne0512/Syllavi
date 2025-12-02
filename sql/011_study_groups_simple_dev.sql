-- ============================================
-- Syllabi 学习小组功能数据库表结构（开发简化版）
-- 移除外键约束，便于开发测试
-- ============================================

-- 1. 删除现有表（按依赖关系倒序删除）
DROP TABLE IF EXISTS public.group_invitations CASCADE;
DROP TABLE IF EXISTS public.group_task_members CASCADE;
DROP TABLE IF EXISTS public.group_tasks CASCADE;
DROP TABLE IF EXISTS public.group_messages CASCADE;
DROP TABLE IF EXISTS public.group_members CASCADE;
DROP TABLE IF EXISTS public.study_groups CASCADE;

-- 2. 重新创建学习小组表（移除外键约束）
CREATE TABLE public.study_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) <= 50),
  description TEXT,
  avatar_url TEXT,
  group_code TEXT UNIQUE NOT NULL,
  max_members SMALLINT NOT NULL DEFAULT 20 CHECK (max_members BETWEEN 2 AND 50),
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT NOT NULL DEFAULT 'demo-user', -- 改为TEXT类型，移除外键约束
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. 重新创建小组成员表（移除外键约束）
CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL, -- 移除外键约束
  user_id TEXT NOT NULL DEFAULT 'demo-user', -- 改为TEXT类型，移除外键约束
  role TEXT NOT NULL CHECK (role IN ('leader', 'deputy_leader', 'member')) DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- 4. 重新创建小组聊天消息表（简化版）
CREATE TABLE public.group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL,
  sender_id TEXT NOT NULL DEFAULT 'demo-user',
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'image', 'file', 'system')) DEFAULT 'text',
  content TEXT NOT NULL,
  file_url TEXT,
  file_name TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. 重新创建小组任务表（简化版）
CREATE TABLE public.group_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'demo-user',
  title TEXT NOT NULL CHECK (char_length(title) <= 120),
  description TEXT,
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. 重新创建小组任务成员关联表（简化版）
CREATE TABLE public.group_task_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL,
  user_id TEXT NOT NULL DEFAULT 'demo-user',
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id)
);

-- 7. 重新创建小组邀请表（简化版）
CREATE TABLE public.group_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL,
  invited_by TEXT NOT NULL DEFAULT 'demo-user',
  invited_user_id TEXT DEFAULT 'demo-user',
  group_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')) DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. 创建索引（提高查询性能）
CREATE INDEX IF NOT EXISTS study_groups_group_code_idx ON public.study_groups(group_code);
CREATE INDEX IF NOT EXISTS study_groups_is_public_idx ON public.study_groups(is_public);
CREATE INDEX IF NOT EXISTS study_groups_created_at_idx ON public.study_groups(created_at DESC);

CREATE INDEX IF NOT EXISTS group_members_group_idx ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS group_members_user_idx ON public.group_members(user_id);

CREATE INDEX IF NOT EXISTS group_messages_group_idx ON public.group_messages(group_id);
CREATE INDEX IF NOT EXISTS group_messages_created_idx ON public.group_messages(created_at DESC);

CREATE INDEX IF NOT EXISTS group_tasks_group_idx ON public.group_tasks(group_id);

CREATE INDEX IF NOT EXISTS group_invitations_group_idx ON public.group_invitations(group_id);

-- 9. 创建更新时间戳的触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 10. 为相关表创建更新时间戳触发器
CREATE TRIGGER study_groups_updated_at
  BEFORE UPDATE ON public.study_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER group_tasks_updated_at
  BEFORE UPDATE ON public.group_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER group_invitations_updated_at
  BEFORE UPDATE ON public.group_invitations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 11. 禁用 RLS（开发环境）
ALTER TABLE public.study_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_task_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_invitations DISABLE ROW LEVEL SECURITY;

-- 12. 创建示例数据（用于测试）
INSERT INTO public.study_groups (name, description, group_code, created_by, is_public, max_members)
VALUES 
  ('学习小组示例1', '这是一个示例学习小组', 'ABC123', 'demo-user', true, 20),
  ('考研交流群', '一起准备考研的小伙伴们', 'XYZ789', 'demo-user', true, 30)
ON CONFLICT DO NOTHING;

-- 13. 完成提示
DO $$
BEGIN
  RAISE NOTICE '开发版数据库配置完成！';
  RAISE NOTICE '已移除外键约束和RLS，便于开发测试。';
  RAISE NOTICE '生产环境请使用完整版本（010_reset_study_groups.sql）。';
END $$;