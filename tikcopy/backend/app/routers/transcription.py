import time
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, BackgroundTasks
from typing import Optional

from app.models.schemas import TranscribeUrlRequest
from app.middleware.auth import get_current_user
from app.services import ytdlp, assemblyai, claude
from app.services.supabase_client import get_supabase, save_transcription, save_transcript_to_memory
from app.utils.jobs import cleanup_jobs

router = APIRouter()

TEMP_DIR = Path(__file__).parent.parent.parent / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# In-memory job store (limpo via TTL — ver app/utils/jobs.py)
_jobs: dict = {}


def _run_url_pipeline(job_id: str, url: str, user_id: str, project_id: str | None, niche: str | None, translate: bool = False):
    try:
        transcript = None
        title = None
        metrics = {}
        audio_path = None

        # YouTube: tenta a LEGENDA primeiro (sem baixar — fura bloqueio de datacenter, de graça)
        if ytdlp.is_youtube(url):
            _jobs[job_id] = {"status": "transcribing"}
            cap = ytdlp.fetch_youtube_transcript(url)
            if cap:
                transcript = cap
                title = ytdlp.youtube_title(url) or "Vídeo do YouTube"

        # Sem legenda (ou TikTok/Instagram): baixa o áudio e transcreve (AssemblyAI)
        if not transcript:
            _jobs[job_id] = {"status": "downloading"}
            audio_path, title, metrics = ytdlp.download_audio(url, job_id)
            _jobs[job_id] = {"status": "transcribing"}
            transcript = assemblyai.transcribe_file(audio_path, track_user_id=user_id, operation="transcricao_organico", track_project_id=project_id)

        if not transcript:
            raise ValueError("Transcrição retornou vazia.")

        if translate:
            _jobs[job_id] = {"status": "translating"}
            transcript = claude.translate_to_portuguese(transcript, track_user_id=user_id)

        # Split hook + body SEM IA (só por pontuação) + transcript paragrafado completo
        split = claude.split_hook_body(transcript)
        transcript_paragraphed = claude._break_into_paragraphs(transcript)

        _jobs[job_id] = {"status": "saving"}
        record = save_transcription({
            "user_id": user_id,
            "project_id": project_id,
            "type": "organic",
            "source_url": url,
            "title": title,
            "niche": niche,
            "transcript_full": transcript_paragraphed,
            "hook": split["hook"],
            "body": split["body"],
            "metadata": metrics,
        })

        # Memória do projeto: hook + body em markdown
        org_content = (
            f"## Hook\n{split['hook']}\n\n"
            f"## Body\n{split['body']}"
        )
        save_transcript_to_memory(project_id, "transcript_organic", title, org_content, {"source_url": url, "niche": niche})

        if audio_path:
            try:
                Path(audio_path).unlink()
            except OSError:
                pass

        _jobs[job_id] = {
            "status": "done",
            "_ts": time.time(),
            "result": {
                "id": record.get("id"),
                "title": title,
                "source_url": url,
                "hook": split["hook"],
                "body": split["body"],
                "transcript_full": transcript_paragraphed,
                "metadata": metrics,
            },
        }
    except Exception as exc:
        _jobs[job_id] = {"status": "error", "_ts": time.time(), "error": str(exc)}


def _run_upload_pipeline(job_id: str, file_path: str, filename: str, user_id: str, project_id: str | None, niche: str | None, lesson: bool, translate: bool = False):
    try:
        _jobs[job_id] = {"status": "transcribing"}
        transcript = assemblyai.transcribe_file(file_path, track_user_id=user_id, operation="transcricao_organico", track_project_id=project_id)
        if not transcript:
            raise ValueError("Transcrição retornou vazia.")

        if translate:
            _jobs[job_id] = {"status": "translating"}
            transcript = claude.translate_to_portuguese(transcript, track_user_id=user_id)

        # Sem IA: só paragrafa o transcript pra leitura + split hook/body por pontuação
        transcript_paragraphed = claude._break_into_paragraphs(transcript) if not lesson else transcript
        split = claude.split_hook_body(transcript) if not lesson else {"hook": "", "body": ""}

        title = Path(filename).stem
        record_data = {
            "user_id": user_id,
            "project_id": project_id,
            "type": "lesson" if lesson else "organic",
            "source_filename": filename,
            "title": title,
            "niche": niche,
            "transcript_full": transcript_paragraphed,
        }
        if not lesson:
            record_data["hook"] = split["hook"]
            record_data["body"] = split["body"]

        _jobs[job_id] = {"status": "saving"}
        record = save_transcription(record_data)

        if lesson:
            save_transcript_to_memory(project_id, "transcript_lesson", title, transcript, {"filename": filename})
        else:
            org_content = f"## Hook\n{split['hook']}\n\n## Body\n{split['body']}"
            save_transcript_to_memory(project_id, "transcript_organic", title, org_content, {"filename": filename, "niche": niche})

        try:
            Path(file_path).unlink()
        except OSError:
            pass

        result = {"id": record.get("id"), "title": title, "transcript_full": transcript_paragraphed}
        if not lesson:
            result["hook"] = split["hook"]
            result["body"] = split["body"]
        _jobs[job_id] = {"status": "done", "_ts": time.time(), "result": result}
    except Exception as exc:
        _jobs[job_id] = {"status": "error", "_ts": time.time(), "error": str(exc)}


@router.post("/url")
async def transcribe_url(
    body: TranscribeUrlRequest,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
):
    job_id = str(uuid.uuid4())
    cleanup_jobs(_jobs)
    _jobs[job_id] = {"status": "queued", "_ts": time.time()}
    background_tasks.add_task(
        _run_url_pipeline,
        job_id, body.url, current_user.id, body.project_id, body.niche, bool(body.translate),
    )
    return {"job_id": job_id}


@router.post("/upload")
async def transcribe_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    project_id: Optional[str] = Form(None),
    niche: Optional[str] = Form(None),
    translate: Optional[str] = Form(None),
    current_user=Depends(get_current_user),
):
    job_id = str(uuid.uuid4())
    suffix = Path(file.filename).suffix.lower()
    file_path = str(TEMP_DIR / f"{job_id}{suffix}")
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    cleanup_jobs(_jobs)
    do_translate = translate in ("true", "1", "yes")
    _jobs[job_id] = {"status": "queued", "_ts": time.time()}
    background_tasks.add_task(
        _run_upload_pipeline,
        job_id, file_path, file.filename, current_user.id, project_id, niche, False, do_translate,
    )
    return {"job_id": job_id}


@router.post("/lesson")
async def transcribe_lesson(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    project_id: Optional[str] = Form(None),
    translate: Optional[str] = Form(None),
    current_user=Depends(get_current_user),
):
    job_id = str(uuid.uuid4())
    suffix = Path(file.filename).suffix.lower()
    file_path = str(TEMP_DIR / f"{job_id}{suffix}")
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    cleanup_jobs(_jobs)
    do_translate = translate in ("true", "1", "yes")
    _jobs[job_id] = {"status": "queued", "_ts": time.time()}
    background_tasks.add_task(
        _run_upload_pipeline,
        job_id, file_path, file.filename, current_user.id, project_id, None, True, do_translate,
    )
    return {"job_id": job_id}


@router.get("/cookies-status")
async def cookies_status():
    """Verifica se cookies.txt está configurado pro yt-dlp."""
    from app.services import ytdlp
    return {
        "configured": ytdlp.has_cookies_file(),
        "path": str(ytdlp.COOKIES_FILE),
        "instruction": (
            "Pra TikTok funcionar sem bloqueios: instale a extensão "
            "'Get cookies.txt LOCALLY' no Brave/Chrome, vá em tiktok.com (logado), "
            "exporte cookies.txt e salve em " + str(ytdlp.COOKIES_FILE)
        ) if not ytdlp.has_cookies_file() else "Cookies.txt configurado! 🎉"
    }


@router.get("/status/{job_id}")
async def get_job_status(job_id: str):
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return job


@router.get("/history")
async def get_history(current_user=Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("transcriptions")
        .select("id, title, type, source_url, source_filename, niche, hook, created_at")
        .eq("user_id", current_user.id)
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return res.data or []


@router.get("/{transcription_id}")
async def get_transcription(transcription_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("transcriptions")
        .select("*")
        .eq("id", transcription_id)
        .eq("user_id", current_user.id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Transcrição não encontrada")
    return res.data


@router.delete("/{transcription_id}")
async def delete_transcription(transcription_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    sb.table("transcriptions").delete().eq("id", transcription_id).eq("user_id", current_user.id).execute()
    return {"ok": True}
