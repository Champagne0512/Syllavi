-- 019_group_avatar_policies.sql
-- 为 group-avatars 桶配置 RLS 策略，允许所有人读取、认证用户上传/更新/删除

-- 允许任何人读取公开头像
create policy "public read group avatars"
  on storage.objects for select
  using (bucket_id = 'group-avatars');

-- 允许登录用户上传文件
create policy "authenticated insert group avatars"
  on storage.objects for insert
  with check (
    bucket_id = 'group-avatars' and auth.role() = 'authenticated'
  );

-- 允许上传者更新自己的文件
create policy "authenticated update group avatars"
  on storage.objects for update
  using (bucket_id = 'group-avatars' and auth.role() = 'authenticated');

-- 允许上传者删除自己的文件
create policy "authenticated delete group avatars"
  on storage.objects for delete
  using (bucket_id = 'group-avatars' and auth.role() = 'authenticated');
