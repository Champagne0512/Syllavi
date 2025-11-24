import { getServiceClient, getServiceRoleKey, getSupabaseUrl } from '../_shared/supabaseClient.ts';

const supabase = getServiceClient();
const supabaseUrl = getSupabaseUrl();
const serviceRoleKey = getServiceRoleKey();

const WECHAT_APP_ID = Deno.env.get('WECHAT_APP_ID');
const WECHAT_APP_SECRET = Deno.env.get('WECHAT_APP_SECRET');
const PLACEHOLDER_DOMAIN = (Deno.env.get('WECHAT_PLACEHOLDER_EMAIL_DOMAIN') || 'wechat.placeholder').replace(/^@+/, '');

if (!WECHAT_APP_ID || !WECHAT_APP_SECRET) {
  console.warn('WECHAT_APP_ID/WECHAT_APP_SECRET is not configured. WeChat login will fail.');
}

interface WechatResponse {
  openid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
  unionid?: string;
}

interface LoginPayload {
  code?: string;
}

function buildPlaceholderEmail(openid: string) {
  return `${openid}@${PLACEHOLDER_DOMAIN}`;
}

async function fetchWechatOpenId(code: string): Promise<WechatResponse> {
  if (!WECHAT_APP_ID || !WECHAT_APP_SECRET) {
    throw new Error('WECHAT_APP_ID 或 WECHAT_APP_SECRET 未配置');
  }
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', WECHAT_APP_ID);
  url.searchParams.set('secret', WECHAT_APP_SECRET);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  const resp = await fetch(url);
  const data = (await resp.json()) as WechatResponse;
  if (!resp.ok || data.errcode) {
    const message = data.errmsg || '无法从微信获取openid';
    throw new Error(message);
  }
  if (!data.openid) {
    throw new Error('微信未返回 openid');
  }
  return data;
}

async function findProfile(openid: string) {
  const { data } = await supabase
    .from('profiles')
    .select('id,nickname,wechat_openid,created_at')
    .eq('wechat_openid', openid)
    .maybeSingle();
  return data ?? null;
}

async function insertProfile(userId: string, openid: string, nickname?: string) {
  const displayName = nickname || `同学${openid.slice(-4)}`;
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      wechat_openid: openid,
      nickname: displayName
    })
    .select('id,nickname,wechat_openid,created_at')
    .single();
  if (error) throw error;
  return data;
}

async function ensureAuthUser(userId: string | null, email: string, password: string, nickname?: string) {
  if (userId) {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error && error?.message && error.message.includes('User not found')) {
      // fallback to create
      const created = await createAuthUser(email, password, nickname, userId);
      return created;
    }
    if (error) throw error;

    const { error: updateError, data: updated } = await supabase.auth.admin.updateUserById(userId, {
      password
    });
    if (updateError) throw updateError;
    return updated?.user ?? data.user;
  }
  return await createAuthUser(email, password, nickname);
}

async function createAuthUser(email: string, password: string, nickname?: string, fixedId?: string) {
  const { data, error } = await supabase.auth.admin.createUser({
    id: fixedId,
    email,
    email_confirm: true,
    password,
    user_metadata: {
      nickname: nickname || 'Syllaby 同学',
      provider: 'wechat'
    }
  });
  if (error || !data?.user) {
    throw error || new Error('无法创建 Supabase 用户');
  }
  return data.user;
}

async function exchangePasswordForTokens(email: string, password: string) {
  const resp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error_description || data?.error || '获取token失败');
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const payload = (await req.json()) as LoginPayload;
    const code = payload?.code?.trim();
    if (!code) {
      return Response.json({ error: '缺少 code' }, { status: 400 });
    }

    const wxData = await fetchWechatOpenId(code);
    const openid = wxData.openid as string;
    const email = buildPlaceholderEmail(openid);
    const password = crypto.randomUUID().replace(/-/g, '');

    const existingProfile = await findProfile(openid);
    const authUser = await ensureAuthUser(existingProfile?.id || null, email, password, existingProfile?.nickname);
    const profile =
      existingProfile ||
      (await insertProfile(authUser.id, openid, authUser.user_metadata?.nickname as string | undefined));
    const tokens = await exchangePasswordForTokens(authUser.email || email, password);

    return Response.json(
      {
        ...tokens,
        user: {
          id: authUser.id,
          wechat_openid: openid,
          nickname: profile.nickname || authUser.user_metadata?.nickname || 'Syllaby 用户',
          created_at: authUser.created_at
        }
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (err) {
    console.error('wechat-login error', err);
    return Response.json({ error: err.message || '登录失败' }, { status: 400 });
  }
});
