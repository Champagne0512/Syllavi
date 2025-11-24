import { getServiceClient, getServiceRoleKey, getSupabaseUrl } from '../_shared/supabaseClient.ts';

const supabase = getServiceClient();
const supabaseUrl = getSupabaseUrl();
const serviceRoleKey = getServiceRoleKey();

interface SignupPayload {
  email?: string;
  password?: string;
}

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
    const message = data?.error_description || data?.error || '登录失败';
    throw new Error(message);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const payload = (await req.json()) as SignupPayload;
    const email = payload?.email?.trim().toLowerCase();
    const password = payload?.password || '';

    if (!email || !EMAIL_REGEX.test(email)) {
      return Response.json({ error: '请输入合法邮箱' }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return Response.json({ error: '密码至少6位' }, { status: 400 });
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (error) {
      if (error.message && /already registered/i.test(error.message)) {
        return Response.json({ error: '该邮箱已注册' }, { status: 409 });
      }
      return Response.json({ error: error.message || '注册失败' }, { status: 400 });
    }

    const user = data?.user;
    if (!user) {
      return Response.json({ error: '创建用户失败' }, { status: 400 });
    }

    await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          nickname: user.user_metadata?.nickname || user.email?.split('@')[0] || 'Syllaby 同学'
        },
        { onConflict: 'id' }
      );

    const tokens = await exchangePasswordForTokens(email, password);

    return Response.json(
      {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          created_at: user.created_at
        }
      },
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      }
    );
  } catch (err) {
    console.error('email-signup error', err);
    return Response.json({ error: err.message || '注册失败' }, { status: 400 });
  }
});
