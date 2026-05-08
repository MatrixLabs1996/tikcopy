from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, transcription, ads, projects, copy_zone, templates, drafts, briefings, researches

app = FastAPI(title="TikCopy API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://tikcopy.com.br",
        "https://www.tikcopy.com.br",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(transcription.router, prefix="/transcribe", tags=["transcription"])
app.include_router(ads.router, prefix="/ads", tags=["ads"])
app.include_router(copy_zone.router, prefix="/copy-zone", tags=["copy-zone"])
app.include_router(templates.router, prefix="/templates", tags=["templates"])
app.include_router(drafts.router, prefix="/drafts", tags=["drafts"])
app.include_router(briefings.router, prefix="/briefings", tags=["briefings"])
app.include_router(researches.router, prefix="/researches", tags=["researches"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}
