# 🚀 CostPro — Smart POS & Cost Management

**Professional Architecture · AI Integrated · Enterprise Stabilized**

[![CI](https://github.com/Nardian90/Costpro/actions/workflows/ci.yml/badge.svg)](https://github.com/Nardian90/Costpro/actions/workflows/ci.yml)
[![Architecture Integrity](https://img.shields.io/badge/Architecture_Integrity-9.2/10-green.svg)](docs/audits/DOCUMENTATION_AUDIT_REPORT.md)
[![Documentation Style](https://img.shields.io/badge/Documentation-Diátaxis-blue.svg)](knowledge/docs/)

CostPro is a next-generation Point of Sale (POS) and cost management application designed for seamless operational efficiency, with modules for inventory, cashiers, cost sheets (Res. 148/2023), multistore management, offers, and an AI-powered chatbot.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router), React 19, TypeScript 5.9 |
| **Styling** | Tailwind CSS 4, shadcn/ui, Framer Motion |
| **State** | Zustand, TanStack Query, Dexie (IndexedDB offline) |
| **Backend** | Supabase (PostgreSQL, Auth, RLS, Storage) |
| **AI** | z.ai (GLM) default, Google Gemini fallback, OpenAI-compatible |
| **Observability** | Sentry, OpenTelemetry |
| **Package Manager** | [Bun](https://bun.sh) (primary), npm compatible |
| **Deploy** | Vercel (primary), Docker / PM2 (self-hosted) |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 20 (see `.nvmrc`)
- **Bun** ≥ 1.3 — install with `curl -fsSL https://bun.sh/install | bash`
- A **Supabase** project (URL + anon key + service role key)

### 1. Clone & Install

```bash
git clone https://github.com/Nardian90/Costpro.git
cd Costpro
bun install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your real credentials. Required variables:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only) |
| `DATABASE_URL` | Used by Prisma for type generation (Supabase is the real DB) |
| `NEXTAUTH_URL` | App URL (`http://localhost:3000` in dev) |
| `ENABLE_DEV_BYPASS` | `false` in production (security) |
| `CSRF_ALLOWED_DOMAINS` | Comma-separated allowed domains |
| `ZAI_API_KEY` + `ZAI_BASE_URL` | z.ai (GLM) chatbot provider |
| `GOOGLE_API_KEY` + `GEMINI_MODEL` | Google Gemini fallback provider |

See [`VERCEL_ENV_SETUP.md`](VERCEL_ENV_SETUP.md) for production deployment details.

### 3. Launch development server

```bash
bun run dev
```

App available at `http://localhost:3000`.

---

## 📜 Available Scripts

| Script | Description |
|---|---|
| `bun run dev` | Start Next.js dev server (port 3000) |
| `bun run build` | Production build |
| `bun run start` | Start production server (after build) |
| `bun run lint` | ESLint check |
| `bun run test` | Run unit tests (Vitest) |
| `bun run test:coverage` | Unit tests with coverage |
| `bun run test:e2e` | Playwright E2E tests |

---

## 🐳 Self-Hosted Deployment (PM2 / Docker)

### Option A: PM2 (recommended for VPS)

PM2 keeps the server alive with automatic restarts on crash.

```bash
# Install PM2 globally
npm install -g pm2

# Start the app (uses ecosystem.config.js + scripts/start.sh)
pm2 start ecosystem.config.js

# Save process list (for auto-restart on reboot — requires `pm2 startup` setup)
pm2 save
```

Useful commands:

```bash
pm2 status              # check status
pm2 logs costpro        # live logs
pm2 restart costpro     # manual restart
pm2 stop costpro        # stop
pm2 delete costpro      # remove from PM2
```

To enable auto-start on system reboot, run `pm2 startup systemd` as root and follow the instructions. See [`deploy/`](deploy/) for a ready-to-install systemd unit (if present).

### Option B: Docker

```bash
docker compose up -d --build
```

See [`Dockerfile`](Dockerfile) and [`docker-compose.yml`](docker-compose.yml) for details.

---

## 🧠 Knowledge Base

Structured following the **Diátaxis Framework**:

- **[Tutorials](knowledge/docs/tutorials/)** — Guided learning for new developers and users
- **[How-to Guides](knowledge/docs/how-to/)** — Step-by-step instructions for specific tasks
- **[Technical Reference](knowledge/docs/reference/)** — Detailed API, database schema, and component specs
- **[Explanations](knowledge/docs/explanation/)** — High-level concepts and architectural decisions

---

## 🏗️ Architecture & Governance

- **[Pipeline Config](docs/automation/ARCHITECTURE_AI_PIPELINE_v8.md)** — Autonomous AI pipeline (v9.0) with RAG & AST analysis
- **[Health Reports](docs/audits/)** — Architecture and security audits
- **[Security Issues Status](docs/audits/SECURITY_ISSUES_STATUS.md)** — Tracked security issues and resolutions
- **[System Knowledge](knowledge/)** — Internal knowledge base

---

## 🔌 CI/CD

- **GitHub Actions** (`.github/workflows/ci.yml`): TypeCheck + Lint + Unit Tests + Coverage + Build + E2E (Playwright) + Security Audit
- **Vercel**: auto-deploys on push to `main` (production) and on PRs (preview)

---

## 📁 Project Structure (root)

```
.
├── src/                    # Application source (App Router, components, services)
├── supabase/               # Supabase migrations and config
├── public/                 # Static assets
├── e2e/                    # Playwright end-to-end tests
├── tests/                  # Performance and integration tests
├── docs/                   # Architecture docs and audit reports
├── knowledge/              # Diátaxis knowledge base
├── scripts/                # PM2 wrapper and utility scripts
├── ecosystem.config.js     # PM2 configuration
├── Dockerfile              # Docker build
├── docker-compose.yml      # Docker Compose
├── vercel.json             # Vercel cron + serverless functions
├── next.config.ts          # Next.js config (Sentry, next-intl, bundle analyzer)
└── .env                    # Local environment (never committed)
```

---

*© 2024 CostPro Enterprise. All rights reserved.*
