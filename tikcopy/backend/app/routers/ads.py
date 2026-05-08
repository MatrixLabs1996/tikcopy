import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, BackgroundTasks
from typing import Optional

from app.middleware.auth import get_current_user
from app.services import gemini
from app.services.supabase_client import get_supabase

router = APIRouter()

TEMP_DIR = Path("/tmp/tikcopy")
TEMP_DIR.mkdir(parents=True, exist_ok=True)

_jobs: dict = {}


def _run_ad_pipeline(job_id: str, file_path: str, filename: str, user_id: str, project_id: str | None, niche: str | None):
    try:
        _jobs[job_id] = {"status": "analyzing"}
        result = gemini.analyze_ad(file_path)

        _jobs[job_id] = {"status": "saving"}
        sb = get_supabase()
        record = sb.table("transcriptions").insert({
            "user_id": user_id,
            "project_id": project_id,
            "type": "ad",
            "source_filename": filename,
            "title": result["title"],
            "niche": niche,
            "hook": result["hook_written"],
            "landing_phrase": result["landing_phrase"],
            "body": result["body"],
            "metadata": {
                "duration": result["duration"],
                "avatar": result["avatar"],
                "video_format": result["video_format"],
                "editing": result["editing"],
                "hook_visual": result["hook_visual"],
            },
        }).execute()

        try:
            Path(file_path).unlink()
        except OSError:
            pass

        _jobs[job_id] = {
            "status": "done",
            "result": {
                "id": record.data[0].get("id") if record.data else None,
                **result,
            },
        }
    except Exception as exc:
        _jobs[job_id] = {"status": "error", "error": str(exc)}


@router.post("/analyze")
async def analyze_ad_upload(
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
        _run_ad_pipeline,
        job_id, file_path, file.filename, current_user.id, project_id, niche,
    )
    return {"job_id": job_id}


@router.get("/status/{job_id}")
async def get_ad_status(job_id: str):
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return job


@router.get("/history")
async def get_ad_history(current_user=Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("transcriptions")
        .select("id, title, source_filename, niche, hook, metadata, created_at")
        .eq("user_id", current_user.id)
        .eq("type", "ad")
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return res.data or []
