# HookRelay — FastAPI Backend

High-reliability webhook ingestion, forwarding, and replay backend service.

## Tech Stack Overview

- **Framework**: FastAPI (Async, automatic validation)
- **Validation & Settings**: Pydantic v2 & Pydantic Settings
- **Database**: PostgreSQL (JSONB for payloads, `FOR UPDATE SKIP LOCKED` for queuing)
- **ORM & Migrations**: SQLAlchemy 2.0 (async), Alembic
- **HTTP Forwarding**: HTTPX (`AsyncClient` with timeouts)
- **Auth**: JWT (PyJWT), Passlib (bcrypt)
- **Live Updates**: FastAPI WebSockets
- **Testing**: pytest, pytest-asyncio

---

## Project Structure

```
Backend/
├── app/
│   ├── api/
│   │   └── v1/
│   │       ├── __init__.py
│   │       └── router.py        # Routes & WebSocket endpoint
│   ├── models/                  # SQLAlchemy ORM models
│   │   └── __init__.py
│   ├── schemas/                 # Pydantic v2 schemas
│   │   └── __init__.py
│   ├── config.py                # Environment configuration
│   ├── database.py              # Async SQLAlchemy engine & session
│   └── main.py                  # FastAPI application entry point
├── tests/                       # Async test suite
│   ├── __init__.py
│   └── test_main.py
├── docker-compose.yml           # PostgreSQL container setup
├── requirements.txt             # Project dependencies
├── .env.example                 # Environment variable templates
└── .gitignore
```

---

## Getting Started

### 1. Activate the Virtual Environment

**Windows PowerShell:**
```powershell
.\venv\Scripts\Activate.ps1
```

**Git Bash / Command Prompt:**
```bash
source venv/Scripts/activate
# or
venv\Scripts\activate.bat
```

### 2. Start PostgreSQL via Docker (Optional for local DB)

```powershell
docker compose up -d
```

### 3. Run the Development Server

```powershell
uvicorn app.main:app --reload --port 8000
```

The API will be available at:
- **API Root**: [http://localhost:8000/](http://localhost:8000/)
- **Interactive Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **Health Check**: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)
- **WebSocket Feed**: `ws://localhost:8000/api/v1/ws/events`

### 4. Run Tests

```powershell
pytest
```
