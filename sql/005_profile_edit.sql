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
  UPDATE public.profiles
  SET
    nickname = COALESCE(NULLIF(p_nickname, ''), nickname),
    school_name = COALESCE(p_school_name, school_name),
    grade = COALESCE(p_grade, grade),
    bio = COALESCE(p_bio, bio),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    updated_at = now()
  WHERE id = auth.uid()
  RETURNING * INTO v_profile;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, nickname, school_name, grade, bio, avatar_url)
    VALUES (
      auth.uid(),
      COALESCE(NULLIF(p_nickname, ''), '同学'),
      p_school_name,
      p_grade,
      COALESCE(NULLIF(p_bio, ''), '让学习成为一种习惯'),
      p_avatar_url
    )
    RETURNING * INTO v_profile;
  END IF;

  RETURN v_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_profile_info(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
