-- 修复外键关系和数据库约束
-- 执行此脚本前请确保已经备份了重要数据

-- 1. 检查当前外键约束
SELECT 
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE 
    tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_schema = 'public';

-- 2. 为 group_tasks 表添加外键约束（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'group_tasks_group_id_fkey' 
        AND table_name = 'group_tasks' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.group_tasks 
        ADD CONSTRAINT group_tasks_group_id_fkey 
        FOREIGN KEY (group_id) 
        REFERENCES public.study_groups(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- 3. 为 group_members 表添加外键约束（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'group_members_group_id_fkey' 
        AND table_name = 'group_members' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.group_members 
        ADD CONSTRAINT group_members_group_id_fkey 
        FOREIGN KEY (group_id) 
        REFERENCES public.study_groups(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- 4. 为 group_task_members 表添加外键约束（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'group_task_members_task_id_fkey' 
        AND table_name = 'group_task_members' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.group_task_members 
        ADD CONSTRAINT group_task_members_task_id_fkey 
        FOREIGN KEY (task_id) 
        REFERENCES public.group_tasks(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- 5. 检查外键约束是否添加成功
SELECT 
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE 
    tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_schema = 'public'
    AND tc.table_name IN ('group_tasks', 'group_members', 'group_task_members');

-- 6. 更新 Supabase 的元数据，确保 API 能够识别表关系
-- 这可能需要重新部署或重启 Supabase 服务
NOTIFY pgrst, 'reload schema';

-- 7. 检查表是否正确识别外键关系
-- 可以通过以下查询测试 API 是否能识别关系
SELECT 'test' AS test_query;

-- 执行完成后，外键关系应该正确建立
-- Supabase API 应该能够识别 group_tasks 和 study_groups 之间的关系
-- 这将允许使用关联查询，如：study_groups:study_groups(id,name,description)