# LeadFlow Memory

A **verifiable long-term memory system** for real-estate (and other social-media lead-gen) sales. It chains two agents, backed by three storage layers:

- **Lead Discovery Agent** — finds users with buying intent on Xiaohongshu (posts/comments), extracts a profile, and creates leads.
- **Lead Conversion Agent** — automatically sends an opening message, polls for customer replies, and runs multi-touch follow-up grounded in long-term memory until a goal is reached or the customer declines.

### Three storage layers

| Layer | Tech | What it stores |
|---|---|---|
| **Business state / raw transcript** | PostgreSQL (Prisma) | Leads, profiles, message-by-message conversation, timeline, state machine |
| **Long-term semantic memory** | MemWal | Confirmed customer facts (recalled by semantic similarity; cross-session profile) |
| **Decision proof** | Walrus | Immutable snapshot of each decision (audit / accountability) |

> Key distinction: **conversation coherence** comes from the Postgres transcript (fed to the LLM); **long-term profile** comes from MemWal recall. They are complementary, not interchangeable.

---

## Repository layout

```
LeadFlow-Memory/
├── apps/
│   ├── api/            # Backend API (Hono) + scheduler + auto follow-up loop
│   └── web/            # Dashboard frontend (React + Vite)
├── packages/
│   ├── agents/         # Discovery / conversion workflows (prompts, outcome judging)
│   ├── connectors/     # Xiaohongshu connectors: xhs-discovery (scraping) / xhs-chat (DM, in-process Midscene driving ADB)
│   ├── llm/            # LLM provider (OpenAI-compatible)
│   ├── memwal/         # MemWal semantic-memory client
│   ├── walrus/         # Walrus proof client
│   ├── playbook/       # Industry playbook loader (YAML)
│   ├── core/ db/       # Shared types & database
├── playbooks/          # Conversion playbooks (e.g. real-estate-chongqing.yml)
├── prisma/             # Database schema & migrations
└── docs/               # Architecture / feature / proposal docs
```

---

## Tech stack

- **Monorepo**: pnpm workspace
- **Backend**: TypeScript (ESM) + Hono + Prisma + PostgreSQL
- **Frontend**: React + Vite
- **LLM**: OpenAI-compatible protocol (provider is configurable)
- **Device automation**: [Midscene](https://midscenejs.com) `@midscene/android` + ADB (drives the real Xiaohongshu app on a phone)
- **Testing**: vitest

---

## Quick start

### 1. Prerequisites

- Node.js ≥ 20, pnpm
- A PostgreSQL instance (local or hosted, e.g. Supabase)
- For real-device runs: an Android phone + ADB + Xiaohongshu app logged in + a **vision-capable multimodal model** key (e.g. Alibaba DashScope `qwen3-vl-plus`)

### 2. Install

```bash
pnpm install
```

### 3. Configure environment

Create `.env` at the repo root (it is in `.gitignore`). Minimal "fake" setup (no real services, in-memory stubs — good for running the logic locally):

```bash
# fake mode: no real LLM/memory/device, uses stubs
LLM_PROVIDER=fake
MEMWAL_MODE=fake
WALRUS_MODE=fake
XHS_CHAT_MODE=fake
```

For real mode, see the full [Environment variables](#environment-variables) list below.

### 4. Initialize the database

```bash
npx prisma migrate deploy --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma
```

### 5. Run

```bash
# Backend API (defaults to http://127.0.0.1:3001)
pnpm --filter @leadflow/api dev      # watch mode (auto-restarts on file change — avoid during loop/device debugging, see note)
# Or single instance (recommended for device/loop debugging — controlled, no auto-restart):
node_modules/.bin/tsx --env-file=.env apps/api/src/index.ts

# Dashboard frontend
pnpm --filter @leadflow/web dev
```

> ⚠️ **Do not use watch mode (`pnpm dev`) during device debugging.** Editing files auto-restarts the server, which restarts the auto follow-up loop and re-drives the phone — causing duplicate sends and hard-to-trace behavior. Use the single-instance command above instead.

---

## Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | PostgreSQL connection strings (pooler / direct) |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | LLM for chat/extraction (OpenAI-compatible). `LLM_PROVIDER=fake` uses a stub |
| `MEMWAL_BASE_URL` / `MEMWAL_SERVER_URL` / `MEMWAL_DELEGATE_KEY` / `MEMWAL_ACCOUNT_ID` | MemWal semantic memory. `MEMWAL_MODE=fake` uses a stub |
| `WALRUS_PUBLISHER_URL` / `WALRUS_AGGREGATOR_URL` | Walrus proof storage (testnet public endpoints). `WALRUS_MODE=fake` uses a stub |
| `XHS_DISCOVERY_MCP_URL` | Xiaohongshu scraping MCP URL (xiaohongshu-mcp, default `http://localhost:18060/mcp`) |
| `XHS_DISCOVERY_DELAY_MS` | Delay between scraping tool calls (anti rate-limit) |
| **xhs-chat (DM)** | |
| `XHS_CHAT_MODE` | `fake`=stub; `mcp`=external subprocess (legacy); empty=**in-process Midscene (default)** |
| `MIDSCENE_MODEL_NAME` | Vision model, e.g. `qwen3-vl-plus` |
| `MIDSCENE_MODEL_FAMILY` | Model family, e.g. `qwen3-vl` (Alibaba), `glm-v` (Zhipu) |
| `MIDSCENE_MODEL_BASE_URL` / `MIDSCENE_MODEL_API_KEY` | Vision model endpoint & key (e.g. DashScope `https://dashscope.aliyuncs.com/compatible-mode/v1`) |
| **Auto follow-up loop** | |
| `AUTO_FOLLOWUP_ENABLED` | Must be `true` to start the timed follow-up loop |
| `AUTO_FOLLOWUP_INTERVAL_MS` | Tick interval (also the per-lead polling cadence), default 60000 |
| `AUTO_FOLLOWUP_DEVICE_ID` | Default sending device ADB serial (e.g. `b759b4fa`); empty = first connected device |
| `AUTO_FOLLOWUP_BATCH_SIZE` / `_DAILY_CAP` / `_MAX_TOUCHES` / `_SEND_MIN_MS` / `_SEND_MAX_MS` | Guardrails: per-tick limit / daily send cap / per-lead send cap / send throttle |
| `CONVERSION_PLAYBOOK_ID` | Fallback playbook when a campaign specifies none (default `real-estate-chongqing`) |

> The vision model **must accept image input (VL)**. Text-only models (e.g. `qwen-plus`) cannot do on-screen grounding.

---

## Core flows

### A. Lead discovery

```bash
# Trigger scraping for a campaign (requires xiaohongshu-mcp running and logged in)
curl -X POST http://127.0.0.1:3001/api/workflows/discovery/run \
  -H "content-type: application/json" \
  -d '{"campaignId":"<id>","seedKeywords":["渝北 三房"]}'
```

Discovered leads are auto-enqueued for follow-up (`autoFollowupEnabled=true`).

### B. Automated conversion follow-up (timed loop)

With `AUTO_FOLLOWUP_ENABLED=true`, after the API starts the loop runs automatically:

```
discovered / enqueued lead
  → tick picks it up → generate opening (from profile) → send via device → status: contacting
  → poll for replies every interval
  → on reply: read conversation + recall long-term memory + recent transcript → generate reply → judge outcome
       continue→stay / goal_reached→converted / rejected→lost / over maxTouches→paused
```

**Enqueue a specific lead into the pipeline** (handed off to the timed loop, not executed in-request):

```bash
curl -X POST http://127.0.0.1:3001/api/leads/<leadId>/start-followup
```

**Create a test lead** (with Xiaohongshu id, profile, MemWal/Walrus writes):

```bash
curl -X POST http://127.0.0.1:3001/api/leads/mock \
  -H "content-type: application/json" \
  -d '{"displayName":"name","redId":"xhs_id","summary":"3BR in Yubei, budget 1.3M",
       "sourceText":"Looking for a 3BR in Yubei under 1.3M","fields":{"budget":"<1.3M","district":"Yubei"}}'
```

---

## Main API

| Method / Path | Purpose |
|---|---|
| `POST /api/leads/mock` | Create a test lead (writes lead/profile/memory/proof/identity) |
| `POST /api/leads/:leadId/start-followup` | Enqueue a lead for auto follow-up (returns immediately, loop takes over) |
| `GET  /api/leads/:leadId` | Lead detail |
| `GET  /api/leads/:leadId/conversation` | Fetch message-by-message transcript |
| `POST /api/leads/:leadId/conversation/customer-reply` | Manually inject a customer reply (debugging) |
| `POST /api/workflows/discovery/run` | Trigger scraping |
| `POST /api/workflows/conversion/run` | Run one conversion turn manually (requires customerMessage) |
| `GET  /api/dashboard/leads` | Dashboard lead list |
| `GET  /api/devices/...` | Device / login status |

---

## Playbooks

The conversion agent's **system prompt comes from a playbook** (`playbooks/*.yml`), not hardcoded defaults. A playbook defines role, tone, goals, conversation rules, forbidden claims, profile fields, and local knowledge. When a campaign specifies none, it falls back to `CONVERSION_PLAYBOOK_ID` (default `real-estate-chongqing`).

Cross-playbook baseline constraints (short replies, back off when declined, memory writes only confirmed facts) are always layered in by the code.

---

## Testing

```bash
pnpm -r test          # all package unit tests
pnpm typecheck        # all type checks
pnpm --filter @leadflow/api test   # a single package
```

Stub modes (`XHS_CHAT_MODE=fake`, etc.) let you run the main flow without a real device or external services.

---

## Known limitations / notes

- **Device automation relies on a vision model** and is inherently non-deterministic. The send flow includes "verify text entered + verify the input box clears after sending + retry only re-taps send (never re-types)" to prevent duplicates, and conversation sync deduplicates **by content** to avoid treating the agent's own messages as customer replies.
- **No real property/listing database yet**: when a customer asks for a specific community name, the agent can only defer gracefully ("I'll send you the details"). Wiring a knowledge base would enable concrete listings.
- **Single-process MVP**: the follow-up loop has no multi-worker locking; the daily counter is in-process memory (resets on restart).
- Real-device DMs require the device to be logged into Xiaohongshu; sends fail if the session expires.
```
