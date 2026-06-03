import time
import uuid
import logging
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
# Jobs que o usuário pediu pra cancelar (checado nos checkpoints dos pipelines)
_cancelled: set = set()


def _is_cancelled(job_id: str) -> bool:
    return job_id in _cancelled


def _finish_cancelled(job_id: str, audio_path: str | None = None):
    """Marca o job como cancelado e limpa arquivo temporário, se houver."""
    if audio_path:
        try:
            Path(audio_path).unlink()
        except OSError:
            pass
    _cancelled.discard(job_id)
    _jobs[job_id] = {"status": "cancelled", "_ts": time.time(), "error": "Cancelado pelo usuário"}


def _run_url_pipeline(job_id: str, url: str, user_id: str, project_id: str | None, niche: str | None, translate: bool = False):
    try:
        transcript = None
        title = None
        metrics = {}
        audio_path = None

        # YouTube: o IP de datacenter do servidor é bloqueado pra download E pra legenda.
        # Solução: manda a URL direto pro Gemini (quem busca o vídeo é o Google, então
        # não tem bloqueio de IP). Sem baixar, sem cookies. Fallback: legenda → download.
        if ytdlp.is_youtube(url):
            _jobs[job_id] = {"status": "transcribing"}
            title = ytdlp.youtube_title(url) or "Vídeo do YouTube"
            # 1) Gemini na URL (caminho principal — fura o bloqueio de datacenter)
            try:
                from app.services import gemini
                transcript = gemini.transcribe_youtube_url(url, track_user_id=user_id, track_project_id=project_id)
            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning(f"[transcription] Gemini-URL falhou ({exc}); tentando legenda")
            # 2) Fallback: legenda do próprio YouTube (de graça, mas costuma bloquear no servidor)
            if not transcript:
                cap = ytdlp.fetch_youtube_transcript(url)
                if cap:
                    transcript = cap

        if _is_cancelled(job_id):
            return _finish_cancelled(job_id, audio_path)

        # Sem legenda (ou TikTok/Instagram): baixa o áudio e transcreve (AssemblyAI)
        if not transcript:
            _jobs[job_id] = {"status": "downloading"}
            audio_path, title, metrics = ytdlp.download_audio(url, job_id)
            if _is_cancelled(job_id):
                return _finish_cancelled(job_id, audio_path)
            _jobs[job_id] = {"status": "transcribing"}
            transcript = assemblyai.transcribe_file(audio_path, track_user_id=user_id, operation="transcricao_organico", track_project_id=project_id, should_cancel=lambda: _is_cancelled(job_id))

        if _is_cancelled(job_id):
            return _finish_cancelled(job_id, audio_path)

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
    except assemblyai.TranscriptionCancelled:
        _finish_cancelled(job_id, audio_path)
    except Exception as exc:
        if _is_cancelled(job_id):
            _finish_cancelled(job_id, audio_path)
        else:
            _jobs[job_id] = {"status": "error", "_ts": time.time(), "error": str(exc)}


def _run_upload_pipeline(job_id: str, file_path: str, filename: str, user_id: str, project_id: str | None, niche: str | None, lesson: bool, translate: bool = False, study_guide: bool = False):
    try:
        if _is_cancelled(job_id):
            return _finish_cancelled(job_id, file_path)
        _jobs[job_id] = {"status": "transcribing"}
        transcript = assemblyai.transcribe_file(file_path, track_user_id=user_id, operation="transcricao_organico", track_project_id=project_id, should_cancel=lambda: _is_cancelled(job_id))
        if not transcript:
            raise ValueError("Transcrição retornou vazia.")

        if _is_cancelled(job_id):
            return _finish_cancelled(job_id, file_path)

        if translate:
            _jobs[job_id] = {"status": "translating"}
            transcript = claude.translate_to_portuguese(transcript, track_user_id=user_id)

        title = Path(filename).stem

        # AULA/PODCAST com "material de estudo" marcado: ORGANIZA todo o conteúdo num
        # guia estruturado e fiel. Sem marcar: só a transcrição pura paragrafada.
        if lesson and study_guide:
            _jobs[job_id] = {"status": "organizing"}
            def _prog(i, n):
                _jobs[job_id] = {"status": "organizing", "progress": {"current": i, "total": n}}
            guide = claude.organize_lesson_content(
                transcript, title=title, niche=niche or "",
                track_user_id=user_id, track_project_id=project_id, progress_cb=_prog,
            )
            # Se o guia falhar por algum motivo, cai pra transcrição crua paragrafada.
            transcript_paragraphed = guide or claude._break_into_paragraphs(transcript)
            split = {"hook": "", "body": ""}
        elif lesson:
            # Aula sem material de estudo: transcrição pura, só paragrafada pra leitura.
            transcript_paragraphed = claude._break_into_paragraphs(transcript)
            split = {"hook": "", "body": ""}
        else:
            # Sem IA: só paragrafa o transcript pra leitura + split hook/body por pontuação
            transcript_paragraphed = claude._break_into_paragraphs(transcript)
            split = claude.split_hook_body(transcript)

        record_data = {
            "user_id": user_id,
            "project_id": project_id,
            "type": "lesson" if lesson else "organic",
            "source_filename": filename,
            "title": title,
            "niche": niche,
            "transcript_full": transcript_paragraphed,
            "metadata": {"raw_transcript": transcript, "study_guide": True} if (lesson and study_guide) else {},
        }
        if not lesson:
            record_data["hook"] = split["hook"]
            record_data["body"] = split["body"]

        _jobs[job_id] = {"status": "saving"}
        record = save_transcription(record_data)

        if lesson:
            save_transcript_to_memory(project_id, "transcript_lesson", title, transcript_paragraphed, {"filename": filename})
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
    except assemblyai.TranscriptionCancelled:
        _finish_cancelled(job_id, file_path)
    except Exception as exc:
        if _is_cancelled(job_id):
            _finish_cancelled(job_id, file_path)
        else:
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
    study_guide: Optional[str] = Form(None),
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
    do_guide = study_guide in ("true", "1", "yes")
    _jobs[job_id] = {"status": "queued", "_ts": time.time()}
    background_tasks.add_task(
        _run_upload_pipeline,
        job_id, file_path, file.filename, current_user.id, project_id, None, True, do_translate, do_guide,
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


@router.post("/cancel/{job_id}")
async def cancel_job(job_id: str, current_user=Depends(get_current_user)):
    """Pede o cancelamento de uma transcrição em andamento. O pipeline checa esse
    sinal nos checkpoints (download, transcrição, organização) e aborta."""
    job = _jobs.get(job_id)
    if job and job.get("status") in ("done", "error", "cancelled"):
        return {"ok": True, "already_finished": True}
    _cancelled.add(job_id)
    if job_id in _jobs:
        _jobs[job_id] = {**_jobs.get(job_id, {}), "status": "cancelling", "_ts": time.time()}
    return {"ok": True}


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


def _run_regenerate_guide(job_id: str, transcription_id: str, user_id: str):
    """Refaz o guia de estudo de uma aula a partir da transcrição CRUA já salva
    (sem re-transcrever). Atualiza o registro e a memória do projeto."""
    try:
        sb = get_supabase()
        rec = (
            sb.table("transcriptions")
            .select("id, title, niche, project_id, metadata")
            .eq("id", transcription_id).eq("user_id", user_id).limit(1).execute()
        )
        row = (rec.data or [None])[0]
        if not row:
            _jobs[job_id] = {"status": "error", "_ts": time.time(), "error": "Transcrição não encontrada"}
            return
        raw = (row.get("metadata") or {}).get("raw_transcript") or ""
        if not raw.strip():
            _jobs[job_id] = {"status": "error", "_ts": time.time(), "error": "Transcrição crua não disponível para regenerar"}
            return

        _jobs[job_id] = {"status": "organizing", "_ts": time.time()}
        def _prog(i, n):
            _jobs[job_id] = {"status": "organizing", "_ts": time.time(), "progress": {"current": i, "total": n}}
        guide = claude.organize_lesson_content(
            raw, title=row.get("title") or "Aula", niche=row.get("niche") or "",
            track_user_id=user_id, track_project_id=row.get("project_id"), progress_cb=_prog,
        )
        if not guide:
            _jobs[job_id] = {"status": "error", "_ts": time.time(), "error": "Não foi possível gerar o material"}
            return

        _jobs[job_id] = {"status": "saving", "_ts": time.time()}
        sb.table("transcriptions").update({"transcript_full": guide}).eq("id", transcription_id).eq("user_id", user_id).execute()
        # Atualiza a cópia na memória do projeto
        if row.get("project_id") and row.get("title"):
            try:
                (
                    sb.table("project_memory").update({"content": guide})
                    .eq("project_id", row["project_id"]).eq("type", "transcript_lesson")
                    .eq("metadata->>title", row["title"]).execute()
                )
            except Exception:
                pass
        _jobs[job_id] = {"status": "done", "_ts": time.time(), "result": {"id": transcription_id}}
    except Exception as exc:
        _jobs[job_id] = {"status": "error", "_ts": time.time(), "error": str(exc)}


@router.post("/lessons/{transcription_id}/regenerate")
async def regenerate_lesson_guide(transcription_id: str, background_tasks: BackgroundTasks, current_user=Depends(get_current_user)):
    """Dispara a regeneração do guia de estudo (job em background)."""
    job_id = str(uuid.uuid4())
    cleanup_jobs(_jobs)
    _jobs[job_id] = {"status": "queued", "_ts": time.time()}
    background_tasks.add_task(_run_regenerate_guide, job_id, transcription_id, current_user.id)
    return {"job_id": job_id}


@router.get("/lessons/list")
async def list_lessons(current_user=Depends(get_current_user)):
    """Biblioteca de Conteúdo: todos os guias de aula/podcast do usuário (nível conta)."""
    sb = get_supabase()
    res = (
        sb.table("transcriptions")
        .select("id, title, niche, project_id, created_at")
        .eq("user_id", current_user.id)
        .eq("type", "lesson")
        .order("created_at", desc=True)
        .limit(300)
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
    """Exclui a transcrição/guia E a cópia dela na memória do projeto (que alimenta a
    IA). Assim 'excluir' realmente apaga do banco, não deixa rastro feeding a IA."""
    sb = get_supabase()
    # Pega o registro antes de apagar (pra achar a cópia na memória do projeto)
    rec = (
        sb.table("transcriptions")
        .select("id, project_id, title, type")
        .eq("id", transcription_id)
        .eq("user_id", current_user.id)
        .limit(1)
        .execute()
    )
    row = (rec.data or [None])[0]

    sb.table("transcriptions").delete().eq("id", transcription_id).eq("user_id", current_user.id).execute()

    # Remove a cópia na memória do projeto (project_memory), casando por
    # project_id + título + tipo de memória (transcript_organic / transcript_lesson).
    if row and row.get("project_id") and row.get("title"):
        mem_type = "transcript_lesson" if row.get("type") == "lesson" else "transcript_organic"
        try:
            (
                sb.table("project_memory").delete()
                .eq("project_id", row["project_id"])
                .eq("type", mem_type)
                .eq("metadata->>title", row["title"])
                .execute()
            )
        except Exception as exc:
            logging.getLogger(__name__).warning(f"[delete_transcription] falha ao limpar memória: {exc}")

    return {"ok": True}
