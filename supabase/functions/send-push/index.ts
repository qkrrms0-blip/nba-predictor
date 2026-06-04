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

async function encryptPayload(
  p256dhBase64: string,
  authBase64: string,
  plaintext: string
): Promise<Uint8Array> {
  const decoder = (b64: string) =>
    Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

  const receiverPublicKey = decoder(p256dhBase64);
  const authSecret = decoder(authBase64);

  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );

  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey)
  );

  const receiverKey = await crypto.subtle.importKey(
    "raw",
    receiverPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: receiverKey },
    serverKeyPair.privateKey,
    256
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveBits"]);

  const prkKeyInfo = new Uint8Array([
    ...new TextEncoder().encode("WebPush: info\0"),
    ...receiverPublicKey,
    ...serverPublicKeyRaw,
  ]);
  const prkKey = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: authSecret, info: prkKeyInfo },
    hkdfKey,
    256
  );

  const prkKeyImported = await crypto.subtle.importKey("raw", prkKey, "HKDF", false, ["deriveBits"]);

  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const cekBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: cekInfo },
    prkKeyImported,
    128
  );

  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
  const nonceBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: nonceInfo },
    prkKeyImported,
    96
  );

  const cekKey = await crypto.subtle.importKey("raw", cekBits, "AES-GCM", false, ["encrypt"]);

  const plaintextBytes = new TextEncoder().encode(plaintext);
  // 패딩: 레코드 끝 구분자 0x02 추가
  const paddedPlaintext = new Uint8Array(plaintextBytes.length + 1);
  paddedPlaintext.set(plaintextBytes, 0);
  paddedPlaintext[plaintextBytes.length] = 2;

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonceBits },
      cekKey,
      paddedPlaintext
    )
  );

  // aes128gcm 헤더: salt(16) + rs(4, big-endian) + keyid_len(1) + keyid(65)
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + serverPublicKeyRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = serverPublicKeyRaw.length;
  header.set(serverPublicKeyRaw, 21);

  const result = new Uint8Array(header.length + ciphertext.length);
  result.set(header, 0);
  result.set(ciphertext, header.length);
  return result;
}

async function sendWebPush(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
}, payload: string): Promise<boolean> {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await generateVapidJWT(audience);

  const body = await encryptPayload(subscription.p256dh, subscription.auth, payload);

  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "TTL": "86400",
    },
    body,
  });

  const resText = await res.text();
  console.log(`[push] endpoint: ${url.host} | status: ${res.status} | body: ${resText}`);
  return res.status === 201 || res.status === 200;
}

Deno.serve(async () => {
  const nowUTC = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const nowKST = new Date(nowUTC.getTime() + kstOffset);

  // [테스트] 취침시간 차단 비활성화
  const kstHour = nowKST.getUTCHours();
   if (kstHour >= 22 || kstHour < 6) {
    return new Response(JSON.stringify({ message: "취침 시간대 알림 제외" }), { status: 200 });
   }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const todayStr = nowKST.toISOString().slice(0, 10);
    const todayStartUTC = new Date(`${todayStr}T00:00:00+09:00`).toISOString();
    const todayEndUTC   = new Date(`${todayStr}T23:59:59+09:00`).toISOString();

    const { data: todayGames } = await supabase
      .from("games")
      .select("id, vote_deadline")
      .is("winner", null)
      .gte("start_time", todayStartUTC)
      .lte("start_time", todayEndUTC)
      .order("vote_deadline", { ascending: true });

    if (!todayGames || todayGames.length === 0) {
      return new Response(JSON.stringify({ message: "오늘 경기 없음" }), { status: 200 });
    }

    // [테스트] 시각 체크 비활성화
     const firstDeadline = new Date(todayGames[0].vote_deadline);
     const notifyAt = new Date(firstDeadline.getTime() - 30 * 60 * 1000);
     const diffMs = Math.abs(nowUTC.getTime() - notifyAt.getTime());
     if (diffMs > 10 * 60 * 1000) {
       return new Response(JSON.stringify({ message: "알림 시각 아님" }), { status: 200 });
     }

    const todayGameIds = todayGames.map((g: { id: number }) => g.id);
    const gameCount    = todayGameIds.length;

    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth, no_weekend");

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "구독자 없음" }), { status: 200 });
    }

    const { data: existingVotes } = await supabase
      .from("votes")
      .select("user_id, game_id")
      .in("game_id", todayGameIds);

    const votedMap: Record<string, Set<number>> = {};
    existingVotes?.forEach((v: { user_id: string; game_id: number }) => {
      if (!votedMap[v.user_id]) votedMap[v.user_id] = new Set();
      votedMap[v.user_id].add(v.game_id);
    });

    const kstDay    = nowKST.getUTCDay();
    const isWeekend = kstDay === 0 || kstDay === 6;

    let sent = 0;
    for (const sub of subscriptions) {
      if (isWeekend && sub.no_weekend) continue;

      const votedSet   = votedMap[sub.user_id] ?? new Set();
      const hasUnvoted = todayGameIds.some((id: number) => !votedSet.has(id));
      if (!hasUnvoted) continue;

      const unvotedCount = todayGameIds.filter((id: number) => !votedSet.has(id)).length;
      const msgBody = unvotedCount === gameCount
        ? `오늘 ${gameCount}경기 투표를 아직 안 했어요!`
        : `오늘 ${gameCount}경기 중 ${unvotedCount}경기 투표가 남았어요!`;

      const notifPayload = JSON.stringify({
        title: "🏀 원샷 NBA",
        body: msgBody,
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