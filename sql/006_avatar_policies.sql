-- 006_avatar_policies.sql
-- 头像存储桶的 RLS 策略（仅在存储桶已存在时执行）

-- 注意：请在 Supabase Dashboard 中手动创建 avatars 存储桶，然后执行此脚本

-- 1. 设置 RLS 策略 - 允许认证用户上传自己的头像
DROP POLICY IF EXISTS "Users can upload their own avatar" ON public.storage.objects;
CREATE POLICY "Users can upload their own avatar" ON public.storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 2. 设置 RLS 策略 - 允许认证用户更新自己的头像
DROP POLICY IF EXISTS "Users can update their own avatar" ON public.storage.objects;
CREATE POLICY "Users can update their own avatar" ON public.storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 3. 设置 RLS 策略 - 允许所有人读取头像（公开）
DROP POLICY IF EXISTS "Anyone can view avatars" ON public.storage.objects;
CREATE POLICY "Anyone can view avatars" ON public.storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- 4. 设置 RLS 策略 - 允许用户删除自己的头像
DROP POLICY IF EXISTS "Users can delete their own avatar" ON public.storage.objects;
CREATE POLICY "Users can delete their own avatar" ON public.storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 验证策略是否创建成功
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
WHERE tablename = 'objects' AND schemaname = 'storage'
ORDER BY policyname;