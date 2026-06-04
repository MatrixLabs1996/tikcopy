"""
Research Docs — biblioteca de pesquisa por NICHO + PÚBLICO.
Compartilhada entre todos os projetos do mesmo nicho do usuário.

Tipos suportados:
  - upload : arquivo (PDF, DOCX, TXT, MD) no R2
  - text   : texto colado livre
  - link   : URL com nota
"""
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from typing import Optional

from app.models.schemas import ResearchDocCreate, ResearchDocUpdate
from app.middleware.auth import get_current_user
from app.services import r2_storage
from app.services.supabase_client import get_supabase

router = APIRouter()

TEMP_DIR = Path(__file__).parent.parent.parent / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

_MIME = {
    ".pdf":  "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc":  "application/msword",
    ".txt":  "text/plain",
    ".md":   "text/markdown",
}


@router.get("")
async def list_research_docs(
    nicho: Optional[str] = None,
    publico_id: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    """Lista docs do usuário. Filtra por nicho e/ou público.
    Se passar publico_id, retorna também os docs 'gerais' do nicho (publico_id IS NULL)."""
    sb = get_supabase()
    q = sb.table("research_docs").select("*").eq("user_id", current_user.id)
    if nicho:
        q = q.eq("nicho", nicho)
    # Não filtramos por publico_id aqui porque queremos "específico + geral"
    res = q.order("created_at", desc=True).execute()
    rows = res.data or []
    if publico_id:
        rows = [r for r in rows if r.get("publico_id") == publico_id or r.get("publico_id") is None]
    return rows


@router.post("")
async def create_research_doc(body: ResearchDocCreate, current_user=Depends(get_current_user)):
    """Cria doc do tipo text ou link (sem upload de arquivo)."""
    if body.type not in ("text", "link"):
        raise HTTPException(status_code=400, detail='Use o endpoint /research-docs/upload pra tipo "upload"')

    sb = get_supabase()
    data = body.model_dump(exclude_none=True)
    data["user_id"] = current_user.id
    res = sb.table("research_docs").insert(data).execute()
    return res.data[0] if res.data else {}


@router.post("/upload")
async def upload_research_doc(
    file: UploadFile = File(...),
    nicho: str = Form(...),
    title: Optional[str] = Form(None),
    publico_id: Optional[str] = Form(None),
    current_user=Depends(get_current_user),
):
    """Upload de arquivo (PDF, DOCX, TXT, MD) pra biblioteca de pesquisa."""
    import logging
    logger = logging.getLogger(__name__)

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _MIME:
        raise HTTPException(status_code=400, detail=f"Formato não suportado: {suffix}. Use PDF, DOC, DOCX, TXT ou MD.")

    if not r2_storage._enabled():
        raise HTTPException(status_code=503, detail="Storage R2 não configurado neste servidor.")

    tmp = TEMP_DIR / f"resdoc-{uuid.uuid4().hex}{suffix}"
    content = await file.read()
    tmp.write_bytes(content)
    try:
        key = f"research-docs/{current_user.id}/{uuid.uuid4().hex}{suffix}"
        try:
            meta = r2_storage.upload_file(str(tmp), key, content_type=_MIME[suffix])
        except Exception as exc:
            logger.exception("[research-docs/upload] erro no R2")
            raise HTTPException(status_code=500, detail=f"Erro ao subir arquivo: {exc}")

        payload = {
            "user_id": current_user.id,
            "nicho": nicho,
            "title": (title or Path(file.filename).stem or "Documento").strip(),
            "type": "upload",
            "file_key": key,
            "file_name": file.filename,
            "file_ext": suffix.lstrip("."),
            "file_size_bytes": meta["size_bytes"],
            "content_type": _MIME[suffix],
            "imported_via": "upload",
        }
        if publico_id:
            payload["publico_id"] = publico_id

        sb = get_supabase()
        res = sb.table("research_docs").insert(payload).execute()
        return res.data[0] if res.data else {}
    finally:
        try: tmp.unlink()
        except OSError: pass


@router.get("/{doc_id}/file")
async def stream_research_doc_file(doc_id: str, current_user=Depends(get_current_user)):
    """Proxy do arquivo do R2 (evita CORS)."""
    from fastapi.responses import StreamingResponse
    sb = get_supabase()
    res = sb.table("research_docs").select("user_id, file_key, file_name, content_type").eq("id", doc_id).single().execute()
    if not res.data or res.data.get("user_id") != current_user.id:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    if not res.data.get("file_key"):
        raise HTTPException(status_code=404, detail="Este documento não tem arquivo anexado.")
    try:
        import io
        client = r2_storage._client()
        bucket = r2_storage._bucket()
        obj = client.get_object(Bucket=bucket, Key=res.data["file_key"])
        body = obj["Body"].read()
        content_type = res.data.get("content_type") or obj.get("ContentType") or "application/octet-stream"
        file_name = res.data.get("file_name") or "arquivo"
        return StreamingResponse(
            io.BytesIO(body),
            media_type=content_type,
            headers={"Content-Disposition": f'inline; filename="{file_name}"'},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao baixar arquivo: {exc}")


@router.get("/{doc_id}/file-url")
async def get_research_doc_file_url(doc_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    res = sb.table("research_docs").select("user_id, file_key, file_name, content_type").eq("id", doc_id).single().execute()
    if not res.data or res.data.get("user_id") != current_user.id:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    if not res.data.get("file_key"):
        raise HTTPException(status_code=404, detail="Este documento não tem arquivo anexado.")
    try:
        url = r2_storage.get_presigned_url(res.data["file_key"], expires_in=3600)
        return {"url": url, "file_name": res.data.get("file_name"), "content_type": res.data.get("content_type")}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar link: {exc}")


@router.get("/{doc_id}")
async def get_research_doc(doc_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    res = sb.table("research_docs").select("*").eq("id", doc_id).eq("user_id", current_user.id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    return res.data


@router.patch("/{doc_id}")
async def update_research_doc(
    doc_id: str, body: ResearchDocUpdate, current_user=Depends(get_current_user)
):
    sb = get_supabase()
    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    res = (
        sb.table("research_docs")
        .update(update_data)
        .eq("id", doc_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    return res.data[0]


@router.delete("/{doc_id}")
async def delete_research_doc(doc_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    # Pega file_key antes pra deletar do R2 também
    rec = sb.table("research_docs").select("file_key").eq("id", doc_id).eq("user_id", current_user.id).single().execute()
    file_key = (rec.data or {}).get("file_key") if rec.data else None
    sb.table("research_docs").delete().eq("id", doc_id).eq("user_id", current_user.id).execute()
    if file_key:
        try:
            client = r2_storage._client()
            bucket = r2_storage._bucket()
            client.delete_object(Bucket=bucket, Key=file_key)
        except Exception:
            pass  # falha silenciosa — o registro já foi removido
    return {"ok": True}
