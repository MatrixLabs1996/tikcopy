import os
from pathlib import Path
from dotenv import load_dotenv

# Carrega .env da raiz do backend antes de qualquer import que use os.environ
load_dotenv(Path(__file__).parent.parent / ".env", override=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, transcription, ads, vsl, projects, copy_zone, templates, drafts, briefings, research_docs, publicos, swipes, intelligence, videos, ai, offers, profile_analysis, admin, brainstorm

app = FastAPI(title="TikCopy API", version="2.0.0")

# Origens permitidas: localhost (dev) + domínios de produção (fixos) +
# qualquer URL extra via env CORS_ORIGINS (lista separada por vírgula).
# Também libera qualquer subdomínio *.vercel.app por regex (deploys de preview).
_default_origins = [
    "http://localhost:5173",
    "https://tikcopy.com.br",
    "https://www.tikcopy.com.br",
]
_env_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins + _env_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(transcription.router, prefix="/transcribe", tags=["transcription"])
app.include_router(ads.router, prefix="/ads", tags=["ads"])
app.include_router(vsl.router, prefix="/vsl", tags=["vsl"])
app.include_router(copy_zone.router, prefix="/copy-zone", tags=["copy-zone"])
app.include_router(templates.router, prefix="/templates", tags=["templates"])
app.include_router(drafts.router, prefix="/drafts", tags=["drafts"])
app.include_router(briefings.router, prefix="/briefings", tags=["briefings"])
app.include_router(offers.router, prefix="/offers", tags=["offers"])
app.include_router(research_docs.router, prefix="/research-docs", tags=["research-docs"])
app.include_router(publicos.router, prefix="/publicos", tags=["publicos"])
app.include_router(swipes.router, prefix="/swipes", tags=["swipes"])
app.include_router(intelligence.router, prefix="/intelligence", tags=["intelligence"])
app.include_router(videos.router, prefix="/videos", tags=["videos"])
app.include_router(ai.router, prefix="/ai", tags=["ai"])
app.include_router(profile_analysis.router, prefix="/profile-analysis", tags=["profile-analysis"])
app.include_router(brainstorm.router, prefix="/brainstorm", tags=["brainstorm"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}
