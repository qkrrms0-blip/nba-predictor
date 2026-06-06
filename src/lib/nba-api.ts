// src/lib/nba-api.ts

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";

// ESPN API 실제 응답 타입
export interface ESPNGame {
  id: string;
  date: string;
  name: string;
  competitions: {
    id: string;
    date: string;
    notes: { type: string; headline: string }[];
    competitors: {
      id: string;
      homeAway: "home" | "away";
      team: {
        displayName: string;
        abbreviation: string;
        logo: string;
      };
      score: string;
      winner?: boolean;
    }[];
    status: {
      type: {
        name: string;
        completed: boolean;
        description: string;
      };
    };
  }[];
  season: { type: number; year: number };
}

// ESPN notes.headline → Round 타입 매핑
function mapESPNHeadlineToRound(headline: string): string {
  const h = headline.toLowerCase();
  if (h.includes("play-in") || h.includes("play in")) return "Play-In";
  if (h.includes("first round") || h.includes("1st round")) return "First Round";
  if (h.includes("semifinal") || h.includes("second round")) return "Semifinals";
  if (h.includes("conf") && h.includes("final")) return "Conf. Finals";
  if (h.includes("nba finals") || h.includes("championship")) return "Finals";
  return "First Round"; // 폴백
}

// YYYYMMDD 형식으로 변환
function toESPNDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

export async function fetchGamesByDateRange(
  startDate: string,
  endDate: string,
): Promise<ESPNGame[]> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const allGames: ESPNGame[] = [];
  const seenIds = new Set<string>();

  // ESPN은 날짜 범위를 한 번에 못 받아서 날짜별로 순회
  // 정규(2) + 포스트(3) 둘 다 요청 - ESPN은 seasontype이 맞지 않으면 빈 배열 반환하므로 중복 없음
  const current = new Date(start);
  while (current <= end) {
    const dateStr = toESPNDate(current.toISOString().split("T")[0]);

    for (const seasonType of [2, 3] as const) {
      const url = `${ESPN_BASE}/scoreboard?dates=${dateStr}&seasontype=${seasonType}&limit=20`;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          if (json.events) {
            for (const event of json.events) {
              if (!seenIds.has(event.id)) {
                seenIds.add(event.id);
                allGames.push(event);
              }
            }
          }
        }
      } catch {
        // 날짜별 실패 무시하고 계속
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return allGames;
}

// seasonType 파라미터 제거 - ESPN 응답의 game.season.type에서 직접 읽음
export function mapESPNGameToDBGame(game: ESPNGame, seasonId: number) {
  const comp = game.competitions[0];
  const home = comp.competitors.find((c) => c.homeAway === "home")!;
  const away = comp.competitors.find((c) => c.homeAway === "away")!;

  const isCompleted = comp.status.type.completed;
  const homeScore = parseInt(home.score) || null;
  const awayScore = parseInt(away.score) || null;

  let winner: "home" | "away" | null = null;
  if (isCompleted && homeScore !== null && awayScore !== null) {
    if (homeScore > awayScore) winner = "home";
    else if (awayScore > homeScore) winner = "away";
  }

  // 라운드 판별: notes[0].headline 사용
  const headline = comp.notes?.[0]?.headline || "";
  const round = mapESPNHeadlineToRound(headline);

  // 투표 마감: 경기 시작 1시간 전
  const startTime = new Date(comp.date);
  const voteDeadline = new Date(startTime.getTime() - 60 * 60 * 1000);

  // season_type: ESPN game.season.type에서 직접 읽음 (2=정규, 3=포스트)
  const seasonType = game.season?.type;
  const season_type = seasonType === 2 ? "regular" : "post";

  // status
  const statusName = comp.status.type.name;
  const status = statusName === "STATUS_POSTPONED" ? "postponed"
    : statusName === "STATUS_CANCELLED" ? "cancelled"
    : "scheduled";

  return {
    season_id: seasonId,
    home_team: home.team.displayName,
    away_team: away.team.displayName,
    home_score: isCompleted ? homeScore : null,
    away_score: isCompleted ? awayScore : null,
    start_time: comp.date,
    vote_deadline: voteDeadline.toISOString(),
    round,
    winner,
    season_type,
    status,
    external_id: `espn_${game.id}`,
  };
}

// ESPN CDN 로고 URL
const TEAM_ESPN_SLUG: Record<string, string> = {
  "Atlanta Hawks": "atl",
  "Boston Celtics": "bos",
  "Brooklyn Nets": "bkn",
  "Charlotte Hornets": "cha",
  "Chicago Bulls": "chi",
  "Cleveland Cavaliers": "cle",
  "Dallas Mavericks": "dal",
  "Denver Nuggets": "den",
  "Detroit Pistons": "det",
  "Golden State Warriors": "gs",
  "Houston Rockets": "hou",
  "Indiana Pacers": "ind",
  "LA Clippers": "lac",
  "Los Angeles Clippers": "lac",
  "Los Angeles Lakers": "lal",
  "Memphis Grizzlies": "mem",
  "Miami Heat": "mia",
  "Milwaukee Bucks": "mil",
  "Minnesota Timberwolves": "min",
  "New Orleans Pelicans": "no",
  "New York Knicks": "ny",
  "Oklahoma City Thunder": "okc",
  "Orlando Magic": "orl",
  "Philadelphia 76ers": "phi",
  "Phoenix Suns": "phx",
  "Portland Trail Blazers": "por",
  "Sacramento Kings": "sac",
  "San Antonio Spurs": "sa",
  "Toronto Raptors": "tor",
  "Utah Jazz": "utah",
  "Washington Wizards": "wsh",
};

export function getTeamLogoUrl(teamName: string): string {
  const slug = TEAM_ESPN_SLUG[teamName];
  if (!slug) {
    const fallback = teamName.split(" ").pop()?.toLowerCase() || "nba";
    return `https://a.espncdn.com/i/teamlogos/nba/500/${fallback}.png`;
  }
  return `https://a.espncdn.com/i/teamlogos/nba/500/${slug}.png`;
}