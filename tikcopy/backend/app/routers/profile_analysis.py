"""
Raio-X de Perfil — lista os vídeos mais virais de um perfil (YouTube) e entrega
thumb + headline (título) + link + comentários. A IA cruza as headlines e a voz
da audiência (comentários) num documento de padrões. NÃO baixa nem transcreve vídeo.

Pipeline assíncrono por job (mesmo padrão de transcription.py).
"""
import time
import uuid
import logging
from urllib.parse import urlparse
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks

from app.models.schemas import ProfileAnalysisRequest
from app.middleware.auth import get_current_user
from app.services import ytdlp, claude, youtube_api
from app.utils.jobs import cleanup_jobs

logger = logging.getLogger(__name__)

router = APIRouter()


def _is_youtube(url: str) -> bool:
    host = urlparse(url if "://" in url else f"https://{url}").netloc.lower()
    return "youtube.com" in host or "youtu.be" in host

# In-memory job store (TTL via cleanup_jobs)
_jobs: dict = {}

# Limites de segurança
MAX_TOP_N = 10
# Quantos vídeos recentes varrer pra rankear por views. Cada um é um fetch de
# metadata (~1-2s), então mantemos baixo. "Top views" = dentre os ~40 mais recentes.
SCAN_LIMIT = 40
# Teto de comentários lidos POR vídeo (lê tudo até esse limite, paginando).
# Protege contra vídeos com dezenas de milhares de comentários.
COMMENTS_PER_VIDEO_CAP = 3000


def _run_profile_pipeline(job_id: str, url: str, top_n: int, niche: str | None, translate: bool, include_comments: bool = True, theme: str | None = None, rank_by: str = "views", video_type: str = "both", user_id: str | None = None):
    try:
        top_n = max(1, min(int(top_n or 5), MAX_TOP_N))
        theme = (theme or "").strip() or None
        rank_by = rank_by if rank_by in ("views", "relevance") else "views"
        video_type = video_type if video_type in ("both", "long", "shorts") else "both"

        # ── 1. Listar vídeos do perfil ──
        _jobs[job_id] = {"status": "listing", "_ts": time.time()}
        author = ""
        top = []

        # Caminho preferencial: YouTube Data API (top por views absolutas, rápido)
        if youtube_api.is_configured() and _is_youtube(url):
            try:
                top, author = youtube_api.list_top_videos(url, top_n, query=theme, rank_by=rank_by, video_type=video_type)
            except Exception as exc:
                logger.warning(f"[profile-analysis] YouTube API falhou, usando yt-dlp: {exc}")
                top = []

        # Fallback: yt-dlp varre os recentes e rankeia por views
        if not top:
            videos = ytdlp.list_profile_videos(url, scan_limit=SCAN_LIMIT)
            if not videos:
                raise ValueError("Nenhum vídeo encontrado neste perfil.")
            # Sem API oficial, o filtro de tema é best-effort pelo título
            if theme:
                words = [w for w in theme.lower().split() if len(w) > 2]
                filtered = [v for v in videos if any(w in (v.get("title") or "").lower() for w in words)]
                if filtered:
                    videos = filtered
            top = sorted(videos, key=lambda v: v.get("view_count") or 0, reverse=True)[:top_n]

        if not top:
            raise ValueError(
                f"Nenhum vídeo encontrado sobre \"{theme}\" neste perfil." if theme
                else "Nenhum vídeo encontrado neste perfil."
            )

        # ── 2. Monta a lista dos melhores (thumb, headline, link) — SEM baixar/transcrever ──
        # O título do vídeo É a headline. A análise vem das headlines + comentários (voz da audiência).
        analyzed = []
        for v in top:
            analyzed.append({
                "id": v.get("id"),
                "title": v.get("title") or "Sem título",   # headline
                "url": v["url"],
                "metrics": {"views": ytdlp._fmt_num(v.get("view_count"))},
                "thumbnail": v.get("thumbnail"),
                "description": v.get("description") or "",
                "velocity": v.get("velocity"),
                "top_comments": [],
            })
        if not author:
            import re as _re
            mm = _re.search(r'@([A-Za-z0-9_.\-]+)', url or '')
            author = mm.group(1) if mm else (niche or "Perfil")

        # ── 3. Comentários (voz da audiência) — lê TUDO (paginado, com teto) ──
        comment_pool = []
        if include_comments and youtube_api.is_configured():
            for i, v in enumerate(analyzed, 1):
                if not v.get("id"):
                    continue
                _jobs[job_id] = {
                    "status": "reading_comments", "_ts": time.time(),
                    "progress": {"current": i, "total": len(analyzed), "title": v.get("title")},
                }
                comments = youtube_api.list_all_video_comments(v["id"], max_total=COMMENTS_PER_VIDEO_CAP)
                v["comment_count"] = len(comments)
                # guarda os mais curtidos pra exibir/curar no card (a IA lê todos)
                v["top_comments"] = sorted(comments, key=lambda c: c.get("likes") or 0, reverse=True)[:150]
                comment_pool.extend(comments)

        # ── 4. Analisar padrões + voz da audiência ──
        _jobs[job_id] = {"status": "analyzing", "_ts": time.time()}
        document = claude.analyze_profile_patterns(analyzed, author=author, track_user_id=user_id)
        if comment_pool:
            voc = claude.analyze_audience_voice(comment_pool, niche=niche or "", author=author, track_user_id=user_id)
            if voc:
                document = f"{document}\n\n{voc}"

        # ── 5. Pronto ──
        _jobs[job_id] = {
            "status": "done",
            "_ts": time.time(),
            "result": {
                "author": author,
                "niche": niche,
                "document": document,
                "videos": analyzed,
            },
        }
    except Exception as exc:
        _jobs[job_id] = {"status": "error", "_ts": time.time(), "error": str(exc)}


@router.post("/start")
async def start_profile_analysis(
    body: ProfileAnalysisRequest,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
):
    if not (body.url or "").strip():
        raise HTTPException(status_code=400, detail="Informe a URL do perfil.")
    job_id = str(uuid.uuid4())
    cleanup_jobs(_jobs)
    _jobs[job_id] = {"status": "queued", "_ts": time.time()}
    background_tasks.add_task(
        _run_profile_pipeline,
        job_id, body.url.strip(), body.top_n, body.niche, bool(body.translate),
        bool(body.include_comments), body.theme, body.rank_by or "views", body.video_type or "both",
        current_user.id,
    )
    return {"job_id": job_id}


@router.get("/status/{job_id}")
async def get_profile_job_status(job_id: str):
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return job
