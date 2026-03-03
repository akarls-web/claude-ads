# SterlingX Paid Ads Audit — Web Service

A full-stack Next.js 15 web application that runs automated Google Ads audits (74+ checks) via OAuth2.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Auth | Clerk |
| API | tRPC v11 |
| Database | Neon Postgres + Drizzle ORM |
| Ads API | Google Ads API v18 (REST) |
| Styling | Tailwind CSS + SterlingX brand |
| Icons | Lucide React |

## Getting Started

### Prerequisites

- Node.js 20+
- A [Clerk](https://clerk.com) account (free tier works)
- A [Neon](https://neon.tech) database (free tier works)
- A Google Cloud project with **Google Ads API** enabled and OAuth2 credentials
- A Google Ads [developer token](https://developers.google.com/google-ads/api/docs/access-levels)

### 1. Install dependencies

```bash
cd web
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in all values in `.env`:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `DATABASE_URL` | Neon connection string |
| `GOOGLE_CLIENT_ID` | Google OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL (e.g. `http://localhost:3100/api/google/callback`) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads API developer token |

### 3. Push database schema

```bash
npm run db:push
```

### 4. Run dev server

```bash
npm run dev
```

Open [http://localhost:3100](http://localhost:3100).

## What Gets Checked

The audit engine runs **74+ checks** across these categories:

| Category | Checks | Weight |
|----------|--------|--------|
| Conversion Tracking | G42–G47, G-CT1 | 25% |
| Wasted Spend | G13–G17 | 20% |
| Account Structure | G01–G05 | 15% |
| Keyword Optimization | G20–G22 | 15% |
| Ad Quality | G26–G27, G-PM1 | 10% |
| Settings & Extensions | G36–G38, G50 | 10% |
| SterlingX Agency | SX01–SX14 | 5% |

### Scoring

- **Score range:** 0–100
- **Grade scale:** A (90+), B (80–89), C (70–79), D (60–69), F (<60)
- **Severity multipliers:** Critical (5×), High (3×), Medium (1.5×), Low (1×)

## Docker

```bash
docker compose up --build
```

Runs on port 3100.

## Project Structure

```
web/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (auth)/             # Sign-in / sign-up (Clerk)
│   │   ├── (dashboard)/        # Protected dashboard pages
│   │   │   ├── dashboard/      # Main dashboard
│   │   │   ├── connect/        # Google Ads OAuth connect
│   │   │   ├── audits/         # Audit history
│   │   │   └── audit/[id]/     # Audit detail view
│   │   └── api/
│   │       ├── trpc/           # tRPC handler
│   │       └── google/         # OAuth flow
│   ├── server/
│   │   ├── db/                 # Drizzle schema + connection
│   │   ├── routers/            # tRPC routers (account, audit)
│   │   └── services/
│   │       ├── google-ads.ts   # Google Ads API v18 client
│   │       └── audit-engine.ts # 74-check audit engine
│   ├── lib/                    # Client utilities + tRPC client
│   └── styles/                 # Global CSS + brand tokens
├── Dockerfile
├── docker-compose.yml
├── drizzle.config.ts
├── tailwind.config.ts
└── .env.example
```

## License

Proprietary — SterlingX Digital Agency
