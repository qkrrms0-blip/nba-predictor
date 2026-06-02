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

  // base64url → ArrayBuffer
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
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // KST 기준 오늘 날짜 범위
    const nowUTC = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const nowKST = new Date(nowUTC.getTime() + kstOffset);
    const todayKST = nowKST.toISOString().slice(0, 10); // "2025-06-01"

    const dayStartUTC = new Date(`${todayKST}T00:00:00+09:00`).toISOString();
    const dayEndUTC = new Date(`${todayKST}T23:59:59+09:00`).toISOString();

    // 오늘 경기 중 winner가 없는 것만 (투표 가능한 경기)
    const { data: todayGames } = await supabase
      .from("games")
      .select("id, home_team, away_team, start_time, vote_deadline")
      .is("winner", null)
      .gte("start_time", dayStartUTC)
      .lte("start_time", dayEndUTC)
      .order("vote_deadline", { ascending: true });

    if (!todayGames || todayGames.length === 0) {
      return new Response(JSON.stringify({ message: "오늘 경기 없음" }), { status: 200 });
    }

    const gameCount = todayGames.length;

    // 당일 첫 번째 마감 경기의 vote_deadline - 1시간
    const firstDeadline = new Date(todayGames[0].vote_deadline);
    const notifyAt = new Date(firstDeadline.getTime() - 60 * 60 * 1000);
    const nowTime = new Date();

    // 현재 시각이 알림 시각 ±10분 범위인지 확인
    const diff = Math.abs(nowTime.getTime() - notifyAt.getTime());
    if (diff > 10 * 60 * 1000) {
      return new Response(JSON.stringify({
        message: "아직 알림 시각 아님",
        notifyAt: notifyAt.toISOString(),
        now: nowTime.toISOString(),
      }), { status: 200 });
    }

    // 모든 구독 정보 가져오기
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth");

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "구독자 없음" }), { status: 200 });
    }

    const notifPayload = JSON.stringify({
      title: "🏀 원샷 NBA",
      body: `오늘 ${gameCount}경기 투표 마감 전! 지금 투표하세요`,
      url: "/voting",
    });

    let sent = 0;
    for (const sub of subscriptions) {
      const ok = await sendWebPush(sub, notifPayload);
      if (ok) sent++;
    }

    return new Response(JSON.stringify({ success: true, sent, total: subscriptions.length }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
