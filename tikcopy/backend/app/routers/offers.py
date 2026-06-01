"""
Oferta por projeto — cada projeto É uma oferta (1:1).

A "oferta" é um DOSSIÊ rico em markdown, destilado UMA vez a partir das pesquisas
(documentos) + transcrição da VSL no momento da criação do projeto. Depois o usuário
pode adicionar mais pesquisas e a IA ATUALIZA o dossiê (merge), preservando os
pontos-chave antigos.

Armazenamento: reusa a tabela `briefings` — UM registro por projeto, marcado em
`template_data.kind == "offer_dossier"`. O markdown em si vai pro R2 (.md).
Sem migração de schema no Supabase.
"""
import json
import time
import uuid
import logging
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, BackgroundTasks

from app.middleware.auth import get_current_user
from app.services import claude, assemblyai, r2_storage, document_parser
from app.services.supabase_client import get_supabase
from app.utils.jobs import cleanup_jobs

logger = logging.getLogger(__name__)
router = APIRouter()

TEMP_DIR = Path(__file__).parent.parent.parent / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# Jobs em memória pra destilação assíncrona do dossiê
_dossier_jobs: dict = {}

# Extensões de documento de pesquisa (texto extraível)
_DOC_EXTS = {".pdf", ".docx", ".txt", ".md"}
# Extensões de mídia (VSL pra transcrever)
_MEDIA_EXTS = {".mp3", ".mp4", ".m4a", ".wav", ".aac", ".ogg", ".webm", ".mov", ".mkv", ".flac"}

DOSSIER_KIND = "offer_dossier"


# ---------------------------------------------------------------------------
# Helpers de persistência (reusa tabela briefings)
# ---------------------------------------------------------------------------

def _insert_with_retry(sb, payload: dict, min_keys: set):
    """Insere em briefings; se alguma coluna não existir, remove e tenta de novo."""
    import re as _re
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
            logger.warning(f"[offers] coluna '{bad}' não existe — removendo e tentando de novo")
            attempt = {k: v for k, v in attempt.items() if k != bad}
    raise last_err


def _update_with_retry(sb, record_id: str, user_id: str, payload: dict, min_keys: set):
    """Atualiza briefings; se alguma coluna não existir, remove e tenta de novo."""
    import re as _re
    attempt = dict(payload)
    last_err = None
    for _ in range(30):
        try:
            return (
                sb.table("briefings")
                .update(attempt)
                .eq("id", record_id)
                .eq("user_id", user_id)
                .execute()
            )
        except Exception as exc:
            last_err = exc
            m = _re.search(r"'([\w_]+)'\s+column", str(exc))
            if not m:
                break
            bad = m.group(1)
            if bad in min_keys or bad not in attempt:
                break
            logger.warning(f"[offers] coluna '{bad}' não existe — removendo e tentando de novo")
            attempt = {k: v for k, v in attempt.items() if k != bad}
    raise last_err


_FILE_META_PREFIX = "__FILE_META__"


def _get_file_meta(row: dict) -> Optional[dict]:
    """Extrai o meta do dossiê de um registro.

    Fonte de verdade dupla: a coluna `template_data` (quando existe no schema)
    OU o `raw_content` (prefixado com __FILE_META__), que é sempre gravado.
    Isso mantém o app funcionando mesmo sem a coluna `template_data` no Supabase.
    """
    td = row.get("template_data")
    if isinstance(td, dict) and td.get("kind") == DOSSIER_KIND:
        return td
    rc = row.get("raw_content")
    if isinstance(rc, str) and rc.startswith(_FILE_META_PREFIX):
        try:
            meta = json.loads(rc[len(_FILE_META_PREFIX):])
            if isinstance(meta, dict) and meta.get("kind") == DOSSIER_KIND:
                return meta
        except Exception:
            return None
    return None


def _find_offer_record(sb, user_id: str, project_id: str) -> Optional[dict]:
    """Acha o registro de dossiê da oferta de um projeto (kind == offer_dossier)."""
    try:
        res = (
            sb.table("briefings")
            .select("*")
            .eq("user_id", user_id)
            .eq("project_id", project_id)
            .order("created_at", desc=True)
            .execute()
        )
    except Exception:
        return None
    for row in res.data or []:
        if _get_file_meta(row):
            return row
    return None


def _read_dossier_md(meta: dict) -> str:
    """Baixa o markdown do dossiê do R2."""
    if not meta or not meta.get("file_key"):
        return ""
    try:
        obj = r2_storage._client().get_object(Bucket=r2_storage._bucket(), Key=meta["file_key"])
        return obj["Body"].read().decode("utf-8", errors="replace")
    except Exception as exc:
        logger.warning(f"[offers] erro lendo dossiê do R2: {exc}")
        return ""


def _save_dossier(sb, *, user_id: str, project_id: str, dossier_md: str,
                  offer_name: str, niche: str, product_type: str, funnel_type: str,
                  existing: Optional[dict], linked_doc_ids: Optional[List[str]] = None) -> dict:
    """Sobe o markdown pro R2 e cria/atualiza o registro de dossiê do projeto."""
    if not r2_storage._enabled():
        raise RuntimeError("Storage R2 não configurado neste servidor.")

    key = f"offers/{user_id}/{project_id}/{uuid.uuid4().hex}.md"
    tmp = TEMP_DIR / f"dossier-{uuid.uuid4().hex}.md"
    tmp.write_text(dossier_md, encoding="utf-8")
    try:
        meta_up = r2_storage.upload_file(str(tmp), key, content_type="text/markdown")
    finally:
        try: tmp.unlink()
        except OSError: pass

    # União dos IDs de pesquisa já vinculados (preserva histórico de vínculos).
    prev_meta = _get_file_meta(existing) if existing else None
    merged_links = list((prev_meta or {}).get("linked_doc_ids") or [])
    for did in (linked_doc_ids or []):
        if did and did not in merged_links:
            merged_links.append(did)

    file_meta = {
        "kind": DOSSIER_KIND,
        "file_key": key,
        "file_name": f"{(offer_name or 'oferta').strip()[:50]}.md",
        "file_ext": "md",
        "file_size_bytes": meta_up["size_bytes"],
        "content_type": "text/markdown",
        "offer_name": offer_name or "",
        "niche": niche or "",
        "product_type": product_type or "",
        "funnel_type": funnel_type or "",
        "linked_doc_ids": merged_links,
    }

    if existing:
        # Versionamento pra "Desfazer": o markdown ANTERIOR vira o snapshot (prev_*),
        # e só apagamos o de 2 gerações atrás (cap de 1 snapshot por projeto).
        old_meta = _get_file_meta(existing) or {}
        if old_meta.get("file_key") and old_meta["file_key"] != key:
            file_meta["prev_file_key"] = old_meta["file_key"]
            file_meta["prev_linked_doc_ids"] = list(old_meta.get("linked_doc_ids") or [])
            file_meta["prev_file_name"] = old_meta.get("file_name")
            # apaga só a versão de 2 gerações atrás (best-effort)
            two_back = old_meta.get("prev_file_key")
            if two_back and two_back not in (key, old_meta["file_key"]):
                try:
                    r2_storage.delete_video(two_back)
                except Exception:
                    pass
        update_payload = {
            "title": offer_name or existing.get("title") or "Oferta",
            "market": niche or None,
            "raw_content": _FILE_META_PREFIX + json.dumps(file_meta),
            "template_data": file_meta,
        }
        res = _update_with_retry(sb, existing["id"], user_id, update_payload, min_keys={"raw_content"})
        return (res.data[0] if res.data else existing)

    payload = {
        "user_id": user_id,
        "project_id": project_id,
        "title": offer_name or "Oferta",
        "market": niche or None,
        "raw_content": _FILE_META_PREFIX + json.dumps(file_meta),
        "template_data": file_meta,
    }
    res = _insert_with_retry(sb, payload, min_keys={"user_id", "title", "raw_content"})
    return res.data[0] if res.data else {}


# ---------------------------------------------------------------------------
# Job de destilação
# ---------------------------------------------------------------------------

def _run_distill(
    job_id: str,
    *,
    user_id: str,
    project_id: str,
    offer_name: str,
    niche: str,
    product_type: str,
    funnel_type: str,
    doc_paths: List[str],
    vsl_path: Optional[str],
    vsl_transcript: Optional[str],
    merge: bool,
    linked_doc_ids: Optional[List[str]] = None,
):
    """Extrai texto dos docs + transcreve VSL + destila o dossiê + salva."""
    try:
        sb = get_supabase()

        # 1) Extrai texto dos documentos de pesquisa
        research_parts = []
        for p in doc_paths:
            try:
                txt = document_parser.extract_text(p)
                if txt and txt.strip():
                    research_parts.append(f"### {Path(p).name}\n\n{txt.strip()}")
            except Exception as exc:
                logger.warning(f"[offers] erro extraindo {p}: {exc}")
        research_text = "\n\n---\n\n".join(research_parts)

        # 2) VSL: transcrição já pronta ou transcreve mídia
        transcript_text = (vsl_transcript or "").strip()
        if not transcript_text and vsl_path:
            _dossier_jobs[job_id] = {"status": "transcribing", "_ts": time.time()}
            transcript_text = assemblyai.transcribe_file(vsl_path) or ""

        if not research_text.strip() and not transcript_text.strip():
            raise ValueError("Nenhum conteúdo encontrado nas pesquisas ou VSL enviadas.")

        # 3) Dossiê existente (pra merge)
        existing = _find_offer_record(sb, user_id, project_id)
        existing_md = None
        if existing:
            td = _get_file_meta(existing) or {}
            existing_md = _read_dossier_md(td)
            # herda meta básica que não foi reenviada
            offer_name = offer_name or td.get("offer_name", "")
            niche = niche or td.get("niche", "")
            product_type = product_type or td.get("product_type", "")
            funnel_type = funnel_type or td.get("funnel_type", "")

        # 4) Destila (merge se já existe dossiê)
        _dossier_jobs[job_id] = {"status": "analyzing", "_ts": time.time()}
        dossier_md = claude.distill_offer_dossier(
            offer_name=offer_name,
            niche=niche,
            product_type=product_type,
            funnel_type=funnel_type,
            research_text=research_text,
            vsl_transcript=transcript_text,
            existing_dossier=existing_md,
            track_user_id=user_id,
            track_project_id=project_id,
        )
        if not dossier_md or not dossier_md.strip():
            raise ValueError("A destilação retornou vazia.")

        # 5) Salva
        _dossier_jobs[job_id] = {"status": "saving", "_ts": time.time()}
        record = _save_dossier(
            sb,
            user_id=user_id,
            project_id=project_id,
            dossier_md=dossier_md,
            offer_name=offer_name,
            niche=niche,
            product_type=product_type,
            funnel_type=funnel_type,
            existing=existing,
            linked_doc_ids=linked_doc_ids,
        )

        _dossier_jobs[job_id] = {
            "status": "done",
            "_ts": time.time(),
            "result": {
                "briefing_id": record.get("id"),
                "project_id": project_id,
                "dossier": dossier_md,
                "offer_name": offer_name,
                "niche": niche,
                "product_type": product_type,
                "funnel_type": funnel_type,
            },
        }
    except Exception as exc:
        logger.exception("[offers] erro na destilação")
        _dossier_jobs[job_id] = {"status": "error", "_ts": time.time(), "error": str(exc)}
    finally:
        for p in doc_paths:
            try: Path(p).unlink()
            except OSError: pass
        if vsl_path:
            try: Path(vsl_path).unlink()
            except OSError: pass


async def _save_uploads(files: List[UploadFile]) -> List[str]:
    """Salva uploads em temp, retorna paths. Valida extensão de documento."""
    paths = []
    for f in files or []:
        if not f or not f.filename:
            continue
        suffix = Path(f.filename).suffix.lower()
        if suffix not in _DOC_EXTS:
            # ignora silenciosamente extensões não suportadas como doc
            raise HTTPException(
                status_code=400,
                detail=f"Formato não suportado: {suffix}. Use PDF, DOCX, TXT ou MD nas pesquisas.",
            )
        path = str(TEMP_DIR / f"offerdoc-{uuid.uuid4().hex}{suffix}")
        content = await f.read()
        with open(path, "wb") as out:
            out.write(content)
        paths.append(path)
    return paths


async def _save_vsl(vsl_file: Optional[UploadFile]) -> Optional[str]:
    if not vsl_file or not vsl_file.filename:
        return None
    suffix = Path(vsl_file.filename).suffix.lower()
    if suffix not in _MEDIA_EXTS and suffix not in _DOC_EXTS:
        raise HTTPException(status_code=400, detail=f"Formato de VSL não suportado: {suffix}.")
    path = str(TEMP_DIR / f"offervsl-{uuid.uuid4().hex}{suffix}")
    content = await vsl_file.read()
    with open(path, "wb") as out:
        out.write(content)
    return path


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/build")
async def build_offer(
    background_tasks: BackgroundTasks,
    project_id: str = Form(...),
    offer_name: str = Form(...),
    niche: str = Form(""),
    product_type: str = Form(""),
    funnel_type: str = Form(""),
    files: List[UploadFile] = File(default=[]),
    vsl_file: Optional[UploadFile] = File(None),
    vsl_transcript: Optional[str] = Form(None),
    current_user=Depends(get_current_user),
):
    """Cria o dossiê da oferta (1 por projeto) a partir das pesquisas + VSL.
    Roda em background; retorna job_id pra polling."""
    if not r2_storage._enabled():
        raise HTTPException(status_code=503, detail="Storage R2 não configurado neste servidor.")

    doc_paths = await _save_uploads(files)
    vsl_path = await _save_vsl(vsl_file)

    if not doc_paths and not vsl_path and not (vsl_transcript or "").strip():
        raise HTTPException(status_code=400, detail="Envie pelo menos uma pesquisa ou a VSL.")

    job_id = str(uuid.uuid4())
    cleanup_jobs(_dossier_jobs)
    _dossier_jobs[job_id] = {"status": "queued", "_ts": time.time()}
    background_tasks.add_task(
        _run_distill,
        job_id,
        user_id=current_user.id,
        project_id=project_id,
        offer_name=offer_name,
        niche=niche,
        product_type=product_type,
        funnel_type=funnel_type,
        doc_paths=doc_paths,
        vsl_path=vsl_path,
        vsl_transcript=vsl_transcript,
        merge=False,
    )
    return {"job_id": job_id}


@router.post("/{project_id}/add-research")
async def add_research(
    project_id: str,
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(default=[]),
    vsl_file: Optional[UploadFile] = File(None),
    vsl_transcript: Optional[str] = Form(None),
    offer_name: str = Form(""),
    niche: str = Form(""),
    product_type: str = Form(""),
    funnel_type: str = Form(""),
    current_user=Depends(get_current_user),
):
    """Adiciona mais pesquisa/VSL e ATUALIZA (merge) o dossiê existente."""
    if not r2_storage._enabled():
        raise HTTPException(status_code=503, detail="Storage R2 não configurado neste servidor.")

    doc_paths = await _save_uploads(files)
    vsl_path = await _save_vsl(vsl_file)

    if not doc_paths and not vsl_path and not (vsl_transcript or "").strip():
        raise HTTPException(status_code=400, detail="Envie pelo menos uma pesquisa ou a VSL.")

    job_id = str(uuid.uuid4())
    cleanup_jobs(_dossier_jobs)
    _dossier_jobs[job_id] = {"status": "queued", "_ts": time.time()}
    background_tasks.add_task(
        _run_distill,
        job_id,
        user_id=current_user.id,
        project_id=project_id,
        offer_name=offer_name,
        niche=niche,
        product_type=product_type,
        funnel_type=funnel_type,
        doc_paths=doc_paths,
        vsl_path=vsl_path,
        vsl_transcript=vsl_transcript,
        merge=True,
    )
    return {"job_id": job_id}


def _research_doc_to_path(doc: dict) -> Optional[str]:
    """Materializa uma pesquisa (research_docs) num arquivo temp pra destilação.
    upload → baixa do R2; text/link → monta um .txt (com nota + URL no link).
    Retorna o path, ou None se a pesquisa estiver vazia."""
    dtype = doc.get("type")
    title = doc.get("title") or "Pesquisa"
    if dtype == "upload":
        key = doc.get("file_key")
        if not key:
            return None
        suffix = "." + (doc.get("file_ext") or "txt").lstrip(".")
        path = str(TEMP_DIR / f"linkdoc-{uuid.uuid4().hex}{suffix}")
        obj = r2_storage._client().get_object(Bucket=r2_storage._bucket(), Key=key)
        with open(path, "wb") as out:
            out.write(obj["Body"].read())
        return path
    # text ou link
    parts = [f"# {title}"]
    if doc.get("source_url"):
        parts.append(f"[Fonte]: {doc['source_url']}")
    if doc.get("content"):
        parts.append(doc["content"])
    text = "\n\n".join(parts).strip()
    if len(text) <= len(title) + 2:  # só o título, sem conteúdo real
        return None
    path = str(TEMP_DIR / f"linkdoc-{uuid.uuid4().hex}.txt")
    with open(path, "w", encoding="utf-8") as out:
        out.write(text)
    return path


def _load_research_docs(sb, user_id: str, doc_ids: List[str]) -> List[dict]:
    res = (
        sb.table("research_docs")
        .select("*")
        .eq("user_id", user_id)
        .in_("id", doc_ids)
        .execute()
    )
    return res.data or []


@router.post("/{project_id}/link-research")
async def link_research(
    project_id: str,
    background_tasks: BackgroundTasks,
    payload: dict,
    current_user=Depends(get_current_user),
):
    """Vincula uma pesquisa salva (research_docs) ao dossiê do projeto.
    Puxa o conteúdo server-side (texto/arquivo do R2/link) e faz merge no dossiê."""
    if not r2_storage._enabled():
        raise HTTPException(status_code=503, detail="Storage R2 não configurado neste servidor.")

    doc_id = (payload or {}).get("doc_id")
    if not doc_id:
        raise HTTPException(status_code=400, detail="doc_id é obrigatório.")

    sb = get_supabase()
    docs = _load_research_docs(sb, current_user.id, [doc_id])
    if not docs:
        raise HTTPException(status_code=404, detail="Pesquisa não encontrada.")
    try:
        path = _research_doc_to_path(docs[0])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao baixar a pesquisa: {exc}")
    if not path:
        raise HTTPException(status_code=400, detail="Essa pesquisa está vazia — nada pra vincular.")

    job_id = str(uuid.uuid4())
    cleanup_jobs(_dossier_jobs)
    _dossier_jobs[job_id] = {"status": "queued", "_ts": time.time()}
    background_tasks.add_task(
        _run_distill,
        job_id,
        user_id=current_user.id,
        project_id=project_id,
        offer_name="",
        niche="",
        product_type="",
        funnel_type="",
        doc_paths=[path],
        vsl_path=None,
        vsl_transcript=None,
        merge=True,
        linked_doc_ids=[doc_id],
    )
    return {"job_id": job_id}


@router.post("/{project_id}/link-research-bulk")
async def link_research_bulk(
    project_id: str,
    background_tasks: BackgroundTasks,
    payload: dict,
    current_user=Depends(get_current_user),
):
    """Vincula VÁRIAS pesquisas de uma vez em UM único merge (mais rápido e coerente
    que N destilações). payload: { doc_ids: [...] }."""
    if not r2_storage._enabled():
        raise HTTPException(status_code=503, detail="Storage R2 não configurado neste servidor.")

    doc_ids = (payload or {}).get("doc_ids") or []
    if not isinstance(doc_ids, list) or not doc_ids:
        raise HTTPException(status_code=400, detail="Envie doc_ids (lista) pra vincular em massa.")

    sb = get_supabase()
    docs = _load_research_docs(sb, current_user.id, doc_ids)
    if not docs:
        raise HTTPException(status_code=404, detail="Nenhuma pesquisa encontrada.")

    doc_paths: List[str] = []
    used_ids: List[str] = []
    for doc in docs:
        try:
            path = _research_doc_to_path(doc)
        except Exception as exc:
            logger.warning(f"[offers] erro materializando pesquisa {doc.get('id')}: {exc}")
            path = None
        if path:
            doc_paths.append(path)
            used_ids.append(doc.get("id"))

    if not doc_paths:
        raise HTTPException(status_code=400, detail="As pesquisas selecionadas estão vazias.")

    job_id = str(uuid.uuid4())
    cleanup_jobs(_dossier_jobs)
    _dossier_jobs[job_id] = {"status": "queued", "_ts": time.time()}
    background_tasks.add_task(
        _run_distill,
        job_id,
        user_id=current_user.id,
        project_id=project_id,
        offer_name="",
        niche="",
        product_type="",
        funnel_type="",
        doc_paths=doc_paths,
        vsl_path=None,
        vsl_transcript=None,
        merge=True,
        linked_doc_ids=used_ids,
    )
    return {"job_id": job_id, "count": len(used_ids), "linked_doc_ids": used_ids}


@router.get("/build/{job_id}")
async def get_build_status(job_id: str, current_user=Depends(get_current_user)):
    job = _dossier_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado ou expirado.")
    return job


@router.post("/{project_id}/undo")
async def undo_offer(project_id: str, current_user=Depends(get_current_user)):
    """Desfaz a última atualização do dossiê: restaura o snapshot anterior (prev_*)
    via swap de metadados — sem re-destilar. Remove os vínculos que foram adicionados
    na última atualização."""
    sb = get_supabase()
    existing = _find_offer_record(sb, current_user.id, project_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Esse projeto ainda não tem dossiê.")

    meta = _get_file_meta(existing) or {}
    prev_key = meta.get("prev_file_key")
    if not prev_key:
        raise HTTPException(status_code=400, detail="Não há atualização anterior pra desfazer.")

    cur_key = meta.get("file_key")
    new_meta = dict(meta)
    new_meta["file_key"] = prev_key
    new_meta["linked_doc_ids"] = list(meta.get("prev_linked_doc_ids") or [])
    if meta.get("prev_file_name"):
        new_meta["file_name"] = meta["prev_file_name"]
    # após desfazer não há mais snapshot (cap de 1 nível)
    new_meta.pop("prev_file_key", None)
    new_meta.pop("prev_linked_doc_ids", None)
    new_meta.pop("prev_file_name", None)

    update_payload = {
        "raw_content": _FILE_META_PREFIX + json.dumps(new_meta),
        "template_data": new_meta,
    }
    _update_with_retry(sb, existing["id"], current_user.id, update_payload, min_keys={"raw_content"})

    # apaga o markdown que foi desfeito (best-effort)
    if cur_key and cur_key != prev_key:
        try:
            r2_storage.delete_video(cur_key)
        except Exception:
            pass

    return {
        "ok": True,
        "project_id": project_id,
        "dossier": _read_dossier_md(new_meta),
        "linked_doc_ids": new_meta.get("linked_doc_ids") or [],
    }


@router.get("/{project_id}")
async def get_offer(project_id: str, current_user=Depends(get_current_user)):
    """Retorna o dossiê da oferta do projeto + metadados, ou null se não existe."""
    sb = get_supabase()
    record = _find_offer_record(sb, current_user.id, project_id)
    if not record:
        return {"exists": False, "project_id": project_id, "dossier": "", "meta": None}
    meta = _get_file_meta(record) or {}
    dossier = _read_dossier_md(meta)
    return {
        "exists": True,
        "project_id": project_id,
        "briefing_id": record.get("id"),
        "dossier": dossier,
        "meta": {
            "offer_name": meta.get("offer_name") or record.get("title") or "",
            "niche": meta.get("niche") or record.get("market") or "",
            "product_type": meta.get("product_type") or "",
            "funnel_type": meta.get("funnel_type") or "",
        },
        "linked_doc_ids": meta.get("linked_doc_ids") or [],
        "can_undo": bool(meta.get("prev_file_key")),
        "created_at": record.get("created_at"),
    }


@router.patch("/{project_id}")
async def update_offer(
    project_id: str,
    payload: dict,
    current_user=Depends(get_current_user),
):
    """Salva um dossiê editado manualmente e/ou atualiza metadados básicos.
    Payload: { dossier?, offer_name?, niche?, product_type?, funnel_type? }"""
    sb = get_supabase()
    existing = _find_offer_record(sb, current_user.id, project_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Esse projeto ainda não tem oferta criada.")

    td = _get_file_meta(existing) or {}
    offer_name = payload.get("offer_name", td.get("offer_name", existing.get("title") or ""))
    niche = payload.get("niche", td.get("niche", existing.get("market") or ""))
    product_type = payload.get("product_type", td.get("product_type", ""))
    funnel_type = payload.get("funnel_type", td.get("funnel_type", ""))

    dossier_md = payload.get("dossier")
    if dossier_md is None:
        # só atualiza metadados — mantém o markdown atual
        dossier_md = _read_dossier_md(td)

    record = _save_dossier(
        sb,
        user_id=current_user.id,
        project_id=project_id,
        dossier_md=dossier_md,
        offer_name=offer_name,
        niche=niche,
        product_type=product_type,
        funnel_type=funnel_type,
        existing=existing,
    )
    return {
        "ok": True,
        "briefing_id": record.get("id"),
        "project_id": project_id,
    }
