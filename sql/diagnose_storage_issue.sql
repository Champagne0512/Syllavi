-- diagnose_storage_issue.sql
-- 诊断存储访问问题的SQL脚本
-- 当存储桶存在且文件已成功上传，但访问失败时使用

-- =================================================================
-- 📋 第一步：检查存储桶状态和配置
-- =================================================================

-- 检查存储桶是否存在及其配置
SELECT 
    id, 
    name, 
    public, 
    file_size_limit,
    allowed_mime_types,
    created_at
FROM storage.buckets 
WHERE id = 'resources';

-- 检查存储桶的RLS策略
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
WHERE tablename = 'objects' AND (policyname LIKE '%resources%' OR policyname LIKE '%upload%');

-- =================================================================
-- 📋 第二步：检查存储桶中的文件
-- =================================================================

-- 查看存储桶中的文件记录
SELECT 
    id,
    bucket_id,
    name,
    owner,
    created_at,
    updated_at,
    last_accessed_at,
    metadata,
    (storage.foldername(name))[1] as folder_name
FROM storage.objects 
WHERE bucket_id = 'resources'
ORDER BY created_at DESC
LIMIT 20;

-- 检查特定用户的文件
SELECT 
    count(*) as file_count,
    min(created_at) as earliest_file,
    max(created_at) as latest_file
FROM storage.objects 
WHERE bucket_id = 'resources' 
    AND (storage.foldername(name))[1] = 'YOUR_USER_ID_HERE'; -- 替换为实际用户ID

-- =================================================================
-- 📋 第三步：检查public访问设置
-- =================================================================

-- 检查存储桶是否设置为public
SELECT 
    id,
    name,
    public,
    CASE 
        WHEN public THEN '✅ 公开访问已启用'
        ELSE '❌ 存储桶不是公开的，可能需要设置public访问'
    END as public_status
FROM storage.buckets 
WHERE id = 'resources';

-- =================================================================
-- 📋 第四步：测试URL生成
-- =================================================================

-- 模拟生成公网URL的SQL逻辑
SELECT 
    CONCAT(
        'https://nqixahasfhwofusuwsal.supabase.co/storage/v1/object/public/resources/',
        name
    ) as public_url,
    name as file_path
FROM storage.objects 
WHERE bucket_id = 'resources'
LIMIT 5;

-- =================================================================
-- 📋 第五步：修复建议
-- =================================================================

/*
根据检查结果，可能的问题和解决方案：

1. 存储桶不是public的
   解决方案：在Supabase Dashboard中编辑存储桶，确保勾选"Public"选项
   或者执行：UPDATE storage.buckets SET public = true WHERE id = 'resources';

2. RLS策略阻止访问
   解决方案：添加或修改RLS策略，允许public访问或特定的访问模式

3. 文件路径不正确
   解决方案：确保文件路径与实际存储位置一致

4. 权限问题
   解决方案：检查用户权限和认证状态
*/

-- =================================================================
-- 📋 第六步：修复脚本（按需执行）
-- =================================================================

-- 1. 确保存储桶是public的
-- UPDATE storage.buckets SET public = true WHERE id = 'resources';

-- 2. 删除现有RLS策略（如果需要）
/*
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to read own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete own files" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
*/

-- 3. 创建简化的public访问策略（如果需要public访问）
/*
CREATE POLICY "Public Access" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'resources'
);
*/

-- 4. 创建允许认证用户的策略（如果需要认证访问）
/*
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
*/

-- =================================================================
-- 📋 验证修复
-- =================================================================

-- 验证策略是否正确应用
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

-- 再次检查存储桶public状态
SELECT 
    id,
    name,
    public,
    CASE 
        WHEN public THEN '✅ 公开访问已启用'
        ELSE '❌ 存储桶仍然不是公开的'
    END as public_status
FROM storage.buckets 
WHERE id = 'resources';

/*
完成检查后，请确认：
1. 存储桶是否设置为public？
2. 是否有合适的RLS策略？
3. 文件路径是否正确？
4. URL格式是否符合Supabase规范？

如果问题仍然存在，请检查：
- Supabase项目设置中的存储配置
- 小程序中的URL构建逻辑
- 网络请求的headers和权限
*/