# Nexus Center Grants Management System

AI-powered grant discovery, tracking, and application management for the **Nexus Center for IDD Care** — a 501(c)(3) nonprofit providing sensory-friendly phlebotomy and healthcare services for people with intellectual and developmental disabilities.

🌐 **[nexuscenter.care](https://nexuscenter.care)**

## Features

### Grant Discovery
- **Multi-source ingestion** from grants.gov (federal) and GrantExec (state/local)
- **AI-powered relevance scoring** based on organization profile
- **Category filtering** (healthcare, disability services, education, community development, etc.)
- **Deadline tracking** with urgency indicators

### Organization Profile
- **Word document upload** (.docx) for organization profile
- **Version history** with change tracking
- **Auto-generated relevance rules** from profile content
- **Editable keyword lists** for fine-tuning relevance scoring

### Application Management
- **Full lifecycle tracking**: Draft → In Progress → Submitted → Under Review → Awarded
- **Status workflow** with history logging
- **Notes and documentation** per application

## Tech Stack

- **Backend:** FastAPI + SQLAlchemy + asyncpg + PostgreSQL
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS + React Query
- **Fonts:** Nunito (headings) + Open Sans (body)
- **Deployment:** Docker on Coolify at `grants.nexuscenter.care`
- **AI:** Cortex gateway (Claude API) for relevance rule generation

## Brand Colors

| Color | Hex | Usage |
|-------|-----|-------|
| Navy | `#1B2A4A` | Primary, headings |
| Coral | `#E07A5F` | Accents, active states |
| Sage | `#6B9F8B` | Success, secondary |
| Gold | `#D4882A` | Highlights, warnings |
| Cream | `#FFF8F0` | Background |
| Warm Dark | `#3D405B` | Body text |

## Default Relevance Keywords

### High Priority
disability services, IDD, intellectual disability, developmental disability, phlebotomy, healthcare access, sensory-friendly, assistive, ADA compliance, medical care equity

### Medium Priority
nonprofit capacity building, community health, patient education, caregiver support, health equity

### Low Priority
general healthcare, training programs, community services

## Deployment

### Docker Compose (Coolify)

```bash
docker-compose up -d
```

The app will be available at `http://localhost:28586`. In production with Coolify/Traefik, it's served at `grants.nexuscenter.care`.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_HOST` | PostgreSQL host | `db` |
| `POSTGRES_PORT` | PostgreSQL port | `5432` |
| `POSTGRES_USER` | Database user | `grants` |
| `POSTGRES_PASSWORD` | Database password | Required |
| `POSTGRES_DB` | Database name | `grants` |
| `CORTEX_URL` | AI gateway URL | `http://ai-gateway:8000` |
| `GRANTEXEC_USERNAME` | GrantExec portal login | Optional |
| `GRANTEXEC_PASSWORD` | GrantExec portal password | Optional |

## Development

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server proxies `/api` requests to `http://localhost:8000`.

## API Endpoints

### Grants
- `GET /api/v1/grants` — List grants with filtering/sorting
- `GET /api/v1/grants/{id}` — Get grant details
- `PATCH /api/v1/grants/{id}` — Update grant (flag, dismiss, notes)
- `POST /api/v1/grants/{id}/flag` — Flag grant for follow-up
- `POST /api/v1/grants/{id}/dismiss` — Dismiss grant as irrelevant

### Applications
- `GET /api/v1/applications` — List applications
- `POST /api/v1/applications` — Create application from grant
- `PATCH /api/v1/applications/{id}` — Update application
- `POST /api/v1/applications/{id}/status` — Change status with history

### Organization Profile
- `GET /api/v1/org/profile` — Get current profile
- `PUT /api/v1/org/profile` — Update profile (text)
- `POST /api/v1/org/profile/upload` — Upload Word doc
- `GET /api/v1/org/profile/versions` — List version history

### Relevance Scoring
- `GET /api/v1/scoring/rules` — Get current rules
- `PATCH /api/v1/scoring/rules` — Update rules
- `POST /api/v1/scoring/generate-rules` — Regenerate from profile
- `POST /api/v1/scoring/score-all` — Rescore all grants

### Ingestion
- `POST /api/v1/ingest/grants-gov` — Ingest from grants.gov
- `POST /api/v1/ingest/grantexec` — Ingest from GrantExec

### Reports
- `GET /api/v1/stats` — Dashboard statistics
- `GET /api/v1/reports/pipeline` — Application pipeline
- `GET /api/v1/reports/deadlines` — Upcoming deadlines
- `GET /api/v1/reports/categories` — Grants by category

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│          Nexus Center Grants (Docker on Coolify)         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │ Dashboard   │  │ Discover    │  │ Applications│      │
│  │ - Stats     │  │ - Search    │  │ - List      │      │
│  │ - Deadlines │  │ - Filter    │  │ - Status    │      │
│  │ - Pipeline  │  │ - Flag      │  │ - Workflow  │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
│  ┌─────────────────────────────────────────────────┐     │
│  │ Settings                                         │     │
│  │ - Profile upload (Word docs)                    │     │
│  │ - Version history                               │     │
│  │ - Advanced: Edit relevance rules                │     │
│  └─────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│ FastAPI Backend │  │ PostgreSQL 16   │
│ - REST API      │  │ - Grants        │
│ - Ingestion     │  │ - Applications  │
│ - Scoring       │  │ - Org Profiles  │
│ - Static files  │  │                 │
└─────────────────┘  └─────────────────┘
```

## License

Private — Nexus Center for IDD Care
