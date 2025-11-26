-- 005_profile_edit.sql
-- 提供更新个人资料的 RPC，确保登录用户可在开启 RLS 的 profiles 表上安全写入。

CREATE OR REPLACE FUNCTION public.update_profile_info(
  p_nickname TEXT,
  p_school_name TEXT,
  p_grade TEXT,
  p_bio TEXT,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
BEGIN
  -- 检查用户是否已登录
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '用户未登录';
  END IF;

  -- 更新现有记录
  UPDATE public.profiles
  SET
    nickname = COALESCE(NULLIF(p_nickname, ''), nickname),
    school_name = COALESCE(NULLIF(p_school_name, ''), school_name),
    grade = CASE 
      WHEN NULLIF(p_grade, '') IS NOT NULL THEN p_grade
      ELSE grade
    END,
    bio = COALESCE(NULLIF(p_bio, ''), bio),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    updated_at = now()
  WHERE id = auth.uid()
  RETURNING * INTO v_profile;

  -- 如果记录不存在，创建新记录
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, nickname, school_name, grade, bio, avatar_url)
    VALUES (
      auth.uid(),
      COALESCE(NULLIF(p_nickname, ''), '同学'),
      NULLIF(p_school_name, ''),
      CASE 
        WHEN NULLIF(p_grade, '') IS NOT NULL THEN p_grade
        ELSE NULL
      END,
      COALESCE(NULLIF(p_bio, ''), '让学习成为一种习惯'),
      p_avatar_url
    )
    RETURNING * INTO v_profile;
  END IF;

  RETURN v_profile;
END;
$$;

-- 授予执行权限
GRANT EXECUTE ON FUNCTION public.update_profile_info(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;