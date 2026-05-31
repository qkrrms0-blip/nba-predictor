// src/lib/nba-api.ts

const BASE_URL = "https://api.balldontlie.io/v1";
const API_KEY = process.env.BALLDONTLIE_API_KEY!;

const headers = {
  Authorization: API_KEY,
  "Content-Type": "application/json",
};

export interface BDLGame {
  id: number;
  date: string;
  datetime: string | null;
  home_team: { id: number; full_name: string; abbreviation: string };
  visitor_team: { id: number; full_name: string; abbreviation: string };
  home_team_score: number;
  visitor_team_score: number;
  status: string;
  period: number;
  time: string;
  postseason: boolean;
  season: number;
}

export async function fetchGamesByDateRange(startDate: string, endDate: string): Promise<BDLGame[]> {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    per_page: "100",
    postseason: "true",
  });
  const res = await fetch(`${BASE_URL}/games?${params}`, { headers });
  if (!res.ok) throw new Error(`BDL API error: ${res.status}`);
  const json = await res.json();
  return json.data || [];
}

export async function fetchGameById(gameId: number): Promise<BDLGame | null> {
  const res = await fetch(`${BASE_URL}/games/${gameId}`, { headers });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data || null;
}

export function mapBDLGameToDBGame(game: BDLGame, seasonId: number) {
  return {
    season_id: seasonId,
    home_team: game.home_team.full_name,
    away_team: game.visitor_team.full_name,
    home_score: game.home_team_score || null,
    away_score: game.visitor_team_score || null,
    start_time: game.datetime || `${game.date}T00:00:00Z`,
    round: "First Round",
    winner: determineWinner(game),
    external_id: `bdl_${game.id}`,
  };
}

function determineWinner(game: BDLGame): "home" | "away" | null {
  if (game.status !== "Final") return null;
  if (game.home_team_score > game.visitor_team_score) return "home";
  if (game.visitor_team_score > game.home_team_score) return "away";
  return null;
}

// ESPN CDN 실제 약어 맵 (팀 전체명 → ESPN CDN slug)
// ESPN CDN URL 형식: https://a.espncdn.com/i/teamlogos/nba/500/{slug}.png
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
  "Golden State Warriors": "gs",       // 'gsw' 아님 — ESPN은 'gs'
  "Houston Rockets": "hou",
  "Indiana Pacers": "ind",
  "LA Clippers": "lac",
  "Los Angeles Clippers": "lac",
  "Los Angeles Lakers": "lal",
  "Memphis Grizzlies": "mem",
  "Miami Heat": "mia",
  "Milwaukee Bucks": "mil",
  "Minnesota Timberwolves": "min",
  "New Orleans Pelicans": "no",        // 'nop' 아님 — ESPN은 'no'
  "New York Knicks": "ny",             // ESPN은 'ny'
  "Oklahoma City Thunder": "okc",
  "Orlando Magic": "orl",
  "Philadelphia 76ers": "phi",
  "Phoenix Suns": "phx",
  "Portland Trail Blazers": "por",
  "Sacramento Kings": "sac",
  "San Antonio Spurs": "sa",           // ESPN은 'sa'
  "Toronto Raptors": "tor",
  "Utah Jazz": "utah",
  "Washington Wizards": "wsh",         // ESPN은 'wsh'
};

// ESPN CDN 로고 URL
export function getTeamLogoUrl(teamName: string): string {
  const slug = TEAM_ESPN_SLUG[teamName];
  if (!slug) {
    // 폴백: 팀명에서 마지막 단어를 소문자로 변환해 시도
    const fallback = teamName.split(" ").pop()?.toLowerCase() || "nba";
    return `https://a.espncdn.com/i/teamlogos/nba/500/${fallback}.png`;
  }
  return `https://a.espncdn.com/i/teamlogos/nba/500/${slug}.png`;
}
