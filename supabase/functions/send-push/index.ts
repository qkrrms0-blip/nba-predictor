// supabase/functions/send-push/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;

async function generateVapidJWT(audience: string): Promise<string> {
  const header = { alg: "ES256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: "mailto:admin@nba-oneshot.com",
  };

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const signingInput = `${encode(header)}.${encode(payload)}`;

  const rawKey = Uint8Array.from(
    atob(VAPID_PRIVATE_KEY.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  );

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    rawKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return `${signingInput}.${sig}`;
}

async function sendWebPush(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
}, payload: string): Promise<boolean> {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await generateVapidJWT(audience);

  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      "Content-Type": "application/json",
      "Content-Encoding": "aes128gcm",
      "TTL": "86400",
    },
    body: payload,
  });

  return res.status === 201 || res.status === 200;
}

Deno.serve(async () => {
  const nowUTC = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const nowKST = new Date(nowUTC.getTime() + kstOffset);

  // 취침시간 22시~06시 알림 차단
  const kstHour = nowKST.getUTCHours();
  if (kstHour >= 22 || kstHour < 6) {
    return new Response(JSON.stringify({ message: "취침 시간대 알림 제외" }), { status: 200 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // [변경] 오늘 경기 조회 (내일 → 오늘)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const todayStr = nowKST.toISOString().slice(0, 10);
    const todayStartUTC = new Date(`${todayStr}T00:00:00+09:00`).toISOString();
    const todayEndUTC   = new Date(`${todayStr}T23:59:59+09:00`).toISOString();

    const { data: todayGames } = await supabase
      .from("games")
      .select("id, vote_deadline")
      .is("winner", null)
      .gte("start_time", todayStartUTC)
      .lte("start_time", todayEndUTC)
      .order("vote_deadline", { ascending: true }); // 첫 경기 마감 기준 정렬

    if (!todayGames || todayGames.length === 0) {
      return new Response(JSON.stringify({ message: "오늘 경기 없음" }), { status: 200 });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // [변경] 시각 체크: 20:00 고정 → 첫 경기 vote_deadline - 30분 ±10분
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const firstDeadline  = new Date(todayGames[0].vote_deadline);
    const notifyAt       = new Date(firstDeadline.getTime() - 30 * 60 * 1000);
    const diffMs         = Math.abs(nowUTC.getTime() - notifyAt.getTime());

    if (diffMs > 10 * 60 * 1000) {
      return new Response(JSON.stringify({
        message: "알림 시각 아님",
        notifyAt: notifyAt.toISOString(),
        now: nowUTC.toISOString(),
      }), { status: 200 });
    }

    const todayGameIds = todayGames.map((g: { id: number }) => g.id);
    const gameCount    = todayGameIds.length;

    // 알림 구독자 전체 (no_weekend 포함)
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth, no_weekend");

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "구독자 없음" }), { status: 200 });
    }

    // 오늘 경기에 이미 투표한 목록
    const { data: existingVotes } = await supabase
      .from("votes")
      .select("user_id, game_id")
      .in("game_id", todayGameIds);

    const votedMap: Record<string, Set<number>> = {};
    existingVotes?.forEach((v: { user_id: string; game_id: number }) => {
      if (!votedMap[v.user_id]) votedMap[v.user_id] = new Set();
      votedMap[v.user_id].add(v.game_id);
    });

    // KST 기준 오늘 요일 (0=일, 6=토)
    const kstDay     = nowKST.getUTCDay();
    const isWeekend  = kstDay === 0 || kstDay === 6;

    let sent = 0;
    for (const sub of subscriptions) {
      // 주말 알림 off 설정한 구독자는 주말에 skip
      if (isWeekend && sub.no_weekend) continue;

      const votedSet   = votedMap[sub.user_id] ?? new Set();
      const hasUnvoted = todayGameIds.some((id: number) => !votedSet.has(id));
      if (!hasUnvoted) continue;

      const unvotedCount = todayGameIds.filter((id: number) => !votedSet.has(id)).length;
      const body = unvotedCount === gameCount
        ? `오늘 ${gameCount}경기 투표를 아직 안 했어요!`
        : `오늘 ${gameCount}경기 중 ${unvotedCount}경기 투표가 남았어요!`;

      const notifPayload = JSON.stringify({
        title: "🏀 원샷 NBA",
        body,
        url: "/voting",
      });

      const ok = await sendWebPush(sub, notifPayload);
      if (ok) sent++;
    }

    return new Response(JSON.stringify({
      success: true,
      sent,
      total: subscriptions.length,
      todayGames: gameCount,
    }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});