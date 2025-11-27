-- 013_simplify_resources.sql
-- 简化资料功能，移除分享机制，专注于基础文件管理

-- 1. 移除分享相关字段（如果存在）
DO $$
BEGIN
    -- 检查并移除分享相关字段
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'resources' AND column_name = 'resource_code') THEN
        ALTER TABLE public.resources DROP COLUMN resource_code;
        RAISE NOTICE '已移除 resource_code 字段';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'resources' AND column_name = 'is_shared') THEN
        ALTER TABLE public.resources DROP COLUMN is_shared;
        RAISE NOTICE '已移除 is_shared 字段';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'resources' AND column_name = 'share_code') THEN
        ALTER TABLE public.resources DROP COLUMN share_code;
        RAISE NOTICE '已移除 share_code 字段';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'resources' AND column_name = 'shared_at') THEN
        ALTER TABLE public.resources DROP COLUMN shared_at;
        RAISE NOTICE '已移除 shared_at 字段';
    END IF;
END $$;

-- 2. 删除分享相关的索引和函数
DROP INDEX IF EXISTS resources_code_idx;
DROP INDEX IF EXISTS resources_share_code_idx;

DROP FUNCTION IF EXISTS public.generate_share_code();
DROP FUNCTION IF EXISTS public.share_resource(UUID, UUID);
DROP FUNCTION IF EXISTS public.get_resource_by_share_code(TEXT);
DROP FUNCTION IF EXISTS public.unshare_resource(UUID, UUID);
DROP FUNCTION IF EXISTS public.get_resource_by_code(TEXT);
DROP TRIGGER IF EXISTS set_resource_code_trigger ON public.resources;
DROP FUNCTION IF EXISTS public.set_resource_code();

-- 3. 删除分享相关的存储桶策略
DROP POLICY IF EXISTS "Anyone can view shared resources" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to shared resources" ON storage.objects;

-- 4. 移除资源表的分享相关RLS策略
DROP POLICY IF EXISTS "resources_select_shared" ON public.resources;

-- 5. 确认简化后的资源表结构
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'resources' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- 6. 验证基础功能：文件上传、存储、调用
RAISE NOTICE '资料功能已简化为基础文件管理模式';
RAISE NOTICE '✅ 保留功能：文件上传、存储、分类管理、预览';
RAISE NOTICE '✅ 移除功能：分享码、编码共享、跨用户访问';
RAISE NOTICE '✅ 简化后专注于个人文件管理，更易于维护和使用';

-- 7. 创建基础文件管理测试数据（可选）
DO $$
DECLARE
    test_user_id UUID;
BEGIN
    -- 获取测试用户
    SELECT id INTO test_user_id FROM public.profiles WHERE nickname LIKE '%测试%' LIMIT 1;
    
    IF test_user_id IS NOT NULL THEN
        -- 插入基础测试文件
        INSERT INTO public.resources (
            id, user_id, file_name, file_type, file_size, file_url, subject, ai_summary
        ) VALUES 
        (
            gen_random_uuid(), test_user_id, '高等数学笔记.pdf', 'pdf', 2048000,
            'https://example.com/math-notes.pdf', '高等数学', '高等数学基础概念和公式总结'
        ),
        (
            gen_random_uuid(), test_user_id, '数据结构课件.pptx', 'pptx', 1536000,
            'https://example.com/ds-courseware.pptx', '数据结构', '数据结构与算法教学课件'
        )
        ON CONFLICT DO NOTHING;
        
        RAISE NOTICE '基础测试文件已插入';
    END IF;
END $$;

-- 8. 验证简化后的资源数据
SELECT 
    id,
    file_name,
    file_type,
    file_size,
    subject,
    created_at
FROM public.resources 
ORDER BY created_at DESC 
LIMIT 5;