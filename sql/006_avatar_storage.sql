-- 006_avatar_storage.sql
-- 配置头像存储桶和相关权限

-- 1. 创建头像存储桶
INSERT INTO public.storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true, -- 公开访问
  2097152, -- 2MB 限制
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. 设置 RLS 策略 - 允许认证用户上传自己的头像
CREATE POLICY "Users can upload their own avatar" ON public.storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 3. 设置 RLS 策略 - 允许认证用户更新自己的头像
CREATE POLICY "Users can update their own avatar" ON public.storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 4. 设置 RLS 策略 - 允许所有人读取头像（公开）
CREATE POLICY "Anyone can view avatars" ON public.storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- 5. 设置 RLS 策略 - 允许用户删除自己的头像
CREATE POLICY "Users can delete their own avatar" ON public.storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 说明：
-- 1. 存储桶名称：avatars
-- 2. 文件大小限制：2MB
-- 3. 支持的格式：JPEG, PNG, WebP
-- 4. 文件路径格式：{userId}/{timestamp}_avatar.{ext}
-- 5. 存储桶是公开的，头像可以通过 URL 直接访问
--
-- 使用方法：
-- 1. 在 Supabase 控制台的 SQL Editor 中执行此脚本
-- 2. 确保已经启用了 storage 扩展
-- 3. 上传的头像会自动获得公开访问权限
--
-- 示例 URL 格式：
-- https://your-project.supabase.co/storage/v1/object/public/avatars/user_id/1234567890_avatar.jpg