-- fix_public_bucket.sql
-- 修复存储桶公开访问问题的SQL脚本
-- 解决存储桶不是公开的导致文件访问失败的问题

-- =================================================================
-- 📋 方法一：直接通过SQL设置存储桶为公开（推荐）
-- =================================================================

-- 将resources存储桶设置为公开访问
UPDATE storage.buckets SET public = true WHERE id = 'resources';

-- 验证设置是否成功
SELECT 
    id,
    name,
    public,
    CASE 
        WHEN public THEN '✅ 存储桶现在是公开的，文件应该可以正常访问'
        ELSE '❌ 存储桶仍然不是公开的，需要手动设置'
    END as status
FROM storage.buckets 
WHERE id = 'resources';

-- =================================================================
-- 📋 方法二：如果SQL方法不工作，使用Supabase Dashboard手动设置
-- =================================================================

/*
手动设置步骤：
1. 访问: https://nqixahasfhwofusuwsal.supabase.co
2. 点击左侧菜单的 "Storage"
3. 点击 "resources" 存储桶（如果看不到，可能需要先创建）
4. 点击存储桶右上角的三个点图标，选择 "Edit bucket" 或 "Settings"
5. 在设置页面中，找到 "Public bucket" 选项
6. 勾选 "Public bucket" 复选框
7. 保存更改
*/

-- =================================================================
-- 📋 方法三：重建存储桶（如果以上方法都不行）
-- =================================================================

/*
注意：重建存储桶会删除所有文件，请确保已备份重要文件

重建步骤：
1. 删除现有存储桶（在Dashboard中）
2. 重新创建 "resources" 存储桶
3. 确保勾选 "Public bucket" 选项
4. 文件大小限制：50MB 或根据需求调整
5. 允许的MIME类型：留空（允许所有类型）

创建后，重新设置RLS策略：
*/

-- 删除现有RLS策略（如果存在）
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to read own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete own files" ON storage.objects;

-- 启用 RLS
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 创建新的RLS策略
CREATE POLICY "Allow authenticated uploads" ON storage.objects 
FOR INSERT WITH CHECK (
  bucket_id = 'resources' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Allow users to read own files" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'resources' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Allow users to update own files" ON storage.objects 
FOR UPDATE USING (
  bucket_id = 'resources' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Allow users to delete own files" ON storage.objects 
FOR DELETE USING (
  bucket_id = 'resources' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- =================================================================
-- 📋 验证设置是否成功
-- =================================================================

-- 检查存储桶public状态
SELECT 
    id,
    name,
    public,
    file_size_limit,
    created_at,
    updated_at
FROM storage.buckets 
WHERE id = 'resources';

-- 检查RLS策略
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies 
WHERE tablename = 'objects' AND policyname LIKE '%resources%';

-- =================================================================
-- 📋 测试文件访问
-- =================================================================

-- 生成一个测试文件的公开URL（替换YOUR_FILE_PATH为实际文件路径）
SELECT 
    CONCAT(
        'https://nqixahasfhwofusuwsal.supabase.co/storage/v1/object/public/resources/',
        'YOUR_FILE_PATH_HERE'
    ) as test_public_url;

-- =================================================================
-- 📋 如果仍然无法访问，检查以下几点：
-- =================================================================

/*
1. 确认存储桶名称拼写正确
2. 确认文件路径正确
3. 确认小程序中使用的URL格式正确
4. 确认用户有访问权限（如果使用认证访问）
5. 检查网络请求的headers是否包含正确的API密钥

小程序中正确的URL格式应该是：
https://nqixahasfhwofusuwsal.supabase.co/storage/v1/object/public/resources/[文件路径]
*/

-- =================================================================
-- 📋 最终验证SQL
-- =================================================================

-- 完整的存储桶状态检查
SELECT 
    b.id as bucket_id,
    b.name as bucket_name,
    b.public as is_public,
    COUNT(o.id) as file_count,
    MIN(o.created_at) as earliest_file,
    MAX(o.created_at) as latest_file,
    CASE 
        WHEN b.public THEN '✅ 存储桶是公开的，文件应该可以正常访问'
        ELSE '❌ 存储桶不是公开的，文件访问会失败'
    END as access_status
FROM storage.buckets b
LEFT JOIN storage.objects o ON b.id = o.bucket_id
WHERE b.id = 'resources'
GROUP BY b.id, b.name, b.public;