// supabase/functions/send-push/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;

// VAPID JWT 생성
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
  // KST 현재 시각
  const nowUTC = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const nowKST = new Date(nowUTC.getTime() + kstOffset);
  const kstHour = nowKST.getUTCHours();
  const kstMinute = nowKST.getUTCMinutes();

  // KST 20:00 ±10분 범위가 아니면 종료
  // (이 함수는 cron으로 주기적으로 호출되므로 시각 체크로 실제 발송 시점 제어)
  const minutesFromTarget = (kstHour * 60 + kstMinute) - 20 * 60;
  if (Math.abs(minutesFromTarget) > 10) {
    return new Response(JSON.stringify({
      message: "알림 시각 아님",
      kstTime: `${String(kstHour).padStart(2, "0")}:${String(kstMinute).padStart(2, "0")}`,
    }), { status: 200 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // KST 기준 "내일" 날짜 범위 계산
    const tomorrowKST = new Date(nowKST.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrowKST.toISOString().slice(0, 10); // "YYYY-MM-DD"

    const tomorrowStartUTC = new Date(`${tomorrowStr}T00:00:00+09:00`).toISOString();
    const tomorrowEndUTC = new Date(`${tomorrowStr}T23:59:59+09:00`).toISOString();

    // 내일 경기 중 아직 결과 미확정(winner = null)인 것만
    const { data: tomorrowGames } = await supabase
      .from("games")
      .select("id")
      .is("winner", null)
      .gte("start_time", tomorrowStartUTC)
      .lte("start_time", tomorrowEndUTC);

    if (!tomorrowGames || tomorrowGames.length === 0) {
      return new Response(JSON.stringify({ message: "내일 경기 없음" }), { status: 200 });
    }

    const tomorrowGameIds = tomorrowGames.map((g: { id: number }) => g.id);
    const gameCount = tomorrowGameIds.length;

    // 알림 구독자 전체 (user_id 포함)
    // push_subscriptions 테이블에 user_id 컬럼 필요
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth");

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "구독자 없음" }), { status: 200 });
    }

    // 내일 경기에 이미 투표한 (user_id, game_id) 목록
    const { data: existingVotes } = await supabase
      .from("votes")
      .select("user_id, game_id")
      .in("game_id", tomorrowGameIds);

    // 유저별 투표한 game_id set
    const votedMap: Record<string, Set<number>> = {};
    existingVotes?.forEach((v: { user_id: string; game_id: number }) => {
      if (!votedMap[v.user_id]) votedMap[v.user_id] = new Set();
      votedMap[v.user_id].add(v.game_id);
    });

    let sent = 0;
    for (const sub of subscriptions) {
      const votedSet = votedMap[sub.user_id] ?? new Set();
      // 내일 경기 중 하나라도 투표 안 했으면 알림 발송
      const hasUnvoted = tomorrowGameIds.some((id: number) => !votedSet.has(id));
      if (!hasUnvoted) continue;

      const unvotedCount = tomorrowGameIds.filter((id: number) => !votedSet.has(id)).length;
      const body = unvotedCount === gameCount
        ? `내일 ${gameCount}경기 투표를 아직 안 했어요!`
        : `내일 ${gameCount}경기 중 ${unvotedCount}경기 투표가 남았어요!`;

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
      tomorrowGames: gameCount,
    }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});