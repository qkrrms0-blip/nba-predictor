# NBA 승부예측 앱 — 전체 배포 가이드

## 📁 프로젝트 구조

```
nba-predictor/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # 루트 레이아웃
│   │   ├── page.tsx            # 루트 (리다이렉트)
│   │   ├── globals.css         # 전역 스타일
│   │   ├── login/page.tsx      # 구글 로그인 페이지
│   │   ├── pending/page.tsx    # 승인 대기 페이지
│   │   ├── auth/callback/      # OAuth 콜백
│   │   ├── voting/             # 투표 탭
│   │   ├── ranking/            # 랭킹 탭
│   │   ├── history/            # 정산내역 탭
│   │   ├── admin/              # 관리 탭
│   │   └── api/
│   │       └── games/sync/     # NBA API 동기화
│   ├── components/
│   │   └── AppShell.tsx        # 헤더 + 하단 네비게이션
│   └── lib/
│       ├── types.ts            # 타입 정의
│       ├── nba-api.ts          # balldontlie.io 연동
│       └── supabase/
│           ├── client.ts       # 클라이언트용
│           └── server.ts       # 서버용 + Admin 클라이언트
├── middleware.ts               # 인증 미들웨어
├── next.config.ts
├── tsconfig.json
├── package.json
├── supabase_setup.sql          # DB 초기 설정
└── .env.local.example          # 환경변수 예시
```

---

## 🚀 단계별 배포 가이드

### STEP 1 — Supabase 프로젝트 생성

1. [https://supabase.com](https://supabase.com) 접속 → 새 프로젝트 생성
2. **Dashboard → SQL Editor** 에서 `supabase_setup.sql` 전체 붙여넣기 후 실행
3. **Dashboard → Authentication → Providers → Google** 활성화
   - Google Cloud Console에서 OAuth 2.0 클라이언트 ID 생성 필요
   - 승인된 리디렉션 URI: `https://<프로젝트ID>.supabase.co/auth/v1/callback`
4. **Dashboard → Project Settings → API** 에서:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### STEP 2 — Google OAuth 설정

1. [Google Cloud Console](https://console.cloud.google.com) → API 및 서비스 → 사용자 인증 정보
2. OAuth 2.0 클라이언트 ID 만들기 (웹 애플리케이션)
3. 승인된 리디렉션 URI 추가:
   - `https://<프로젝트ID>.supabase.co/auth/v1/callback`
   - (개발) `http://localhost:3000/auth/callback`
4. 클라이언트 ID, 시크릿을 Supabase Google Provider에 입력

### STEP 3 — balldontlie API 키 발급 (무료)

1. [https://www.balldontlie.io](https://www.balldontlie.io) 접속
2. 회원가입 후 API Key 발급 (무료 플랜: 60 req/min)
3. API Key를 `BALLDONTLIE_API_KEY` 에 설정

### STEP 4 — 로컬 개발

```bash
# 프로젝트 클론 후
cd nba-predictor

# 패키지 설치
npm install

# 환경변수 설정
cp .env.local.example .env.local
# .env.local 파일을 열어서 실제 값으로 채우기

# 개발 서버 실행
npm run dev
# http://localhost:3000 접속
```

### STEP 5 — 첫 번째 관리자 계정 설정

```sql
-- Supabase SQL Editor에서 실행
-- 구글 로그인으로 가입 후 이메일 주소 변경
UPDATE public.users 
SET role = 'admin', approved = TRUE 
WHERE email = 'your-admin@gmail.com';
```

### STEP 6 — Vercel 배포

```bash
# Vercel CLI 설치 (최초 1회)
npm i -g vercel

# 배포
vercel

# 프로덕션 배포
vercel --prod
```

또는 GitHub 연동:
1. GitHub에 코드 푸시
2. [vercel.com](https://vercel.com) → New Project → GitHub 저장소 선택
3. **Environment Variables** 탭에 환경변수 4개 입력:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `BALLDONTLIE_API_KEY`
4. Deploy 클릭

### STEP 7 — Vercel 배포 후 Supabase 콜백 URL 업데이트

Supabase → Authentication → URL Configuration:
- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs**: `https://your-app.vercel.app/auth/callback`

---

## 🏀 사용법

### 관리자 워크플로우

1. **사용자 승인**: 관리 탭 → 사용자 → 가입 신청자 승인/거절
2. **경기 등록**: 관리 탭 → 경기 → 경기 추가 (홈/원정팀, 시간, 라운드 설정)
   - 또는 API 동기화: `POST /api/games/sync` 호출
3. **결과 입력**: 경기 종료 후 관리 탭 → 경기 → 승리팀 선택 → 자동 채점
4. **새 시즌**: 관리 탭 → 시즌 → 새 시즌 시작

### 유저 워크플로우

1. 구글 로그인 → 관리자 승인 대기
2. 승인 후 → 투표 탭에서 경기 선택 → 승리팀 예측 투표
3. 경기 시작 전까지 투표/변경 가능, 시작 후 투표 현황 공개
4. 랭킹 탭에서 시즌별 순위 확인
5. 정산내역 탭에서 적중 현황 확인

---

## 💡 라운드별 승점

| 라운드 | 승점 |
|--------|------|
| Play-In | 1점 |
| First Round | 1.5점 |
| Semifinals | 2점 |
| Conf. Finals | 2.5점 |
| Finals | 3점 |

---

## ⚠️ 주의사항

- `SUPABASE_SERVICE_ROLE_KEY`는 절대 클라이언트에 노출하지 마세요 (`.env.local`에만)
- balldontlie 무료 플랜은 라운드 정보를 제공하지 않으므로, 관리자가 경기 추가 시 라운드를 직접 지정해야 합니다
- Vercel 무료 플랜 환경변수는 프로덕션/프리뷰 배포에만 적용됩니다
