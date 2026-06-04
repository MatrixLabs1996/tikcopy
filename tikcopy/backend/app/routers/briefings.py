"""
Briefings — template estruturado da OFERTA (vários por projeto).
Inclui upload de arquivo, criação a partir do template e extração via VSL.

NOTA: a tabela do banco se chama `briefings` (renomeada de `researches`).
"""
import time
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, BackgroundTasks
from typing import Optional

from app.models.schemas import BriefingCreate, BriefingUpdate
from app.middleware.auth import get_current_user
from app.services import claude, assemblyai, r2_storage
from app.services.supabase_client import get_supabase
from app.utils.jobs import cleanup_jobs

router = APIRouter()

TEMP_DIR = Path(__file__).parent.parent.parent / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# Jobs em memória pra extração assíncrona de VSL
_vsl_jobs: dict = {}


def _run_vsl_extract(job_id: str, file_path: Optional[str], transcript: Optional[str], user_id: Optional[str] = None):
    """Roda transcrição (se necessário) + extração de campos via Claude."""
    try:
        if transcript:
            text = transcript
        else:
            _vsl_jobs[job_id] = {"status": "transcribing", "_ts": time.time()}
            text = assemblyai.transcribe_file(file_path, track_user_id=user_id, operation="transcricao_vsl")
            if not text:
                raise ValueError("Transcrição retornou vazia.")

        _vsl_jobs[job_id] = {"status": "analyzing", "_ts": time.time()}
        fields = claude.extract_vsl_research_fields(text)

        _vsl_jobs[job_id] = {
            "status": "done",
            "_ts": time.time(),
            "result": {
                "fields": fields,
                "transcript": text,
            },
        }
    except Exception as exc:
        _vsl_jobs[job_id] = {"status": "error", "_ts": time.time(), "error": str(exc)}
    finally:
        if file_path:
            try: Path(file_path).unlink()
            except OSError: pass


@router.post("/extract-vsl")
async def extract_vsl_from_file(
    background_tasks: BackgroundTasks,
    file: Optional[UploadFile] = File(None),
    transcript: Optional[str] = Form(None),
    current_user=Depends(get_current_user),
):
    """Recebe uma VSL (arquivo de áudio/vídeo OU transcrição já pronta) e roda
    transcrição + extração dos 8 campos do template em background.
    Retorna job_id pra polling."""
    if not file and not transcript:
        raise HTTPException(status_code=400, detail="Envie um arquivo ou cole a transcrição.")

    job_id = str(uuid.uuid4())
    file_path = None
    if file:
        suffix = Path(file.filename).suffix.lower()
        file_path = str(TEMP_DIR / f"vslx-{job_id}{suffix}")
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

    cleanup_jobs(_vsl_jobs)
    _vsl_jobs[job_id] = {"status": "queued", "_ts": time.time()}
    background_tasks.add_task(_run_vsl_extract, job_id, file_path, transcript, current_user.id)
    return {"job_id": job_id}


@router.get("/extract-vsl/{job_id}")
async def get_vsl_extract_status(job_id: str, current_user=Depends(get_current_user)):
    job = _vsl_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado ou expirado.")
    return job


@router.get("")
async def list_briefings(current_user=Depends(get_current_user)):
    sb = get_supabase()
    try:
        res = (
            sb.table("briefings")
            .select("id, title, project_id, market, template_data, raw_content, created_at")
            .eq("user_id", current_user.id)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as exc:
        if "template_data" in str(exc):
            res = (
                sb.table("briefings")
                .select("id, title, project_id, market, raw_content, created_at")
                .eq("user_id", current_user.id)
                .order("created_at", desc=True)
                .execute()
            )
        else:
            raise
    rows = res.data or []
    for r in rows:
        meta = _parse_file_meta(r)
        if meta:
            r["file_meta"] = meta
    return rows


@router.post("")
async def create_briefing(body: BriefingCreate, current_user=Depends(get_current_user)):
    sb = get_supabase()
    data = body.model_dump(exclude_none=True)
    data["user_id"] = current_user.id
    res = _insert_with_retry(sb, data, min_keys={"user_id", "title"})
    return res.data[0] if res.data else {}


def _insert_with_retry(sb, payload: dict, min_keys: set):
    """Insere na tabela briefings; se alguma coluna não existir no schema,
    remove e tenta de novo até funcionar."""
    import re as _re
    import logging
    logger = logging.getLogger(__name__)
    attempt = dict(payload)
    last_err = None
    for _ in range(30):
        try:
            return sb.table("briefings").insert(attempt).execute()
        except Exception as exc:
            last_err = exc
            m = _re.search(r"'([\w_]+)'\s+column", str(exc))
            if not m:
                break
            bad = m.group(1)
            if bad in min_keys or bad not in attempt:
                break
            logger.warning(f"[briefings] coluna '{bad}' não existe — removendo e tentando de novo")
            attempt = {k: v for k, v in attempt.items() if k != bad}
    raise last_err


_MIME = {
    ".pdf":  "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc":  "application/msword",
    ".txt":  "text/plain",
    ".md":   "text/markdown",
}

@router.post("/upload")
async def create_briefing_from_file(
    file: UploadFile = File(...),
    project_id: Optional[str] = Form(None),
    current_user=Depends(get_current_user),
):
    """Upload de briefing: guarda o ARQUIVO ORIGINAL no R2 e salva metadata."""
    import logging
    logger = logging.getLogger(__name__)

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _MIME:
        raise HTTPException(status_code=400, detail=f"Formato não suportado: {suffix}. Use PDF, DOC, DOCX, TXT ou MD.")

    if not r2_storage._enabled():
        raise HTTPException(status_code=503, detail="Storage R2 não configurado neste servidor.")

    tmp = TEMP_DIR / f"briefing-{uuid.uuid4().hex}{suffix}"
    content = await file.read()
    tmp.write_bytes(content)
    try:
        key = f"briefings/{current_user.id}/{uuid.uuid4().hex}{suffix}"
        try:
            meta = r2_storage.upload_file(str(tmp), key, content_type=_MIME[suffix])
        except Exception as exc:
            logger.exception("[briefings/upload] erro no R2")
            raise HTTPException(status_code=500, detail=f"Erro ao subir arquivo: {exc}")

        title = Path(file.filename).stem or "Briefing importado"

        import json as _json
        file_meta = {
            "file_key": key,
            "file_name": file.filename,
            "file_ext": suffix.lstrip("."),
            "file_size_bytes": meta["size_bytes"],
            "content_type": _MIME[suffix],
        }

        payload = {
            "user_id": current_user.id,
            "title": title,
            "raw_content": "__FILE_META__" + _json.dumps(file_meta),
            "template_data": file_meta,
        }
        if project_id:
            payload["project_id"] = project_id

        sb = get_supabase()
        try:
            res = _insert_with_retry(sb, payload, min_keys={"user_id", "title"})
        except Exception as exc:
            logger.exception("[briefings/upload] erro no insert")
            raise HTTPException(status_code=500, detail=f"Erro ao salvar: {exc}")

        return res.data[0] if res.data else {}
    finally:
        try: tmp.unlink()
        except OSError: pass


def _parse_file_meta(record: dict) -> dict | None:
    """Lê metadata do arquivo de um briefing.
    Procura em template_data primeiro, depois no raw_content (prefixo __FILE_META__)."""
    import json as _json
    td = record.get("template_data")
    if isinstance(td, dict) and td.get("file_key"):
        return td
    raw = record.get("raw_content") or ""
    if isinstance(raw, str) and raw.startswith("__FILE_META__"):
        try:
            return _json.loads(raw[len("__FILE_META__"):])
        except Exception:
            return None
    return None


@router.post("/from-template")
async def create_briefing_from_template(
    payload: dict,
    current_user=Depends(get_current_user),
):
    """Cria um briefing manual: gera um .md, sobe pro R2 e salva registro.
    Payload: { title, offer_name?, niche?, content_markdown, project_id? }"""
    import logging
    logger = logging.getLogger(__name__)

    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Título é obrigatório")
    content_md = payload.get("content_markdown") or ""
    niche = payload.get("niche") or None
    offer_name = payload.get("offer_name") or None
    project_id = payload.get("project_id") or None

    if not r2_storage._enabled():
        raise HTTPException(status_code=503, detail="Storage não configurado.")

    header_parts = [f"# {title}"]
    if offer_name: header_parts.append(f"**Oferta:** {offer_name}")
    if niche:      header_parts.append(f"**Nicho:** {niche}")
    full_md = "\n\n".join(header_parts) + "\n\n---\n\n" + content_md

    safe_name = "".join(c if c.isalnum() or c in "._- " else "_" for c in title)[:60].strip() or "briefing"
    tmp = TEMP_DIR / f"briefing-{uuid.uuid4().hex}.md"
    tmp.write_text(full_md, encoding="utf-8")
    try:
        key = f"briefings/{current_user.id}/{uuid.uuid4().hex}.md"
        meta = r2_storage.upload_file(str(tmp), key, content_type="text/markdown")

        import json as _json
        file_meta = {
            "file_key": key,
            "file_name": f"{safe_name}.md",
            "file_ext": "md",
            "file_size_bytes": meta["size_bytes"],
            "content_type": "text/markdown",
        }

        record_payload = {
            "user_id": current_user.id,
            "title": title,
            "market": niche,
            "raw_content": "__FILE_META__" + _json.dumps(file_meta),
            "template_data": file_meta,
        }
        if project_id:
            record_payload["project_id"] = project_id

        sb = get_supabase()
        try:
            res = _insert_with_retry(sb, record_payload, min_keys={"user_id", "title"})
        except Exception as exc:
            logger.exception("[from-template] erro no insert")
            raise HTTPException(status_code=500, detail=f"Erro ao salvar: {exc}")

        return res.data[0] if res.data else {}
    finally:
        try: tmp.unlink()
        except OSError: pass


@router.get("/{briefing_id}/file")
async def stream_briefing_file(briefing_id: str, current_user=Depends(get_current_user)):
    """Proxy do arquivo do R2 (evita CORS)."""
    import logging
    logger = logging.getLogger(__name__)
    from fastapi.responses import StreamingResponse
    sb = get_supabase()
    try:
        res = sb.table("briefings").select("user_id, template_data, raw_content").eq("id", briefing_id).single().execute()
    except Exception as exc:
        if "template_data" in str(exc):
            res = sb.table("briefings").select("user_id, raw_content").eq("id", briefing_id).single().execute()
        else:
            logger.exception("[/file] erro no select")
            raise
    if not res.data:
        raise HTTPException(status_code=404, detail="Briefing não encontrado")
    if res.data.get("user_id") != current_user.id:
        raise HTTPException(status_code=404, detail="Briefing não encontrado")
    meta = _parse_file_meta(res.data)
    if not meta or not meta.get("file_key"):
        raise HTTPException(status_code=404, detail="Este briefing não tem arquivo anexado.")

    try:
        import io
        client = r2_storage._client()
        bucket = r2_storage._bucket()
        obj = client.get_object(Bucket=bucket, Key=meta["file_key"])
        body = obj["Body"].read()
        content_type = meta.get("content_type") or obj.get("ContentType") or "application/octet-stream"
        file_name = meta.get("file_name") or "arquivo"
        return StreamingResponse(
            io.BytesIO(body),
            media_type=content_type,
            headers={"Content-Disposition": f'inline; filename="{file_name}"'},
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[/file] erro no download R2")
        raise HTTPException(status_code=500, detail=f"Erro ao baixar arquivo: {exc}")


@router.get("/{briefing_id}/file-url")
async def get_briefing_file_url(briefing_id: str, current_user=Depends(get_current_user)):
    """Gera URL temporária (1h) pra abrir o arquivo original."""
    sb = get_supabase()
    try:
        res = sb.table("briefings").select("user_id, template_data, raw_content").eq("id", briefing_id).single().execute()
    except Exception as exc:
        if "template_data" in str(exc):
            res = sb.table("briefings").select("user_id, raw_content").eq("id", briefing_id).single().execute()
        else:
            raise
    if not res.data or res.data["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Briefing não encontrado")
    meta = _parse_file_meta(res.data)
    if not meta or not meta.get("file_key"):
        raise HTTPException(status_code=404, detail="Este briefing não tem arquivo anexado.")
    try:
        url = r2_storage.get_presigned_url(meta["file_key"], expires_in=3600)
        return {"url": url, "file_name": meta.get("file_name"), "content_type": meta.get("content_type")}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar link: {exc}")


@router.get("/{briefing_id}")
async def get_briefing(briefing_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("briefings")
        .select("*")
        .eq("id", briefing_id)
        .eq("user_id", current_user.id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Briefing não encontrado")
    return res.data


@router.patch("/{briefing_id}")
async def update_briefing(
    briefing_id: str, body: BriefingUpdate, current_user=Depends(get_current_user)
):
    sb = get_supabase()
    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
    res = (
        sb.table("briefings")
        .update(update_data)
        .eq("id", briefing_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Briefing não encontrado")
    return res.data[0]


@router.delete("/{briefing_id}")
async def delete_briefing(briefing_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    sb.table("briefings").delete().eq("id", briefing_id).eq("user_id", current_user.id).execute()
    return {"ok": True}
