-- =============================================
-- NBA 승부예측 앱 - Supabase 초기 설정 SQL
-- Supabase Dashboard > SQL Editor 에서 실행
-- =============================================

-- 1. users 테이블 (Supabase auth.users와 연동)
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  approved BOOLEAN DEFAULT FALSE,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. seasons 테이블
CREATE TABLE public.seasons (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,          -- 예: "2024-25 Season"
  is_active BOOLEAN DEFAULT TRUE,
  started_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기본 시즌 삽입
INSERT INTO public.seasons (name, is_active) VALUES ('2024-25 Season', TRUE);

-- 3. games 테이블
CREATE TABLE public.games (
  id SERIAL PRIMARY KEY,
  season_id INTEGER REFERENCES public.seasons(id) DEFAULT 1,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  start_time TIMESTAMPTZ NOT NULL,
  round TEXT NOT NULL CHECK (round IN ('Play-In', 'First Round', 'Semifinals', 'Conf. Finals', 'Finals')),
  winner TEXT,                 -- 'home' | 'away' | NULL(미완료)
  external_id TEXT UNIQUE,     -- API에서 가져온 경기 ID
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. votes 테이블
CREATE TABLE public.votes (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  game_id INTEGER REFERENCES public.games(id) ON DELETE CASCADE,
  voted_team TEXT NOT NULL CHECK (voted_team IN ('home', 'away')),
  season_id INTEGER REFERENCES public.seasons(id),
  is_correct BOOLEAN,          -- 경기 종료 후 채점
  points DECIMAL(3,1),         -- 라운드별 승점
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, game_id)     -- 한 경기당 1표
);

-- =============================================
-- RLS (Row Level Security) 설정
-- =============================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- users 정책
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON public.users
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- games 정책 (모든 인증 유저 읽기 가능)
CREATE POLICY "Authenticated users can view games" ON public.games
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage games" ON public.games
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- votes 정책
CREATE POLICY "Users can view own votes" ON public.votes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own votes" ON public.votes
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND approved = TRUE)
  );

CREATE POLICY "Admins can view all votes" ON public.votes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- 경기 시작 후 투표 현황 공개 정책 (시작 후엔 모든 유저가 볼 수 있음)
CREATE POLICY "Votes visible after game starts" ON public.votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = game_id AND g.start_time <= NOW()
    )
  );

-- seasons 정책
CREATE POLICY "Anyone can view seasons" ON public.seasons
  FOR SELECT USING (TRUE);

CREATE POLICY "Admins can manage seasons" ON public.seasons
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- =============================================
-- 트리거: 신규 가입 시 users 테이블 자동 생성
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- 함수: 투표 채점 (경기 결과 입력 시 호출)
-- =============================================

CREATE OR REPLACE FUNCTION public.grade_votes(p_game_id INTEGER, p_winner TEXT)
RETURNS VOID AS $$
DECLARE
  v_round TEXT;
  v_points DECIMAL(3,1);
BEGIN
  -- 라운드별 승점 계산
  SELECT round INTO v_round FROM public.games WHERE id = p_game_id;
  
  v_points := CASE v_round
    WHEN 'Play-In'      THEN 1.0
    WHEN 'First Round'  THEN 1.5
    WHEN 'Semifinals'   THEN 2.0
    WHEN 'Conf. Finals' THEN 2.5
    WHEN 'Finals'       THEN 3.0
    ELSE 1.0
  END;

  -- 투표 결과 업데이트
  UPDATE public.votes
  SET
    is_correct = (voted_team = p_winner),
    points = CASE WHEN voted_team = p_winner THEN v_points ELSE 0 END
  WHERE game_id = p_game_id;

  -- 경기 winner 업데이트
  UPDATE public.games SET winner = p_winner WHERE id = p_game_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 뷰: 시즌별 랭킹
-- =============================================

CREATE OR REPLACE VIEW public.ranking AS
SELECT
  u.id,
  u.name,
  u.email,
  v.season_id,
  s.name AS season_name,
  COUNT(v.id) AS total_votes,
  COUNT(CASE WHEN v.is_correct THEN 1 END) AS correct_votes,
  COALESCE(SUM(v.points), 0) AS total_points,
  ROUND(
    CASE WHEN COUNT(v.id) > 0
      THEN COUNT(CASE WHEN v.is_correct THEN 1 END)::DECIMAL / COUNT(v.id) * 100
      ELSE 0
    END, 1
  ) AS accuracy_pct
FROM public.users u
LEFT JOIN public.votes v ON u.id = v.user_id
LEFT JOIN public.seasons s ON v.season_id = s.id
WHERE u.approved = TRUE
GROUP BY u.id, u.name, u.email, v.season_id, s.name;

-- =============================================
-- 첫 번째 관리자 계정 설정 방법:
-- 1. 구글 로그인으로 회원가입
-- 2. 아래 SQL에서 이메일 주소 변경 후 실행
-- =============================================

-- UPDATE public.users SET role = 'admin', approved = TRUE WHERE email = 'your-admin@gmail.com';
