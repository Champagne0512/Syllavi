import { getServiceClient } from '../_shared/supabaseClient.ts';

let supabase;
try {
  supabase = getServiceClient();
  console.log('focus-stats: Supabase客户端初始化成功');
} catch (error) {
  console.error('focus-stats: Supabase客户端初始化失败:', error);
  throw error;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type HeatmapRow = {
  date: string;
  focus_minutes: number | null;
  level: number | null;
};

type SessionAggregateRow = {
  total_minutes: number | null;
  session_count: number | null;
  longest_session: number | null;
  avg_session_length: number | null;
};

interface FocusStatsPayload {
  user_id?: string;
  p_user_id?: string;
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers || {});
  corsHeaders['Access-Control-Allow-Origin'] && headers.set('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
  headers.set('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
  headers.set('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}

function normalizeNumber(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function ensureUuid(value: string) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

async function fetchSessionAggregates(userId: string) {
  const { data, error } = await supabase
    .from('focus_sessions')
    .select(
      `total_minutes:sum(duration),
       session_count:count(duration),
       longest_session:max(duration),
       avg_session_length:avg(duration)`
    )
    .eq('user_id', userId)
    .eq('completed', true)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  const row = (data as SessionAggregateRow) || {};
  return {
    total_minutes: Math.max(0, Math.round(normalizeNumber(row.total_minutes))),
    session_count: Math.max(0, Math.round(normalizeNumber(row.session_count))),
    longest_session: Math.max(0, Math.round(normalizeNumber(row.longest_session))),
    avg_session_length: normalizeNumber(row.avg_session_length)
  };
}

async function fetchHeatmapRows(userId: string) {
  const { data, error } = await supabase
    .from('learning_heatmap')
    .select('date, focus_minutes, level')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(400);

  if (error) {
    throw error;
  }

  return (data as HeatmapRow[]) || [];
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function computeHeatmapStats(rows: HeatmapRow[]) {
  if (!Array.isArray(rows)) {
    return { today: 0, week: 0, streak: 0 };
  }

  const today = new Date();
  const todayKey = toDateKey(today);
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);

  const perDayMinutes = new Map<string, number>();
  rows.forEach((row) => {
    if (!row?.date) return;
    const key = row.date;
    const current = perDayMinutes.get(key) || 0;
    perDayMinutes.set(key, current + normalizeNumber(row.focus_minutes));
  });

  let todayMinutes = perDayMinutes.get(todayKey) || 0;
  let weekMinutes = 0;

  const cursor = new Date(weekStart);
  for (let i = 0; i < 7; i++) {
    const key = toDateKey(cursor);
    weekMinutes += perDayMinutes.get(key) || 0;
    cursor.setDate(cursor.getDate() + 1);
  }

  let streak = 0;
  const streakCursor = new Date();
  for (let i = 0; i < 400; i++) {
    const key = toDateKey(streakCursor);
    if ((perDayMinutes.get(key) || 0) > 0) {
      streak += 1;
      streakCursor.setDate(streakCursor.getDate() - 1);
    } else {
      break;
    }
  }

  return {
    today: todayMinutes,
    week: weekMinutes,
    streak
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, { status: 405 });
  }

  try {
    const payload = (await req.json()) as FocusStatsPayload;
    const rawUserId = (payload?.user_id || payload?.p_user_id || '').trim();
    if (!rawUserId) {
      return jsonResponse({ error: 'user_id is required' }, { status: 400 });
    }
    if (!ensureUuid(rawUserId)) {
      return jsonResponse({ error: 'invalid user_id' }, { status: 400 });
    }

    const [sessionStats, heatmapRows] = await Promise.all([
      fetchSessionAggregates(rawUserId),
      fetchHeatmapRows(rawUserId)
    ]);

    const heatmapStats = computeHeatmapStats(heatmapRows);

    const response = {
      total_minutes: sessionStats.total_minutes,
      session_count: sessionStats.session_count,
      total_sessions: sessionStats.session_count,
      today_minutes: heatmapStats.today,
      week_minutes: heatmapStats.week,
      streak_days: heatmapStats.streak,
      continuous_days: heatmapStats.streak,
      longest_session: sessionStats.longest_session,
      avg_session_length: sessionStats.avg_session_length,
      night_owl_sessions: 0,
      early_bird_sessions: 0,
      deep_diver_sessions: 0
    };

    return jsonResponse(response, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    console.error('focus-stats error', error);
    return jsonResponse(
      {
        error: 'Failed to load focus stats'
      },
      { status: 500 }
    );
  }
});
