"""Vídeos guardados no swipe (Cloudflare R2)."""

import json
import time
import uuid
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, BackgroundTasks

from app.middleware.auth import get_current_user
from app.services import r2_storage, assemblyai, claude
from app.services.supabase_client import get_supabase
from app.utils.jobs import cleanup_jobs

logger = logging.getLogger(__name__)

router = APIRouter()

TEMP_DIR = Path(__file__).parent.parent.parent / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# Limite de tamanho de vídeo individual (500 MB — gerenciável)
MAX_VIDEO_SIZE = 500 * 1024 * 1024

# Jobs de transcrição de vídeos do swipe (in-memory, TTL via cleanup_jobs)
_transcribe_jobs: dict = {}


@router.get("/health")
async def videos_health():
    """Diagnóstico: R2 está configurado e acessível?"""
    return r2_storage.health_check()


@router.post("/me/cleanup-orphans")
async def cleanup_orphan_videos(current_user=Depends(get_current_user)):
    """Remove do R2 os vídeos que não estão mais referenciados em nenhum swipe.

    Isso conserta o storage 'acumulado' por deletes antigos que não limpavam o R2."""
    if not r2_storage._enabled():
        return {"deleted": 0, "freed_mb": 0}
    sb = get_supabase()
    # Keys realmente em uso (referenciadas no content.video.key dos swipes do user)
    res = sb.table("swipes").select("content").eq("user_id", current_user.id).execute()
    in_use = set()
    for row in (res.data or []):
        try:
            c = json.loads(row["content"]) if isinstance(row["content"], str) else (row["content"] or {})
            key = (c.get("video") or {}).get("key")
            if key:
                in_use.add(key)
        except Exception:
            pass

    all_keys = r2_storage.list_user_keys(current_user.id)
    orphans = [k for k in all_keys if k not in in_use]
    freed = 0
    for k in orphans:
        try:
            # soma tamanho antes de apagar (best-effort)
            r2_storage.delete_video(k)
            freed += 1
        except Exception as exc:
            logger.warning(f"[videos] falha ao apagar órfão {k}: {exc}")

    bytes_used = r2_storage.get_user_storage_used(current_user.id)
    return {
        "deleted": freed,
        "bytes": bytes_used,
        "mb": round(bytes_used / 1024 / 1024, 2),
        "gb": round(bytes_used / 1024 / 1024 / 1024, 3),
    }


@router.get("/me/usage")
async def my_usage(current_user=Depends(get_current_user)):
    """Quanto storage o usuário está usando."""
    bytes_used = r2_storage.get_user_storage_used(current_user.id)
    return {
        "bytes": bytes_used,
        "mb": round(bytes_used / 1024 / 1024, 2),
        "gb": round(bytes_used / 1024 / 1024 / 1024, 3),
    }


@router.post("/upload-to-swipe")
async def upload_video_to_swipe(
    file: UploadFile = File(...),
    tag: str = Form("ad"),                  # 'ad' | 'hook' | 'avatar'
    title: Optional[str] = Form(None),
    niche: Optional[str] = Form(None),
    formato: Optional[str] = Form(None),    # formato do anúncio (ex: UGC, Cinematográfico…)
    project_id: Optional[str] = Form(None),
    transcript: Optional[str] = Form(None), # se já tem a transcrição, salva junto
    content_json: Optional[str] = Form(None), # campos estruturados extras (hook_written, body, avatar…)
    current_user=Depends(get_current_user),
):
    """Sobe um vídeo direto pro swipe (sem transcrever)."""
    if not r2_storage._enabled():
        raise HTTPException(status_code=503, detail="Cloudflare R2 não está configurado neste servidor.")

    # Validações
    content = await file.read()
    if len(content) > MAX_VIDEO_SIZE:
        raise HTTPException(status_code=400, detail=f"Vídeo muito grande ({len(content) / 1024 / 1024:.0f} MB). Máximo: {MAX_VIDEO_SIZE / 1024 / 1024:.0f} MB.")

    # Salva temp
    tmp = TEMP_DIR / f"{uuid.uuid4().hex}{Path(file.filename).suffix.lower()}"
    tmp.write_bytes(content)

    try:
        # Cria o swipe primeiro (precisamos do ID pra usar como key no R2)
        sb = get_supabase()
        swipe_content = {
            "title": title or Path(file.filename).stem,
            "niche": niche,
            "format": formato,
            "has_video": True,
            "filename": file.filename,
        }
        # Campos estruturados (análise do anúncio) — mesclados por cima dos básicos
        if content_json:
            try:
                extra = json.loads(content_json)
                if isinstance(extra, dict):
                    swipe_content.update({k: v for k, v in extra.items() if v not in (None, "")})
                    # garante que has_video não seja sobrescrito
                    swipe_content["has_video"] = True
            except Exception:
                pass
        if transcript:
            swipe_content["body" if tag == "ad" else "hook"] = transcript

        import json as _json
        swipe_res = sb.table("swipes").insert({
            "user_id": current_user.id,
            "tag": tag,
            "content": _json.dumps(swipe_content),
            "project_id": project_id,
        }).execute()

        if not swipe_res.data:
            raise HTTPException(status_code=500, detail="Falha ao criar swipe")
        swipe_id = swipe_res.data[0]["id"]

        # Sobe pro R2
        ct = file.content_type or "video/mp4"
        meta = r2_storage.upload_video(str(tmp), current_user.id, swipe_id, ct)

        # Atualiza swipe com info do vídeo
        swipe_content["video"] = {
            "key": meta["key"],
            "size_bytes": meta["size_bytes"],
            "content_type": meta["content_type"],
        }
        sb.table("swipes").update({
            "content": _json.dumps(swipe_content),
        }).eq("id", swipe_id).execute()

        return {
            "ok": True,
            "swipe_id": swipe_id,
            "video": meta,
        }
    finally:
        try: tmp.unlink()
        except OSError: pass


@router.get("/playback/{swipe_id}")
async def get_playback_url(swipe_id: str, current_user=Depends(get_current_user)):
    """Retorna URL temporária pra dar play no vídeo (válida por 1h)."""
    sb = get_supabase()
    res = sb.table("swipes").select("user_id, content").eq("id", swipe_id).single().execute()
    if not res.data or res.data["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Swipe não encontrado")

    import json as _json
    try:
        content = _json.loads(res.data["content"])
        key = content.get("video", {}).get("key")
        if not key:
            raise HTTPException(status_code=404, detail="Vídeo não disponível pra este swipe")
        return {"url": r2_storage.get_presigned_url(key, expires_in=3600)}
    except _json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Content do swipe mal formatado")


@router.delete("/swipe/{swipe_id}")
async def delete_video_from_swipe(swipe_id: str, current_user=Depends(get_current_user)):
    """Remove só o vídeo (mantém o swipe com a transcrição)."""
    sb = get_supabase()
    res = sb.table("swipes").select("user_id, content").eq("id", swipe_id).single().execute()
    if not res.data or res.data["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Swipe não encontrado")

    import json as _json
    try:
        content = _json.loads(res.data["content"])
        key = content.get("video", {}).get("key")
        if key:
            r2_storage.delete_video(key)
        content.pop("video", None)
        content.pop("has_video", None)
        sb.table("swipes").update({"content": _json.dumps(content)}).eq("id", swipe_id).execute()
        return {"ok": True}
    except _json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Content mal formatado")


# ─── Transcrever um vídeo já salvo no swipe (sob demanda) ────────────────────

def _download_r2_to_temp(key: str) -> str:
    """Baixa o vídeo do R2 (via presigned URL) pra um arquivo temporário local."""
    import requests
    url = r2_storage.get_presigned_url(key, expires_in=3600)
    suffix = Path(key).suffix or ".mp4"
    tmp = TEMP_DIR / f"{uuid.uuid4().hex}{suffix}"
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 256):
                if chunk:
                    f.write(chunk)
    return str(tmp)


def _run_swipe_transcription(job_id: str, swipe_id: str, user_id: str):
    """Analisa um anúncio já salvo no swipe usando os MESMOS critérios da ferramenta
    de Anúncios: Gemini (visão) extrai avatar, edição, hook visual, formato + textos.
    Se o Gemini falhar (ex: conteúdo bloqueado), cai no AssemblyAI (só áudio)."""
    from app.services import gemini
    tmp_path = None
    try:
        _transcribe_jobs[job_id] = {"status": "analyzing", "_ts": time.time()}
        sb = get_supabase()
        res = sb.table("swipes").select("user_id, content").eq("id", swipe_id).single().execute()
        row = res.data
        if not row or row["user_id"] != user_id:
            raise ValueError("Anúncio não encontrado.")
        content = json.loads(row["content"]) if isinstance(row["content"], str) else (row["content"] or {})
        key = (content.get("video") or {}).get("key")
        if not key:
            raise ValueError("Esse anúncio não tem vídeo salvo pra transcrever.")

        # Baixa o vídeo do R2 pra rodar a análise visual do Gemini
        tmp_path = _download_r2_to_temp(key)

        analyzed = None
        try:
            r = gemini.analyze_ad(tmp_path)
            body = claude._break_into_paragraphs(r.get("body", "")) if r.get("body") else ""
            # Mescla a análise rica no conteúdo do swipe
            content["hook_written"]  = r.get("hook_written", "") or content.get("hook_written", "")
            content["hook_visual"]   = r.get("hook_visual", "") or content.get("hook_visual", "")
            content["body"]          = body or content.get("body", "")
            content["transcript_full"] = body
            if r.get("video_format"):
                content["format"] = r["video_format"]
            if r.get("avatar"):
                content["avatar"] = r["avatar"]
            if r.get("editing"):
                content["editing"] = r["editing"]
            if r.get("duration"):
                content["duration"] = r["duration"]
            analyzed = {
                "engine": "gemini",
                "hook": r.get("hook_written", ""),
                "body": body,
                "avatar": r.get("avatar", {}),
                "editing": r.get("editing", {}),
                "video_format": r.get("video_format", ""),
                "hook_visual": r.get("hook_visual", ""),
            }
        except Exception as gem_exc:
            logger.warning(f"[videos] Gemini falhou, usando AssemblyAI: {gem_exc}")

        # Fallback: AssemblyAI (só áudio) se o Gemini não rolou
        if analyzed is None:
            transcript = assemblyai.transcribe_file(tmp_path)
            if not transcript:
                raise ValueError("Transcrição retornou vazia.")
            split = claude.split_hook_body(transcript)
            paragraphed = claude._break_into_paragraphs(transcript)
            content["transcript_full"] = paragraphed
            if split.get("hook"):
                content["hook_written"] = split["hook"]
            if split.get("body"):
                content["body"] = split["body"]
            analyzed = {"engine": "assemblyai", "hook": split.get("hook", ""), "body": paragraphed}

        sb.table("swipes").update({"content": json.dumps(content)}).eq("id", swipe_id).execute()

        _transcribe_jobs[job_id] = {
            "status": "done", "_ts": time.time(),
            "result": {"swipe_id": swipe_id, **analyzed},
        }
    except Exception as exc:
        _transcribe_jobs[job_id] = {"status": "error", "_ts": time.time(), "error": str(exc)}
    finally:
        if tmp_path:
            try:
                Path(tmp_path).unlink()
            except OSError:
                pass


@router.post("/transcribe-swipe/{swipe_id}")
async def transcribe_swipe(swipe_id: str, background_tasks: BackgroundTasks, current_user=Depends(get_current_user)):
    """Dispara a transcrição (em background) de um vídeo já salvo no swipe."""
    job_id = str(uuid.uuid4())
    cleanup_jobs(_transcribe_jobs)
    _transcribe_jobs[job_id] = {"status": "queued", "_ts": time.time()}
    background_tasks.add_task(_run_swipe_transcription, job_id, swipe_id, current_user.id)
    return {"job_id": job_id}


@router.get("/transcribe-swipe/status/{job_id}")
async def transcribe_swipe_status(job_id: str):
    job = _transcribe_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return job
