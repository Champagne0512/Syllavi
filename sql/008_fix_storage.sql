-- 008_fix_storage.sql
-- 简化存储权限配置，直接使用SQL设置

-- 1. 启用RLS（如果还没启用）
ALTER TABLE IF EXISTS storage.objects ENABLE ROW LEVEL SECURITY;

-- 2. 删除所有现有头像相关策略
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;  
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Allow all for avatars" ON storage.objects;

-- 3. 创建最简单的策略 - 允许认证用户操作
CREATE POLICY "Avatars policy" ON storage.objects
  FOR ALL
  USING (bucket_id = 'avatars' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

-- 4. 检查策略创建结果
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
WHERE tablename = 'objects' 
  AND schemaname = 'storage'
ORDER BY policyname;