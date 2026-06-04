# TikCopy v2 — React + FastAPI + Supabase

## Rodando localmente

### 1. Supabase
1. Crie um projeto em [supabase.com](https://supabase.com)
2. No SQL Editor, execute o arquivo `supabase/migrations/001_initial_schema.sql`
3. Copie as credenciais do projeto (URL, anon key, service key)

### 2. Backend (FastAPI)

```bash
cd backend

# Crie um ambiente virtual
python -m venv .venv
.venv\Scripts\activate   # Windows
# ou: source .venv/bin/activate  (Mac/Linux)

# Instale dependências
pip install -r requirements.txt

# Configure variáveis de ambiente
copy .env.example .env
# Edite .env com suas chaves

# Rode o servidor
uvicorn app.main:app --reload
# API disponível em http://localhost:8000
# Docs interativas em http://localhost:8000/docs
```

### 3. Frontend (React + Vite)

```bash
cd frontend

# Instale dependências
npm install

# Configure variáveis de ambiente
copy .env.example .env
# Edite .env com suas chaves do Supabase

# Rode o dev server
npm run dev
# Interface disponível em http://localhost:5173
```

## Estrutura

```
tikcopy/
├── backend/
│   ├── app/
│   │   ├── main.py              # Entry point FastAPI
│   │   ├── routers/             # Endpoints por feature
│   │   ├── services/            # Lógica de negócio
│   │   │   ├── ytdlp.py         # Download de vídeos
│   │   │   ├── assemblyai.py    # Transcrição
│   │   │   ├── claude.py        # Formatação e geração de copy
│   │   │   └── gemini.py        # Análise de anúncios
│   │   ├── models/schemas.py    # Schemas Pydantic
│   │   └── middleware/auth.py   # Validação JWT Supabase
│   └── requirements.txt
│
├── frontend/
│   └── src/
│       ├── pages/               # Todas as páginas
│       ├── components/          # Layout, Sidebar, Topbar
│       ├── services/            # supabase.js, api.js
│       ├── stores/              # Zustand (auth, projeto, tema)
│       ├── hooks/               # useTranscriptionJob
│       └── styles/tokens.css    # Design tokens CSS
│
└── supabase/
    └── migrations/001_initial_schema.sql
```

## Variáveis de ambiente

### Backend `.env`
| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_KEY` | Service key (não a anon key) |
| `ANTHROPIC_API_KEY` | Claude API |
| `ASSEMBLYAI_KEY` | AssemblyAI |
| `GEMINI_API_KEY` | Google Gemini |

### Frontend `.env`
| Variável | Descrição |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Anon key pública |
| `VITE_API_URL` | URL do backend (default: http://localhost:8000) |

## Deploy

- **Backend**: Railway (conecte o repositório, configure env vars)
- **Frontend**: Vercel (conecte o repositório, pasta `frontend/`, configure env vars)
- **Banco**: Supabase Cloud (já rodando)
