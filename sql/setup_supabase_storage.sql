-- setup_supabase_storage.sql
-- 便捷脚本：一键设置 Supabase 存储桶和RLS策略
-- 使用方法：
-- 1. 先在 Supabase Dashboard 创建 "resources" 存储桶（参考下方说明）
-- 2. 在 Supabase SQL Editor 中执行此脚本设置RLS策略

-- =================================================================
-- 📋 第一步：创建存储桶（需要在 Supabase Dashboard 手动操作）
-- =================================================================
-- 
-- 访问: https://nqixahasfhwofusuwsal.supabase.co
-- 路径: Storage → New bucket
-- 设置:
--   - Name: resources
--   - Public bucket: ✅ 勾选（重要！）
--   - File size limit: 50MB 或根据需求调整
--   - Allowed MIME types: 留空（允许所有类型）
--
-- =================================================================
-- 📋 第二步：执行以下SQL脚本设置RLS策略（复制到 Supabase SQL Editor）
-- =================================================================

-- 启用 RLS
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 创建允许认证用户上传文件的策略
CREATE POLICY "Allow authenticated uploads" ON storage.objects 
FOR INSERT WITH CHECK (
  bucket_id = 'resources' AND 
  auth.role() = 'authenticated'
);

-- 创建允许用户查看自己文件的策略
CREATE POLICY "Allow users to read own files" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'resources' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 创建允许用户更新自己文件的策略
CREATE POLICY "Allow users to update own files" ON storage.objects 
FOR UPDATE USING (
  bucket_id = 'resources' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 创建允许用户删除自己文件的策略
CREATE POLICY "Allow users to delete own files" ON storage.objects 
FOR DELETE USING (
  bucket_id = 'resources' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- =================================================================
-- 📋 第三步：验证设置是否成功（执行此查询查看结果）
-- =================================================================

-- 检查存储桶是否存在
SELECT 
    id, 
    name, 
    public, 
    file_size_limit,
    allowed_mime_types
FROM storage.buckets 
WHERE id = 'resources';

-- 检查RLS策略是否创建成功
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'objects' AND policyname LIKE '%resources%';

-- =================================================================
-- 📋 故障排除指南
-- =================================================================

-- 如果遇到 "Bucket not found" 错误：
-- 1. 确认已在 Dashboard 中创建了 "resources" 存储桶
-- 2. 确认存储桶名称拼写正确（注意大小写）
-- 3. 确认已勾选 "Public bucket" 选项

-- 如果遇到权限错误：
-- 1. 确认用户已登录（auth.uid() 不为 null）
-- 2. 检查RLS策略是否正确创建
-- 3. 检查用户ID与文件夹名称是否匹配

-- 如果上传失败：
-- 1. 检查文件大小是否超出限制
-- 2. 检查MIME类型是否被允许（如果设置了限制）
-- 3. 检查用户认证状态

-- =================================================================
-- 📋 测试SQL（可选）
-- =================================================================

-- 测试：插入一条测试记录到resources表（确保表存在）
INSERT INTO public.resources (
    id, 
    user_id, 
    file_name, 
    file_type, 
    file_size, 
    file_url, 
    subject, 
    ai_summary
) VALUES (
    gen_random_uuid(), 
    'test-user-id', 
    '测试文件.pdf', 
    'pdf', 
    1024, 
    'https://example.com/test.pdf', 
    '测试科目', 
    'AI生成的摘要'
) ON CONFLICT DO NOTHING;

-- 查看测试结果
SELECT * FROM public.resources WHERE file_name = '测试文件.pdf';

-- =================================================================
-- 📋 完成后的清理（可选）
-- =================================================================

-- 如果需要删除测试数据：
-- DELETE FROM public.resources WHERE file_name = '测试文件.pdf';

-- 如果需要删除所有策略并重新开始：
-- DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
-- DROP POLICY IF EXISTS "Allow users to read own files" ON storage.objects;
-- DROP POLICY IF EXISTS "Allow users to update own files" ON storage.objects;
-- DROP POLICY IF EXISTS "Allow users to delete own files" ON storage.objects;

-- =================================================================
-- 📋 快速参考
-- =================================================================

-- 1. Dashboard创建存储桶：Storage → New bucket → resources → Public✅
-- 2. 执行上方RLS策略SQL
-- 3. 运行验证查询确认设置成功
-- 4. 测试文件上传功能

-- 完成！现在你的小程序应该能够成功上传文件到 Supabase Storage 了。