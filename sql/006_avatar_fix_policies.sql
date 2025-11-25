-- 006_avatar_fix_policies.sql
-- 修正版本：为头像存储桶创建正确的 RLS 策略

-- 注意：请在 Supabase Dashboard 中手动配置存储桶策略
-- 直接通过 SQL 创建存储策略在 Supabase 中可能受限

-- 步骤 1: 确保已启用 RLS
ALTER TABLE IF EXISTS storage.objects ENABLE ROW LEVEL SECURITY;

-- 步骤 2: 创建策略的替代方法（如果上述方法不行）
-- 这里提供策略创建的参考，但可能需要在 Dashboard 中手动配置

/*
手动配置步骤：
1. 进入 Supabase Dashboard
2. 找到 Storage → Policies
3. 点击 "New Policy"
4. 为 avatars 存储桶创建以下策略：

策略1: "Users can upload their own avatar"
- FOR INSERT
- Target: storage.objects
- Policy Definition: bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]

策略2: "Users can update their own avatar" 
- FOR UPDATE
- Target: storage.objects
- Policy Definition: bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]

策略3: "Anyone can view avatars"
- FOR SELECT  
- Target: storage.objects
- Policy Definition: bucket_id = 'avatars'

策略4: "Users can delete their own avatar"
- FOR DELETE
- Target: storage.objects
- Policy Definition: bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
*/

-- 检查现有策略（用于调试）
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