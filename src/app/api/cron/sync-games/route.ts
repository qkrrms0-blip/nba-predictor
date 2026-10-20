// src/app/api/cron/sync-games/route.ts
//
// 매일 pg_cron 이 호출해서 오늘~+3일(KST) ESPN 경기를 DB에 등록/갱신한다.
// ESPN 이 Supabase Edge Function 의 요청을 403 으로 막아서, ESPN 호출을 Vercel 서버에서 한다.
// 로그인 대신 CRON_SECRET 으로 호출자를 확인한다 (middleware 에서 /api/cron/ 은 로그인 예외).
import { createAdminClient } from "@/lib/supabase/server";
import { fetchGamesByDateRange, mapESPNGameToDBGame } from "@/lib/nba-api";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET 미설정" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: activeSeason } = await supabase
    .from("seasons")
    .select("id, name")
    .eq("is_active", true)
    .single();
  if (!activeSeason) {
    return NextResponse.json({ message: "활성 시즌 없음" });
  }

  // 오늘~+3일 (KST 기준)
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const startDate = nowKST.toISOString().slice(0, 10);
  const endDate = new Date(nowKST.getTime() + 3 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  try {
    const games = await fetchGamesByDateRange(startDate, endDate);
    if (games.length === 0) {
      return NextResponse.json({ message: "ESPN 경기 없음", startDate, endDate });
    }

    const externalIds = games.map((g) => `espn_${g.id}`);
    const { data: existing } = await supabase
      .from("games")
      .select("external_id, winner, status, start_time")
      .in("external_id", externalIds);

    const existingMap = new Map(
      (existing || []).map(
        (g: { external_id: string; winner: string | null; status: string; start_time: string }) => [
          g.external_id,
          { winner: g.winner, status: g.status, start_time: g.start_time },
        ]
      )
    );

    const normalizeTime = (t: string | null) => (t ? new Date(t).toISOString() : null);

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    const errors: { game: string; message: string }[] = [];

    for (const game of games) {
      const dbGame = mapESPNGameToDBGame(game, activeSeason.id);
      const prev = existingMap.get(dbGame.external_id);

      if (prev) {
        const changed =
          prev.winner !== dbGame.winner ||
          prev.status !== dbGame.status ||
          normalizeTime(prev.start_time) !== normalizeTime(dbGame.start_time);
        if (!changed) {
          unchanged++;
          continue;
        }
      }

      const { error } = await supabase
        .from("games")
        .upsert(dbGame, { onConflict: "external_id" });
      if (error) errors.push({ game: dbGame.external_id, message: error.message });
      else if (prev) updated++;
      else inserted++;
    }

    await supabase
      .from("seasons")
      .update({ last_espn_sync: startDate })
      .eq("id", activeSeason.id);

    return NextResponse.json({
      success: true,
      inserted,
      updated,
      unchanged,
      total: games.length,
      startDate,
      endDate,
      errors,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return run(request);
}

export async function GET(request: Request) {
  return run(request);
}
