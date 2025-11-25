-- 007_simple_avatar_test.sql
-- 简化头像上传测试：临时允许所有上传操作

-- 方案1：临时移除所有限制（仅测试）
DROP POLICY IF EXISTS "Users can upload their own avatar" ON public.storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON public.storage.objects;  
DROP POLICY IF EXISTS "Anyone can view avatars" ON public.storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON public.storage.objects;

-- 方案2：创建简化的公开策略（仅测试）
CREATE POLICY "Allow all for avatars" ON public.storage.objects
  FOR ALL
  USING (bucket_id = 'avatars')
  WITH CHECK (bucket_id = 'avatars');

-- 检查策略创建结果
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

-- 注意：这个方案允许任何人对 avatars 存储桶进行任何操作
-- 仅用于测试！生产环境需要更严格的权限控制