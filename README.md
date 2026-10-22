# HookRelay 🚀
### Enterprise-Grade Webhook Ingestion, Delivery Proxy, Analytics & Live Replay Engine

HookRelay is a high-reliability webhook proxy designed to protect mission-critical applications (such as e-commerce checkout systems, SaaS billing, and CI/CD pipelines) from dropped webhooks, provider spam, downtime, and duplicate processing.

---

## Architecture Diagram

```mermaid
flowchart TD
    subgraph Providers["External Webhook Providers"]
        P1["GitHub Webhooks"]
        P2["Razorpay (UPI / Cards)"]
        P3["Stripe Billing"]
        P4["Custom Webhooks"]
    end

    subgraph Ingestion["HookRelay Ingestion Layer (FastAPI)"]
        RL["Sliding Window Rate Limiter"]
        SSRF["SSRF Target Validator"]
        SIG["HMAC-SHA256 Signature Verifier"]
        IDEMP["Idempotency Deduplicator"]
        ING["Fast Ingest Receiver (POST /h/{slug})"]
    end

    subgraph Storage["PostgreSQL Database (JSONB)"]
        DB_EVT[("events Table (Raw Headers & Payload)")]
        DB_DEL[("deliveries Table (Status, Attempts, Backoff)")]
    end

    subgraph Engine["Delivery & Replay Engine"]
        WORKER["Async Worker (SELECT FOR UPDATE SKIP LOCKED)"]
        DISPATCH["HTTP Dispatcher (10s Timeout & Jitter)"]
        REPLAY["Replay Engine (Single & Bulk)"]
        RETENTION["Retention Worker (Purge > 30 Days)"]
    end

    subgraph Targets["Target Destinations"]
        T1["E-Commerce Backend (api.store.com)"]
        T2["Webhook.site (Testing)"]
    end

    subgraph Frontend["React Dashboard (Vite + Tailwind + Recharts)"]
        UI_WS["Live WebSocket Feed (/ws/events)"]
        UI_STATS["Analytics & Telemetry Charts"]
        UI_REPLAY["1-Click Event Replayer"]
    end

    Providers -->|HTTP POST| RL
    RL --> SSRF
    SSRF --> SIG
    SIG --> IDEMP
    IDEMP --> ING
    ING -->|202 Accepted < 20ms| Providers
    ING -->|Write Event| DB_EVT
    ING -->|Queue Delivery| DB_DEL
    ING -.->|Real-time Broadcast| UI_WS

    WORKER -->|Poll Due Jobs| DB_DEL
    WORKER --> DISPATCH
    DISPATCH -->|Outbound POST| Targets
    DISPATCH -->|Update Status & Latency| DB_DEL
    DISPATCH -.->|Live Status Update| UI_WS

    UI_REPLAY -->|POST /events/{id}/replay| REPLAY
    REPLAY -->|Reset Pending| DB_DEL

    RETENTION -->|Prune Old Events| DB_EVT

    DB_DEL -->|SQL Aggregates| UI_STATS
```

---

## 🌟 Modules Implemented

* **Module 1: Authentication & Multi-Tenant Isolation**
  * JWT access tokens (`PyJWT`), bcrypt password hashing (`passlib`), multi-tenant endpoint scoping.
* **Module 2: Mailbox Creation & Ingestion Layer**
  * Random URL-safe slugs (`/h/{slug}`), signing secret generation (`whsec_...`), PostgreSQL JSONB raw capture, sub-second `202 Accepted` response.
* **Module 3: Delivery Engine & Replay Engine**
  * Lock-free PostgreSQL queue polling (`FOR UPDATE SKIP LOCKED`).
  * Exponential backoff retries with randomized jitter (`[1m, 5m, 30m, 2h]`).
  * HMAC-SHA256 signature verification for GitHub (`X-Hub-Signature-256`), Stripe (`Stripe-Signature`), Razorpay (`X-Razorpay-Signature`), and generic providers.
  * Single event replay & bulk failed deliveries replay.
* **Module 4: React Dashboard & Live WebSocket Feed**
  * Persistent WebSocket `/ws/events` broadcasting sub-second event appearance.
  * TanStack Query in-place cache updates without page reloads.
  * Filter by delivery status, search by event ID / idempotency key, pretty JSON payload inspection.
* **Module 5: Analytics, Hardening & Security**
  * **SSRF Protection**: Resolves target hostnames against DNS and blocks loopback (`127.0.0.1`, `localhost`), RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and cloud metadata services (`169.254.169.254`, `metadata.google.internal`).
  * **Ingestion Rate Limiting**: Sliding window rate limiter returning `429 Too Many Requests` with `Retry-After` headers when limits are exceeded.
  * **Data Retention Policy**: Automated background worker purging events and deliveries older than `N` days (default 30 days).
  * **SQL Aggregation Analytics (`GET /stats/summary` & `GET /stats/timeseries`)**:
    * Success rate percentage
    * p95 and average delivery latency in milliseconds
    * Events per hour throughput
    * Top failure error breakdown and status codes
    * Recharts Area & Line visualizations

---

## 💡 Design Decisions

### 1. Why Decoupled Asynchronous Ingestion (202 Accepted)?
External webhook senders (like Stripe and Razorpay) expect webhook receivers to acknowledge delivery within **2 to 5 seconds**. If your e-commerce backend performs complex operations (inventory locking, order creation, sending emails), synchronous proxying causes timeouts. HookRelay receives the payload, verifies signatures, writes to PostgreSQL, and responds in **< 20ms**, ensuring external providers never disable your webhooks.

### 2. Why PostgreSQL `FOR UPDATE SKIP LOCKED` Instead of Redis/Celery?
Using `SELECT ... FOR UPDATE SKIP LOCKED` allows PostgreSQL to act as a durable, transactionally consistent message queue without introducing extra infrastructure overhead (Redis, RabbitMQ, Celery). Multiple workers can pull due deliveries concurrently without race conditions or deadlocks.

### 3. Why PostgreSQL JSONB for Headers and Bodies?
Webhooks from GitHub, Stripe, Razorpay, and Slack have wildly differing schemas. PostgreSQL `JSONB` preserves the exact incoming payload and headers verbatim, allowing nested querying while preserving data fidelity.

### 4. Why DNS-Resolving SSRF Validation?
Attackers can attempt Server-Side Request Forgery (SSRF) by pointing destination URLs to internal hostnames or using DNS rebinding to access AWS metadata (`169.254.169.254`) or internal services (`10.0.0.1`). HookRelay resolves the host via DNS and inspects every resolved IP against RFC 1918, link-local, loopback, and cloud metadata ranges before allowing creation or dispatch.

---

## 🧪 Automated Testing Suite

HookRelay includes a comprehensive automated test suite covering authentication, multi-tenant isolation, signature verification, retry backoff, SSRF blocking, rate limiting, and analytics.

Run all tests with one command:
```bash
pytest
```
* **Status:** `15 passed in 3.73s` (100% passing)

---

## 🚀 Deployment Guide

### 1. Database Setup (Neon or Supabase)
1. Create a PostgreSQL 15+ database on [Neon](https://neon.tech) or [Supabase](https://supabase.com).
2. Copy the connection string:
   ```text
   DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>/<database>?ssl=require
   ```

### 2. Backend Deployment (Render or Railway)
1. Connect your repository to **Render** or **Railway**.
2. **Build Command:** `pip install -r requirements.txt`
3. **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Set Environment Variables:
   * `DATABASE_URL`: Your Neon/Supabase asyncpg URL.
   * `SECRET_KEY`: A secure 32+ character string.
   * `ENVIRONMENT`: `production`
   * `ENFORCE_HTTPS`: `True`
   * `BACKEND_CORS_ORIGINS`: `["https://your-frontend.vercel.app"]`

### 3. Frontend Deployment (Vercel)
1. Connect the `Frontend/` folder to **Vercel**.
2. **Build Command:** `npm run build`
3. **Output Directory:** `dist`
4. Set Environment Variables:
   * `VITE_API_URL`: `https://your-backend.onrender.com`

---

## 💻 Local Development

### 1. Start Backend:
```bash
cd Backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2. Start Frontend:
```bash
cd Frontend
npm install
npm run dev
```

Visit the dashboard at `http://localhost:5173`.
