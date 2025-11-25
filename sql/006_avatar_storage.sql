-- 006_avatar_storage.sql
-- 配置头像存储桶（avatars）及其 RLS 策略。所有 storage 相关对象都位于 storage schema。

-- 1) 创建公开的 avatars 桶（若已存在则跳过）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2) 确保 storage.objects 已启用 RLS
ALTER TABLE IF EXISTS storage.objects ENABLE ROW LEVEL SECURITY;

-- 3) 清理旧策略，保持脚本幂等
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;

-- 4) 重新创建策略
CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatar" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Anyone can view avatars" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- 5) 验证：
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';
