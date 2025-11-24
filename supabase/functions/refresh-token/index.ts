import { getServiceRoleKey, getSupabaseUrl } from '../_shared/supabaseClient.ts';

const supabaseUrl = getSupabaseUrl();
const serviceRoleKey = getServiceRoleKey();

interface RefreshPayload {
  refresh_token?: string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const payload = (await req.json()) as RefreshPayload;
    const refreshToken = payload?.refresh_token;
    if (!refreshToken) {
      return Response.json({ error: '缺少 refresh_token' }, { status: 400 });
    }

    const resp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  } catch (err) {
    console.error('refresh-token error', err);
    return Response.json({ error: err.message || '刷新失败' }, { status: 400 });
  }
});
