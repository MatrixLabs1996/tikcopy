import time
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, BackgroundTasks
from typing import Optional

from app.middleware.auth import get_current_user
from app.services import assemblyai, claude
from app.services.supabase_client import get_supabase, save_transcript_to_memory
from app.utils.jobs import cleanup_jobs

router = APIRouter()

TEMP_DIR = Path(__file__).parent.parent.parent / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

_jobs: dict = {}


def _run_vsl_pipeline(job_id: str, file_path: str, filename: str, user_id: str, project_id: str | None, niche: str | None = None, translate: bool = False):
    try:
        _jobs[job_id] = {"status": "transcribing"}
        transcript = assemblyai.transcribe_file(file_path)
        if not transcript:
            raise ValueError("Transcrição retornou vazia.")

        if translate:
            _jobs[job_id] = {"status": "translating"}
            transcript = claude.translate_to_portuguese(transcript)

        _jobs[job_id] = {"status": "analyzing"}
        analysis = claude.analyze_vsl_rmbc(transcript)

        _jobs[job_id] = {"status": "saving"}
        sb = get_supabase()
        title = analysis.get("bloco1_titulo", Path(filename).stem)
        record = sb.table("transcriptions").insert({
            "user_id": user_id,
            "project_id": project_id,
            "type": "vsl",
            "source_filename": filename,
            "title": title,
            "niche": niche,
            "body": transcript,
            "metadata": {"rmbc_analysis": analysis},
        }).execute()

        # Auto-salva análise RMBC + transcript na memória do projeto
        analysis_text = "\n\n".join([f"## {k}\n{v}" for k, v in analysis.items() if v and k != 'bloco1_titulo'])
        save_transcript_to_memory(project_id, "vsl_analysis", title, analysis_text, {"filename": filename, "niche": niche})
        save_transcript_to_memory(project_id, "transcript_vsl", f"{title} — transcrição", transcript, {"filename": filename})

        try:
            Path(file_path).unlink()
        except OSError:
            pass

        _jobs[job_id] = {
            "status": "done",
            "_ts": time.time(),
            "result": {
                "id": record.data[0].get("id") if record.data else None,
                "filename": filename,
                "transcript": transcript,
                "analysis": analysis,
            },
        }
    except Exception as exc:
        _jobs[job_id] = {"status": "error", "_ts": time.time(), "error": str(exc)}


def _run_vsl_compare_pipeline(
    job_id: str,
    transcript1: str, name1: str,
    transcript2: str, name2: str,
    user_id: str, project_id: str | None,
):
    try:
        _jobs[job_id] = {"status": "analyzing_vsl1"}
        analysis1 = claude.analyze_vsl_rmbc(transcript1)

        _jobs[job_id] = {"status": "analyzing_vsl2"}
        analysis2 = claude.analyze_vsl_rmbc(transcript2)

        _jobs[job_id] = {"status": "comparing"}
        comparison = claude.compare_vsls_rmbc(analysis1, analysis2, name1, name2)

        _jobs[job_id] = {
            "status": "done",
            "_ts": time.time(),
            "result": {
                "vsl1": {"name": name1, "analysis": analysis1},
                "vsl2": {"name": name2, "analysis": analysis2},
                "comparison": comparison,
            },
        }
    except Exception as exc:
        _jobs[job_id] = {"status": "error", "_ts": time.time(), "error": str(exc)}


@router.post("/analyze")
async def analyze_vsl(
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
        _run_vsl_pipeline,
        job_id, file_path, file.filename, current_user.id, project_id, niche, do_translate,
    )
    return {"job_id": job_id}


@router.post("/compare")
async def compare_vsls(
    background_tasks: BackgroundTasks,
    transcript1: str = Form(...),
    transcript2: str = Form(...),
    name1: Optional[str] = Form("VSL 1"),
    name2: Optional[str] = Form("VSL 2"),
    project_id: Optional[str] = Form(None),
    current_user=Depends(get_current_user),
):
    job_id = str(uuid.uuid4())
    cleanup_jobs(_jobs)
    _jobs[job_id] = {"status": "queued", "_ts": time.time()}
    background_tasks.add_task(
        _run_vsl_compare_pipeline,
        job_id, transcript1, name1, transcript2, name2, current_user.id, project_id,
    )
    return {"job_id": job_id}


@router.get("/status/{job_id}")
async def get_vsl_status(job_id: str):
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return job


@router.get("/history")
async def get_vsl_history(current_user=Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("transcriptions")
        .select("id, title, source_filename, metadata, created_at")
        .eq("user_id", current_user.id)
        .eq("type", "vsl")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return res.data or []
