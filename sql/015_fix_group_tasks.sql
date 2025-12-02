-- 修复小组任务功能的数据库更新脚本
-- 执行此脚本前请确保已经备份了重要数据

-- 1. 为 tasks 表添加小组任务相关字段
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS group_id UUID,
ADD COLUMN IF NOT EXISTS is_group_task BOOLEAN DEFAULT FALSE;

-- 2. 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS tasks_group_id_idx ON public.tasks(group_id);
CREATE INDEX IF NOT EXISTS tasks_is_group_task_idx ON public.tasks(is_group_task);

-- 3. 更新现有数据，确保所有记录的 is_group_task 字段有值
UPDATE public.tasks 
SET is_group_task = FALSE 
WHERE is_group_task IS NULL;

-- 4. （可选）如果需要为现有的个人任务创建小组任务，可以执行以下操作
-- 例如：为特定用户的所有未完成任务创建小组任务版本
/*
INSERT INTO public.tasks (user_id, type, title, description, deadline, is_completed, progress, related_course_id, group_id, is_group_task)
SELECT 
    user_id, 
    type, 
    '[小组任务] ' || title, 
    description || ' (来自个人任务)', 
    deadline, 
    is_completed, 
    progress, 
    related_course_id,
    '00000000-0000-0000-0000-000000000000'::UUID, -- 替换为实际的小组ID
    TRUE
FROM public.tasks 
WHERE user_id = 'your-user-id' AND is_completed = FALSE;
*/

-- 5. 检查表结构
-- 可以使用以下查询替代 \d 命令
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM 
    information_schema.columns 
WHERE 
    table_name = 'tasks' 
    AND table_schema = 'public'
ORDER BY 
    ordinal_position;

-- 6. 检查新添加的索引
-- 可以使用以下查询替代 \d+ 命令
SELECT 
    indexname, 
    indexdef 
FROM 
    pg_indexes 
WHERE 
    tablename = 'tasks' 
    AND schemaname = 'public'
    AND indexname LIKE '%tasks%';

-- 执行完成后，小组任务功能应该可以正常工作
-- 任务创建时会：
-- 1. 首先尝试使用 group_tasks 和 group_task_members 表
-- 2. 如果失败，则会降级到使用 tasks 表，并标记为小组任务
-- 3. 首页的 fetchAllTasks 函数会正确识别和显示这些任务