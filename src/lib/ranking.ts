// src/lib/ranking.ts
// 시즌 랭킹 공용 로직: 정규시즌 / 포스트시즌을 따로 집계한다.
// 집계는 DB 함수 get_season_ranking 이 하고(투표가 1000건을 넘어도 안전),
// 여기서는 정렬과 표시용 점수만 정한다.
import type { createClient } from "@/lib/supabase/client";
import type { RankingEntry } from "@/lib/types";

type Supabase = ReturnType<typeof createClient>;

export type SeasonType = "regular" | "post";

// 시즌에서 가장 마지막에 등록된 경기의 유형을 지금 단계로 본다.
// 경기가 없으면 정규시즌, 포스트시즌이 끝난 시즌은 마지막 경기가 post라서 post가 기본이 된다.
export async function detectSeasonType(
  supabase: Supabase,
  seasonId: number
): Promise<SeasonType> {
  const { data } = await supabase
    .from("games")
    .select("season_type")
    .eq("season_id", seasonId)
    .order("start_time", { ascending: false })
    .limit(1);
  return data?.[0]?.season_type === "post" ? "post" : "regular";
}

export async function fetchSeasonRanking(
  supabase: Supabase,
  seasonId: number,
  seasonType: SeasonType
): Promise<RankingEntry[]> {
  const { data, error } = await supabase.rpc("get_season_ranking", {
    p_season_id: seasonId,
    p_season_type: seasonType,
  });
  if (error || !data) return [];

  const entries: RankingEntry[] = (data as any[]).map((r) => {
    const correct = Number(r.correct_votes) || 0;
    const total = Number(r.total_votes) || 0;
    return {
      id: r.user_id,
      name: r.name,
      email: "",
      season_id: seasonId,
      season_name: "",
      total_votes: total,
      correct_votes: correct,
      // 정규시즌은 점수 대신 맞춘 수로 순위를 매긴다 (정답 1개 = 1)
      total_points:
        seasonType === "regular"
          ? correct
          : Math.round((Number(r.total_points) || 0) * 10) / 10,
      accuracy_pct: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0,
    };
  });

  return entries.sort((a, b) => {
    if (seasonType === "regular") {
      // 정규: 맞춘 수 → 투표 수 → 적중률
      return (
        b.correct_votes - a.correct_votes ||
        b.total_votes - a.total_votes ||
        b.accuracy_pct - a.accuracy_pct
      );
    }
    // 포스트: 점수 → 적중률
    return b.total_points - a.total_points || b.accuracy_pct - a.accuracy_pct;
  });
}
