import time
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, BackgroundTasks
from typing import Optional

from app.middleware.auth import get_current_user
from app.services import gemini, claude, assemblyai
from app.services.supabase_client import get_supabase, save_transcript_to_memory
from app.utils.jobs import cleanup_jobs

router = APIRouter()

TEMP_DIR = Path(__file__).parent.parent.parent / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

_jobs: dict = {}


def _run_ad_pipeline_adult(job_id: str, file_path: str, filename: str, user_id: str, project_id: str | None, niche: str | None, reverse_engineer: bool = False, translate: bool = False):
    """Pipeline para anúncios 18+: AssemblyAI (transcrição) + Claude (formatação).
    Pula análise visual do Gemini que bloqueia conteúdo adulto."""
    try:
        _jobs[job_id] = {"status": "transcribing", "_ts": time.time()}
        transcript = assemblyai.transcribe_file(
            file_path, track_user_id=user_id, operation="transcricao_anuncio", track_project_id=project_id,
        )
        if not transcript:
            raise ValueError("Transcrição retornou vazia.")

        if translate:
            _jobs[job_id] = {"status": "translating", "_ts": time.time()}
            transcript = claude.translate_to_portuguese(transcript, track_user_id=user_id)

        _jobs[job_id] = {"status": "formatting", "_ts": time.time()}
        # SEM IA: split por pontuação (mesma lógica do organic) + body paragrafado
        split = claude.split_hook_body(transcript)
        formatted = {
            "hook": split["hook"],
            "body": split["body"],
            "landing_phrase": "",
        }

        # Engenharia reversa (opcional)
        reverse_engineering = None
        if reverse_engineer:
            _jobs[job_id] = {"status": "reverse_engineering", "_ts": time.time()}
            reverse_engineering = claude.reverse_engineer_ad(
                hook=formatted.get("hook", ""),
                body=formatted.get("body", ""),
                landing_phrase=formatted.get("landing_phrase", ""),
            )

        _jobs[job_id] = {"status": "saving", "_ts": time.time()}
        title = Path(filename).stem
        sb = get_supabase()
        record = sb.table("transcriptions").insert({
            "user_id": user_id,
            "project_id": project_id,
            "type": "ad",
            "source_filename": filename,
            "title": title,
            "niche": niche,
            "hook": formatted["hook"],
            "landing_phrase": formatted["landing_phrase"],
            "body": formatted["body"],
            "metadata": {
                "adult": True,
                "transcription_engine": "assemblyai",
                "reverse_engineering": reverse_engineering,
            },
        }).execute()

        # Auto-salva na memória do projeto
        ad_content = f"## Hook\n{formatted['hook']}\n\n## Corpo\n{formatted['body']}"
        if reverse_engineering:
            ad_content += f"\n\n## Engenharia Reversa\n{reverse_engineering}"
        save_transcript_to_memory(project_id, "transcript_ad", title, ad_content, {"filename": filename, "niche": niche, "adult": True})
        if reverse_engineering:
            save_transcript_to_memory(project_id, "ad_analysis", f"{title} — Engenharia Reversa", reverse_engineering, {"filename": filename, "niche": niche})

        try:
            Path(file_path).unlink()
        except OSError:
            pass

        _jobs[job_id] = {
            "status": "done",
            "_ts": time.time(),
            "result": {
                "id": record.data[0].get("id") if record.data else None,
                "title": title,
                "duration": "—",
                "avatar": {},
                "video_format": "Anúncio 18+",
                "editing": {},
                "hook_visual": "(análise visual não disponível para conteúdo 18+)",
                "hook_written": formatted["hook"],
                "landing_phrase": formatted["landing_phrase"],
                "body": formatted["body"],
                "reverse_engineering": reverse_engineering,
                "adult": True,
            },
        }
    except Exception as exc:
        _jobs[job_id] = {"status": "error", "_ts": time.time(), "error": str(exc)}


def _run_ad_pipeline(job_id: str, file_path: str, filename: str, user_id: str, project_id: str | None, niche: str | None, reverse_engineer: bool = False, translate: bool = False):
    try:
        _jobs[job_id] = {"status": "analyzing", "_ts": time.time()}
        result = gemini.analyze_ad(
            file_path, track_user_id=user_id, operation="analise_anuncio", track_project_id=project_id,
        )

        if translate:
            _jobs[job_id] = {"status": "translating", "_ts": time.time()}
            result["hook_written"]   = claude.translate_to_portuguese(result.get("hook_written", ""), track_user_id=user_id)
            result["landing_phrase"] = claude.translate_to_portuguese(result.get("landing_phrase", ""), track_user_id=user_id)
            result["body"]           = claude.translate_to_portuguese(result.get("body", ""), track_user_id=user_id)
            result["hook_visual"]    = claude.translate_to_portuguese(result.get("hook_visual", ""), track_user_id=user_id)

        # Formata o body em parágrafos de 1-2 frases (Gemini retorna texto corrido)
        if result.get("body"):
            result["body"] = claude._break_into_paragraphs(result["body"])

        # Engenharia reversa (opcional)
        reverse_engineering = None
        if reverse_engineer:
            _jobs[job_id] = {"status": "reverse_engineering"}
            reverse_engineering = claude.reverse_engineer_ad(
                hook=result.get("hook_written", ""),
                body=result.get("body", ""),
                landing_phrase=result.get("landing_phrase", ""),
            )

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
                "reverse_engineering": reverse_engineering,
            },
        }).execute()

        # Auto-salva na memória do projeto
        ad_content = f"## Hook\n{result['hook_written']}\n\n## Corpo\n{result['body']}"
        save_transcript_to_memory(project_id, "transcript_ad", result["title"], ad_content, {"filename": filename, "niche": niche})
        if reverse_engineering:
            save_transcript_to_memory(project_id, "ad_analysis", f"{result['title']} — Engenharia Reversa", reverse_engineering, {"filename": filename, "niche": niche})

        try:
            Path(file_path).unlink()
        except OSError:
            pass

        _jobs[job_id] = {
            "status": "done",
            "_ts": time.time(),
            "result": {
                "id": record.data[0].get("id") if record.data else None,
                **result,
                "reverse_engineering": reverse_engineering,
            },
        }
    except Exception as exc:
        _jobs[job_id] = {"status": "error", "_ts": time.time(), "error": str(exc)}


@router.post("/analyze")
async def analyze_ad_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    project_id: Optional[str] = Form(None),
    niche: Optional[str] = Form(None),
    reverse_engineer: Optional[str] = Form(None),
    adult: Optional[str] = Form(None),
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
    do_reverse = reverse_engineer in ("true", "1", "yes")
    is_adult = adult in ("true", "1", "yes")
    do_translate = translate in ("true", "1", "yes")

    # Escolhe o pipeline: 18+ usa AssemblyAI; padrão usa Gemini
    pipeline = _run_ad_pipeline_adult if is_adult else _run_ad_pipeline

    _jobs[job_id] = {"status": "queued", "_ts": time.time()}
    background_tasks.add_task(
        pipeline,
        job_id, file_path, file.filename, current_user.id, project_id, niche, do_reverse, do_translate,
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
