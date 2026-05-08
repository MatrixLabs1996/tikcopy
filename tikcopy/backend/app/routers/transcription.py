import uuid
import asyncio
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, BackgroundTasks
from typing import Optional

from app.models.schemas import TranscribeUrlRequest
from app.middleware.auth import get_current_user
from app.services import ytdlp, assemblyai, claude
from app.services.supabase_client import get_supabase, save_transcription

router = APIRouter()

TEMP_DIR = Path("/tmp/tikcopy")
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# In-memory job store (replace with Redis in production)
_jobs: dict = {}


def _run_url_pipeline(job_id: str, url: str, user_id: str, project_id: str | None, niche: str | None):
    try:
        _jobs[job_id] = {"status": "downloading"}
        audio_path, title, metrics = ytdlp.download_audio(url, job_id)

        _jobs[job_id] = {"status": "transcribing"}
        transcript = assemblyai.transcribe_file(audio_path)
        if not transcript:
            raise ValueError("Transcrição retornou vazia.")

        _jobs[job_id] = {"status": "formatting"}
        formatted = claude.format_organic(transcript)

        _jobs[job_id] = {"status": "saving"}
        record = save_transcription({
            "user_id": user_id,
            "project_id": project_id,
            "type": "organic",
            "source_url": url,
            "title": title,
            "niche": niche,
            "transcript_full": transcript,
            "hook": formatted["hook"],
            "landing_phrase": formatted["landing_phrase"],
            "body": formatted["body"],
            "metadata": metrics,
        })

        try:
            Path(audio_path).unlink()
        except OSError:
            pass

        _jobs[job_id] = {
            "status": "done",
            "result": {
                "id": record.get("id"),
                "title": title,
                "hook": formatted["hook"],
                "landing_phrase": formatted["landing_phrase"],
                "body": formatted["body"],
                "transcript_full": transcript,
                "metadata": metrics,
            },
        }
    except Exception as exc:
        _jobs[job_id] = {"status": "error", "error": str(exc)}


def _run_upload_pipeline(job_id: str, file_path: str, filename: str, user_id: str, project_id: str | None, niche: str | None, lesson: bool):
    try:
        _jobs[job_id] = {"status": "transcribing"}
        transcript = assemblyai.transcribe_file(file_path)
        if not transcript:
            raise ValueError("Transcrição retornou vazia.")

        title = Path(filename).stem
        record_data = {
            "user_id": user_id,
            "project_id": project_id,
            "type": "lesson" if lesson else "organic",
            "source_filename": filename,
            "title": title,
            "niche": niche,
            "transcript_full": transcript,
        }

        if not lesson:
            _jobs[job_id] = {"status": "formatting"}
            formatted = claude.format_organic(transcript)
            record_data.update({
                "hook": formatted["hook"],
                "landing_phrase": formatted["landing_phrase"],
                "body": formatted["body"],
            })

        _jobs[job_id] = {"status": "saving"}
        record = save_transcription(record_data)

        try:
            Path(file_path).unlink()
        except OSError:
            pass

        result = {"id": record.get("id"), "title": title, "transcript_full": transcript}
        if not lesson:
            result.update({
                "hook": record_data.get("hook", ""),
                "landing_phrase": record_data.get("landing_phrase", ""),
                "body": record_data.get("body", ""),
            })

        _jobs[job_id] = {"status": "done", "result": result}
    except Exception as exc:
        _jobs[job_id] = {"status": "error", "error": str(exc)}


@router.post("/url")
async def transcribe_url(
    body: TranscribeUrlRequest,
    background_tasks: BackgroundTasks,
    current_user=Depends(get_current_user),
):
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"status": "queued"}
    background_tasks.add_task(
        _run_url_pipeline,
        job_id, body.url, current_user.id, body.project_id, body.niche,
    )
    return {"job_id": job_id}


@router.post("/upload")
async def transcribe_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    project_id: Optional[str] = Form(None),
    niche: Optional[str] = Form(None),
    current_user=Depends(get_current_user),
):
    job_id = str(uuid.uuid4())
    suffix = Path(file.filename).suffix.lower()
    file_path = str(TEMP_DIR / f"{job_id}{suffix}")
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    _jobs[job_id] = {"status": "queued"}
    background_tasks.add_task(
        _run_upload_pipeline,
        job_id, file_path, file.filename, current_user.id, project_id, niche, False,
    )
    return {"job_id": job_id}


@router.post("/lesson")
async def transcribe_lesson(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    project_id: Optional[str] = Form(None),
    current_user=Depends(get_current_user),
):
    job_id = str(uuid.uuid4())
    suffix = Path(file.filename).suffix.lower()
    file_path = str(TEMP_DIR / f"{job_id}{suffix}")
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    _jobs[job_id] = {"status": "queued"}
    background_tasks.add_task(
        _run_upload_pipeline,
        job_id, file_path, file.filename, current_user.id, project_id, None, True,
    )
    return {"job_id": job_id}


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
