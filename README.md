# HookRelay ⚡

### Enterprise-Grade Webhook Ingestion, Delivery Proxy, Analytics & Real-Time Observability Engine

[![Python 3.12](https://img.shields.io/badge/Python-3.12-blue.svg?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-4169E1.svg?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![React 19](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6.0+-646CFF.svg?logo=vite&logoColor=white)](https://vitejs.dev)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC.svg?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests Passing](https://img.shields.io/badge/Tests-17%20Passed%20(100%25)-brightgreen.svg)]()

HookRelay is a high-throughput, fault-tolerant webhook ingestion gateway and forwarding proxy. Built for mission-critical applications—such as e-commerce checkout systems, billing infrastructure, SaaS automation, and CI/CD pipelines—HookRelay decouples public webhook ingestion from internal processing, protecting internal backends from provider timeouts, server downtime, bursts, and duplicate processing.

---

## 📑 Table of Contents

- [The Problem It Solves](#-the-problem-it-solves)
- [How It Works](#-how-it-works)
- [System Architecture & Data Flow](#-system-architecture--data-flow)
- [Key Features](#-key-features)
- [Tech Stack & Design Decisions](#-tech-stack--design-decisions)
- [Database Schema](#-database-schema)
- [Interactive API Reference](#-interactive-api-reference)
- [Account & Settings Suite](#-account--settings-suite)
- [Local Development Setup](#-local-development-setup)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Production Deployment](#-production-deployment)
- [Contributing & License](#-contributing--license)

---

## ❓ The Problem It Solves

Modern web applications depend heavily on third-party webhook events from payment gateways (Stripe, Razorpay), code repositories (GitHub, GitLab), CRMs, and messaging APIs. However, consuming webhooks directly on your primary application server introduces several severe vulnerabilities:

| Webhook Pitfall | Real-World Impact | How HookRelay Solves It |
| :--- | :--- | :--- |
| **Provider Timeouts (< 5s)** | Stripe and Razorpay fail deliveries if your server takes > 2–5 seconds to process inventory, database writes, or email jobs. Continued timeouts result in providers automatically disabling your webhook endpoints. | **Instant Acknowledgment**: HookRelay captures the event, verifies signatures, writes to PostgreSQL, and responds with `202 Accepted` in **< 15ms**. |
| **Server Outages & Deployments** | When your primary backend restarts, crashes, or deploys, any in-flight webhooks sent by third parties are dropped permanently unless manually recovered. | **Persistent Storage & Exponential Backoff**: Webhooks are stored in PostgreSQL JSONB and automatically retried using exponential backoff with randomized jitter (`[1m, 5m, 30m, 2h]`). |
| **Duplicate Webhooks (Double Billing)** | Network retries from external providers frequently deliver identical events multiple times, causing double billing or duplicate order processing. | **Durable Idempotency Engine**: Deduplication keys (`Idempotency-Key` or provider event IDs) automatically drop duplicates while acknowledging the sender. |
| **SSRF & Spoofed Attacks** | Accepting arbitrary payloads allows attackers to forge webhooks or exploit internal URLs (`169.254.169.254`, `localhost`, RFC 1918 subnets). | **Zero-Trust Security**: DNS-resolving SSRF defense prevents outbound requests to private/cloud metadata IPs, while HMAC-SHA256 verification validates authentic payloads. |
| **Zero Debug Observability** | Debugging failed webhooks in production usually requires parsing unstructured server log files with no ability to inspect raw headers or retry. | **Live Real-Time Telemetry**: Persistent WebSocket feed (`/ws/events`), latency tracking, payload inspectors, and **1-Click Replay**. |

---

## ⚙️ How It Works

HookRelay acts as a secure buffer and delivery proxy between external webhook senders and your internal destination servers:

```
[External Webhook Sender]
      (Stripe, GitHub, Razorpay)
                 │
                 ▼ (HTTP POST)
   ┌───────────────────────────────────────────┐
   │         HOOKRELAY INGESTION GATEWAY       │
   │  1. Sliding Rate Limiter (120 req/min/IP) │
   │  2. HMAC-SHA256 Signature Verification    │
   │  3. Idempotency Key Deduplication Check   │
   │  4. PostgreSQL JSONB Durable Commit       │
   └───────────────────────────────────────────┘
                 │
                 ├─► Immediately responds with HTTP 202 Accepted (< 15ms)
                 ├─► Broadcasts event via WebSocket to React Dashboard
                 ▼
   ┌───────────────────────────────────────────┐
   │        DURABLE POSTGRESQL QUEUE           │
   │  `events` Table (Raw Headers & Payload)   │
   │  `deliveries` Table (State & Backoff)     │
   └───────────────────────────────────────────┘
                 │
                 ▼ (SELECT ... FOR UPDATE SKIP LOCKED)
   ┌───────────────────────────────────────────┐
   │       ASYNC DELIVERY WORKER LOOP          │
   │  1. Resolves destination DNS & checks SSRF│
   │  2. Dispatches HTTP POST with Timeout     │
   │  3. Records Latency & Response Code       │
   │  4. If Failed: Schedules exponential retry│
   └───────────────────────────────────────────┘
                 │
                 ▼ (Verified Outbound POST)
      [Your Internal Application Server]
```

1. **Ingest**: The webhook sender calls your unique mailbox route (`POST /h/{slug}`).
2. **Protect**: HookRelay checks rate limits, verifies the HMAC cryptographic signature, and deduplicates the idempotency key.
3. **Acknowledge**: HookRelay commits the event to PostgreSQL and returns `202 Accepted` to the sender in under 15ms.
4. **Broadcast**: Connected dashboard clients immediately see the event appear via a real-time WebSocket stream (`/ws/events`).
5. **Dispatch**: The asynchronous background worker selects pending deliveries using `FOR UPDATE SKIP LOCKED` and attempts delivery to your destination URL.
6. **Retry & Recovery**: If your destination server is down or returns a non-2xx status code, HookRelay calculates the next retry timestamp with exponential backoff and jitter. If an issue is resolved, users can replay any failed event with 1 click.

---

## 🏗️ System Architecture & Data Flow

```mermaid
flowchart TD
    subgraph External["External Webhook Emitters"]
        P1["GitHub Webhooks"]
        P2["Razorpay (UPI / Cards)"]
        P3["Stripe Payments"]
        P4["Custom Webhooks / CLI"]
    end

    subgraph IngestionLayer["HookRelay Ingestion Layer (FastAPI)"]
        RL["Sliding Window Rate Limiter\n(120 req/min/IP)"]
        SIG["HMAC-SHA256 Signature Verifier\n(Stripe, GitHub, Razorpay)"]
        IDEMP["Idempotency Deduplicator\n(Unique Index on slug + key)"]
        ING["Fast Ingest Controller\n(POST /h/{slug})"]
    end

    subgraph StorageLayer["PostgreSQL 15+ Storage (JSONB)"]
        DB_USERS[("users Table\n(Credentials & Delivery Defaults)")]
        DB_KEYS[("api_keys Table\n(SHA-256 Hashed Tokens)")]
        DB_EPS[("endpoints Table\n(Mailbox Slugs & Target URLs)")]
        DB_EVT[("events Table\n(JSONB Headers & Payloads)")]
        DB_DEL[("deliveries Table\n(Status, Attempt Count, Latency)")]
    end

    subgraph DeliveryEngine["Delivery & Replay Engine"]
        WORKER["Worker Loop\n(SELECT FOR UPDATE SKIP LOCKED)"]
        SSRF["SSRF Defense\n(DNS Resolution & Subnet Filter)"]
        DISPATCH["HTTP Dispatcher\n(Dynamic Timeout: 5s - 60s)"]
        BACKOFF["Exponential Backoff Engine\n(Progressive Delay + Jitter)"]
        REPLAY["Replay Engine\n(Individual & Bulk Failed)"]
        RETENTION["Retention Pruner\n(Auto-Purge Expired Records)"]
    end

    subgraph Destination["Your Target Infrastructure"]
        T1["Primary API Backend\n(api.yourcompany.com)"]
        T2["Webhook.site / Staging Dev"]
    end

    subgraph ClientLayer["Frontend Management Console (React 19 + Vite)"]
        UI_WS["Live Stream Hook\n(WebSocket /ws/events)"]
        UI_STATS["Analytics & Telemetry\n(Recharts p95 Latency & Error Breakdown)"]
        UI_SETTINGS["Settings & Security\n(API Keys, Password Reset, Defaults)"]
    end

    External -->|HTTP POST| RL
    RL --> SIG
    SIG --> IDEMP
    IDEMP --> ING

    ING -->|HTTP 202 Accepted < 15ms| External
    ING -->|Insert Event Payload| DB_EVT
    ING -->|Create Pending Job| DB_DEL
    ING -.->|Live Event Broadcast| UI_WS

    WORKER -->|Lock Due Deliveries| DB_DEL
    WORKER --> SSRF
    SSRF --> DISPATCH
    DISPATCH -->|Forward Payload| Destination
    DISPATCH -->|Record Status Code & Latency| DB_DEL
    DISPATCH -->|On Failure| BACKOFF
    BACKOFF -->|Schedule Next Attempt| DB_DEL
    DISPATCH -.->|Live Status Update| UI_WS

    UI_SETTINGS -->|Manage API Keys & Defaults| DB_USERS
    UI_SETTINGS -->|Generate hr_live_...| DB_KEYS
    REPLAY -->|Reset Pending Delivery| DB_DEL
    RETENTION -->|Purge Old Events| DB_EVT
    DB_DEL -->|SQL Aggregates| UI_STATS
```

---

## 🌟 Key Features

### 1. High-Throughput Mailboxes
- Generate dedicated, random URL-safe mailbox slugs (`/h/{slug}`).
- Direct traffic to any destination URL with custom cryptographic secrets (`whsec_...`).
- Individual mailbox toggles to pause or resume ingestion instantly.

### 2. Multi-Provider HMAC-SHA256 Signature Verification
Automatic signature validation out of the box for:
- **GitHub**: `X-Hub-Signature-256`
- **Stripe**: `Stripe-Signature` (`t=...,v1=...`)
- **Razorpay**: `X-Razorpay-Signature`
- **Custom / Generic**: Configurable header name with raw secret matching.

### 3. Lock-Free Durable Job Queue (`SKIP LOCKED`)
- Avoids the maintenance overhead of Redis, RabbitMQ, or Celery by leveraging PostgreSQL's native `SELECT ... FOR UPDATE SKIP LOCKED`.
- Ensures zero deadlocks, race conditions, or duplicate deliveries across concurrent worker processes.

### 4. Exponential Backoff with Random Jitter
- When target endpoints return HTTP 4xx, 5xx, or time out, HookRelay reschedules delivery using an exponential delay schedule (`1m, 5m, 30m, 2h`).
- Applies a `±15%` randomized jitter to avoid thundering-herd spikes on your recovering servers.

### 5. Zero-Trust SSRF Protection
- Resolves all destination target hosts using DNS at runtime before every outbound HTTP request.
- Strictly blocks loopback (`127.0.0.1`, `localhost`), IPv6 equivalents (`::1`), private subnets (RFC 1918 `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and cloud instance metadata services (`169.254.169.254`, `metadata.google.internal`).

### 6. Idempotency & Deduplication Engine
- Detects repeated `Idempotency-Key` headers or provider event IDs.
- Drops duplicate payloads while returning the original response, preventing duplicate business transactions.

### 7. Real-Time WebSocket Telemetry
- Sub-second live updates pushed to connected dashboards over WebSocket (`/ws/events`).
- TanStack Query automatically updates table views in place without page reloads.

### 8. Analytics & Telemetry Dashboard
- Overall Delivery Success Rate percentage.
- **p95 and Average Latency** tracking in milliseconds.
- Hourly event throughput area charts.
- Top failure reasons, HTTP status codes, and error breakdowns.

### 9. Production-Grade SaaS Settings & Security
- **Personal API Keys**: Generate secure keys (`hr_live_...`) to send webhooks or manage mailboxes via cURL, Python, or CI/CD pipelines.
- **Configurable Delivery Policies**: Customize global retry counts (1–10) and request timeouts (5s–60s) directly from the UI.
- **Danger Zone**: One-click event history purge and password-confirmed account deletion.

---

## 🛠️ Tech Stack & Design Decisions

### Architecture Stack

| Domain | Technology | Justification |
| :--- | :--- | :--- |
| **Backend Framework** | **Python 3.12 + FastAPI** | Native asynchronous concurrency, high throughput, automatic OpenAPI documentation, and strict Pydantic v2 data validation. |
| **Database** | **PostgreSQL 15+ (asyncpg)** | Native JSONB indexing for diverse payloads, high write throughput, and transactional queue capabilities (`SKIP LOCKED`). |
| **ORM / Migration** | **SQLAlchemy 2.0 (Async) + Alembic** | Type-safe declarative models with automated database schema version control. |
| **Frontend Framework** | **React 19 + Vite** | Blazing-fast HMR, component modularity, small bundle sizes, and quick load times. |
| **Styling** | **TailwindCSS (v4)** | Clean, responsive design with glassmorphism, tailored status badges, and professional typography. |
| **Real-Time Feed** | **Native WebSockets (`/ws/events`)** | Bi-directional streaming for zero-latency event and delivery updates. |
| **State & Cache** | **TanStack React Query v5** | Server-state caching, automatic background invalidation, and optimistic UI updates. |
| **Data Visualization** | **Recharts** | Interactive SVG charts rendering throughput, latency, and status code distributions. |
| **Testing** | **Pytest + AnyIO + HTTPX** | Fully asynchronous test execution validating database operations, API contracts, and worker loops. |

### Architectural Rationale

1. **Why Decoupled Asynchronous Ingestion (HTTP 202 Accepted)?**  
   External providers disable webhook endpoints if response times exceed 2–5 seconds. If your backend is running slow DB transactions or third-party API calls, direct forwarding will cause dropped webhooks. HookRelay saves the payload to PostgreSQL JSONB and returns `202 Accepted` in **< 15ms**.

2. **Why PostgreSQL `SKIP LOCKED` Instead of Redis or Celery?**  
   Using PostgreSQL eliminates the operational complexity of maintaining external message queues like Redis or RabbitMQ. Deliveries and event payloads stay transactionally consistent in one database. `FOR UPDATE SKIP LOCKED` allows multiple async worker processes to pick due deliveries without contention.

3. **Why PostgreSQL JSONB for Headers and Bodies?**  
   Payloads from Stripe, GitHub, Razorpay, and Slack have wildly differing schemas. PostgreSQL `JSONB` stores the exact raw payload and HTTP headers verbatim without schema lock-in, enabling arbitrary querying while maintaining full data fidelity.

4. **Why DNS-Resolving SSRF Validation?**  
   Attackers can attempt Server-Side Request Forgery by registering destination URLs that resolve to internal IPs or using DNS rebinding to access AWS metadata (`169.254.169.254`). HookRelay resolves target hostnames and validates all resolved IPs against private and loopback subnets before dispatching requests.

---

## 🗄️ Database Schema

```
┌──────────────────┐          ┌────────────────────┐
│      users       │ 1      * │      api_keys      │
├──────────────────┤──────────├────────────────────┤
│ id (UUID PK)     │          │ id (UUID PK)       │
│ email (Unique)   │          │ user_id (FK Users) │
│ password_hash    │          │ name               │
│ full_name        │          │ key_prefix         │
│ retry_attempts   │          │ key_hash (SHA-256) │
│ delivery_timeout │          │ created_at         │
│ email_alerts     │          │ last_used_at       │
│ created_at       │          └────────────────────┘
└──────────────────┘
         │ 1
         │
         │ *
┌──────────────────┐          ┌────────────────────┐          ┌──────────────────┐
│    endpoints     │ 1      * │       events       │ 1      * │    deliveries    │
├──────────────────┤──────────├────────────────────┤──────────├──────────────────┤
│ id (UUID PK)     │          │ id (UUID PK)       │          │ id (UUID PK)     │
│ user_id (FK User)│          │ endpoint_id (FK Ep)│          │ event_id (FK Evt)│
│ slug (Unique)    │          │ headers (JSONB)    │          │ status           │
│ target_url       │          │ body (JSONB)       │          │ attempt_count    │
│ signing_secret   │          │ idempotency_key    │          │ next_attempt_at  │
│ provider_type    │          │ signature_valid    │          │ last_status_code │
│ is_active        │          │ received_at        │          │ last_error       │
│ created_at       │          └────────────────────┘          │ latency_ms       │
└──────────────────┘                                          │ created_at       │
                                                              │ updated_at       │
                                                              └──────────────────┘
```

---

## 📡 Interactive API Reference

### 1. Webhook Ingestion (Public)

#### Ingest Webhook Event
```http
POST /h/{slug}
```
**Headers:**
- `Content-Type: application/json`
- `Idempotency-Key: <unique_string>` *(optional)*
- `X-Hub-Signature-256`, `Stripe-Signature`, or `X-Razorpay-Signature` *(if endpoint configured)*

**cURL (macOS / Linux / Bash):**
```bash
curl -X POST "http://localhost:8000/h/sample-slug-123" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idemp_order_9981" \
  -d '{"event": "payment.succeeded", "amount": 25000, "currency": "usd"}'
```

**Windows PowerShell (using `--%` stop-parsing token):**
```powershell
curl.exe --% -X POST "http://localhost:8000/h/sample-slug-123" -H "Content-Type: application/json" -H "Idempotency-Key: idemp_order_9981" -d "{\"event\": \"payment.succeeded\", \"amount\": 25000, \"currency\": \"usd\"}"
```

**Native Windows PowerShell Cmdlet:**
```powershell
Invoke-RestMethod -Uri "http://localhost:8000/h/sample-slug-123" -Method Post -ContentType "application/json" -Headers @{"Idempotency-Key"="idemp_order_9981"} -Body '{"event": "payment.succeeded", "amount": 25000, "currency": "usd"}'
```

**Response (HTTP 202 Accepted in < 15ms):**
```json
{
  "status": "accepted",
  "event_id": "0e586327-e1ef-4067-87a6-d30818264d36",
  "received_at": "2026-10-22T12:50:25.299340Z"
}
```

---

### 2. Endpoints Management

Authentication requires either `Authorization: Bearer <JWT_or_API_KEY>` or `X-API-Key: hr_live_...`.

| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/endpoints` | List all webhook mailboxes owned by the authenticated user. |
| `POST` | `/endpoints` | Create a new mailbox with target forwarding URL and signature secret. |
| `GET` | `/endpoints/{id}` | Retrieve details of a specific mailbox. |
| `PATCH` | `/endpoints/{id}` | Update mailbox target URL, name, description, or active status. |
| `DELETE`| `/endpoints/{id}` | Permanently delete a mailbox and cascade delete its events. |
| `POST` | `/endpoints/{id}/rotate-secret` | Regenerate a new cryptographic signing secret. |
| `POST` | `/endpoints/{id}/replay-failed` | Bulk replay all failed deliveries for this mailbox. |

---

### 3. Events & Replay Engine

| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/endpoints/{id}/events` | Paginated list of captured webhook events for a specific mailbox. Supports `?status=delivered\|failed\|retrying` filter. |
| `GET` | `/events/{id}` | Detailed inspection of an event including raw JSONB headers, payload, and delivery logs. |
| `GET` | `/events/{id}/deliveries` | Retrieve the chronological execution history of all dispatch attempts for an event. |
| `POST` | `/events/{id}/replay` | Reset a delivery to `pending` status for immediate re-dispatch. |

---

### 4. Telemetry & Analytics

| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/stats/summary` | Delivery success rate, total events, p95/avg latency, and top error status breakdown. |
| `GET` | `/stats/timeseries` | Hourly throughput and delivery distributions for Recharts graphs. |
| `POST` | `/stats/cleanup` | Execute retention policy pruning of events older than `N` days. |
| `GET` | `/api/v1/health` | Service health status for Ingestion, Worker, and Database connection pool. |

---

## 🔒 Account & Settings Suite

HookRelay includes an interactive, production-grade Account & Security interface:

```
Settings & Account Console
├── Tab 1: Profile & Password
│   ├── Update Full Name & Contact Email Address
│   └── Change Password (with verification and length validation)
├── Tab 2: Personal API Keys
│   ├── Generate scoped keys (hr_live_...) for scripts, CI/CD, and curl
│   ├── One-time secret reveal with 1-click copy feedback
│   ├── Active keys table with last-used timestamps and Revoke action
│   └── Tabbed integration examples (cURL, Python requests, Node.js fetch)
├── Tab 3: Global Delivery Defaults
│   ├── Maximum retry attempts slider & presets (1, 3, 5, 10 attempts)
│   ├── Delivery connection timeout slider (5s to 60s)
│   └── Endpoint outage email notifications toggle
└── Danger Zone
    ├── Purge all captured webhook event logs (preserves mailboxes and keys)
    └── Delete account & all data (requires password confirmation)
```

---

## 💻 Local Development Setup

### Prerequisites
- **Python**: 3.10, 3.11, or 3.12
- **Node.js**: v18.0.0 or higher
- **PostgreSQL**: Local PostgreSQL or cloud instance ([Neon](https://neon.tech) / [Supabase](https://supabase.com))

---

### 1. Clone Repository
```bash
git clone https://github.com/Patilomkar282/HookRelay.git
cd HookRelay
```

---

### 2. Backend Setup

```bash
cd Backend

# Create and activate virtual environment
python -m venv venv

# Windows PowerShell:
.\venv\Scripts\activate
# macOS / Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
```

Edit your `.env` configuration:
```env
PROJECT_NAME="HookRelay"
ENVIRONMENT="development"
DEBUG=True

# PostgreSQL connection string with asyncpg driver
DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/hookrelay"

# Generate a secure 32+ character key
SECRET_KEY="your-super-secret-jwt-signing-key-change-in-production"
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Ingestion Rate Limiting
RATE_LIMIT_PER_MINUTE=120

# CORS
BACKEND_CORS_ORIGINS=["http://localhost:5173", "http://localhost:3000"]
```

Run database migrations:
```bash
alembic upgrade head
```

Start the FastAPI application and worker loop:
```bash
uvicorn app.main:app --reload --port 8000
```
- Interactive OpenAPI Docs: `http://localhost:8000/docs`
- ReDoc Documentation: `http://localhost:8000/redoc`

---

### 3. Frontend Setup

In a new terminal:
```bash
cd Frontend

# Install npm packages
npm install

# Start Vite development server
npm run dev
```

Visit the dashboard in your browser: `http://localhost:5173`.

---

## 🧪 Testing & Quality Assurance

HookRelay comes with an end-to-end automated testing suite powered by `pytest` and `anyio`.

```bash
cd Backend
pytest -v
```

### Test Coverage Highlights:
- **`test_auth.py`**: User registration, login, token authentication, profile updates, password change validation, personal API key generation (`hr_live_...`), `X-API-Key` header authentication, and account deletion.
- **`test_module2.py`**: Mailbox generation, unique slug collision handling, payload capture in JSONB, and sub-second `202 Accepted` ingestion.
- **`test_module3.py`**: Cryptographic HMAC-SHA256 signature verification (GitHub, Stripe, Razorpay), idempotency deduplication, exponential retry backoff, and 1-click replay.
- **`test_module4.py`**: Real-time WebSocket connection handling, event broadcast verification, and delivery status filtering.
- **`test_module5.py`**: SSRF blocking (loopback, private subnets, cloud metadata), sliding window rate limiting (HTTP 429), event retention purging, and telemetry aggregation.

```text
============================= test session starts =============================
platform win32 -- Python 3.12.6, pytest-9.1.1
collected 17 items

tests/test_auth.py::test_auth_full_flow PASSED                           [  5%]
tests/test_auth.py::test_user_settings_and_api_keys PASSED               [ 11%]
tests/test_main.py::test_root PASSED                                     [ 17%]
tests/test_main.py::test_health PASSED                                   [ 23%]
tests/test_module2.py::test_module2_endpoints_and_event_capture PASSED   [ 29%]
tests/test_module2.py::test_module2_edge_cases_and_limits PASSED         [ 35%]
tests/test_module2.py::test_custom_mailbox_configuration_and_signature PASSED [ 41%]
tests/test_module3.py::test_module3_signature_verification PASSED        [ 47%]
tests/test_module3.py::test_module3_idempotency_ignores_repeated_event PASSED [ 52%]
tests/test_module3.py::test_module3_delivery_failure_retry_and_exhaustion PASSED [ 58%]
tests/test_module3.py::test_module3_replay_and_deliveries_query PASSED   [ 64%]
tests/test_module4.py::test_module4_websocket_and_live_feed PASSED       [ 70%]
tests/test_module4.py::test_module4_status_filtering PASSED              [ 76%]
tests/test_module5.py::test_ssrf_blocking_and_target_url_validation PASSED [ 82%]
tests/test_module5.py::test_rate_limiter_sliding_window PASSED           [ 88%]
tests/test_module5.py::test_retention_policy_purges_expired_events PASSED [ 94%]
tests/test_module5.py::test_stats_summary_and_timeseries_endpoints PASSED [100%]

======================== 17 passed, 1 warning in 5.15s ========================
```

---

## 🚢 Production Deployment

### 1. Database (Neon or Supabase)
1. Provision a PostgreSQL 15+ database on [Neon](https://neon.tech) or [Supabase](https://supabase.com).
2. Set connection pooling to use `postgresql+asyncpg://...`.

### 2. Backend (Render / Railway / AWS ECS)
1. Deploy from the `Backend` directory.
2. **Build Command**: `pip install -r requirements.txt`
3. **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Set Environment Variables:
   - `DATABASE_URL`: Your managed PostgreSQL URL.
   - `SECRET_KEY`: A cryptographically random 64-character secret.
   - `ENVIRONMENT`: `production`
   - `DEBUG`: `False`
   - `ENFORCE_HTTPS`: `True`
   - `BACKEND_CORS_ORIGINS`: `["https://your-frontend-domain.vercel.app"]`

### 3. Frontend (Vercel / Cloudflare Pages)
1. Deploy from the `Frontend` directory.
2. **Build Command**: `npm run build`
3. **Output Directory**: `dist`
4. Set Environment Variables:
   - `VITE_API_URL`: `https://your-backend-domain.onrender.com`

---

## 📄 License

This project is open-source and distributed under the terms of the **MIT License**. See the [LICENSE](LICENSE) file for more information.

---

<p align="center">
  <b>HookRelay</b> — Built with ❤️ for resilient webhook infrastructure.
</p>
