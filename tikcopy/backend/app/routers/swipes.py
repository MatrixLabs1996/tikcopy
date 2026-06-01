import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.models.schemas import SwipeCreate
from app.middleware.auth import get_current_user
from app.services.supabase_client import get_supabase
from app.services import claude

logger = logging.getLogger(__name__)


def _get_user_custom_hook_types(sb, user_id: str) -> list[str]:
    """Coleta tipos custom já criados pelo usuário (extraído dos hooks existentes)."""
    try:
        res = (
            sb.table("swipes")
            .select("content")
            .eq("user_id", user_id)
            .eq("tag", "hook")
            .execute()
        )
        fixed = set(claude.HOOK_TYPES)
        custom = set()
        for s in res.data or []:
            try:
                c = json.loads(s["content"]) if isinstance(s["content"], str) else s["content"]
                ht = c.get("hook_type")
                if ht and ht not in fixed:
                    custom.add(ht)
            except Exception:
                continue
        return sorted(custom)
    except Exception:
        return []


def _classify_and_merge(content_dict: dict, sb=None, user_id: str | None = None) -> dict:
    """Roda a IA classificando o hook e mescla o resultado no content_dict.
    Passa os tipos custom já existentes do usuário pra IA reaproveitar.
    Não falha a request se a IA falhar."""
    hook = content_dict.get("hook")
    if not hook:
        return content_dict
    try:
        existing = _get_user_custom_hook_types(sb, user_id) if (sb and user_id) else []
        result = claude.classify_hook(hook, existing_custom_types=existing)
        if result.get("hook_type"):
            content_dict["hook_type"] = result["hook_type"]
        if result.get("emotion"):
            content_dict["emotion"] = result["emotion"]
        if result.get("is_new_type"):
            content_dict["hook_type_is_new"] = True   # flag pro frontend mostrar "✨ novo"
    except Exception as exc:
        logger.warning(f"[SWIPES] classify_hook falhou: {exc}")
    return content_dict

router = APIRouter()


class SwipeUpdate(BaseModel):
    content: Optional[str] = None
    tag: Optional[str] = None
    source: Optional[str] = None
    project_id: Optional[str] = None


# ─── Listagem com filtros ────────────────────────────────────────────────────

@router.get("")
async def list_swipes(
    tag: Optional[str] = None,
    project_id: Optional[str] = None,
    search: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    """Lista swipes do usuário com filtros opcionais.
    - tag: 'hook' | 'ad' | 'avatar'
    - project_id: filtra por projeto (ou 'none' pra swipes sem projeto)
    - search: busca textual no content
    """
    sb = get_supabase()
    query = (
        sb.table("swipes")
        .select("*")
        .eq("user_id", current_user.id)
        .order("created_at", desc=True)
    )
    if tag:
        query = query.eq("tag", tag)
    if project_id == "none":
        query = query.is_("project_id", "null")
    elif project_id:
        query = query.eq("project_id", project_id)

    data = query.execute().data or []

    # Busca textual em Python (case-insensitive, busca no content + source)
    if search:
        needle = search.lower().strip()
        data = [
            s for s in data
            if needle in (s.get("content") or "").lower()
            or needle in (s.get("source") or "").lower()
        ]
    return data


# ─── Contagem por tag (pra mostrar nas abas) ─────────────────────────────────

@router.get("/counts")
async def swipe_counts(project_id: Optional[str] = None, current_user=Depends(get_current_user)):
    """Conta swipes por tag (hook, ad, organico, avatar). Tolera variações
    ('organic' vs 'organico', maiúsculas, espaços)."""
    sb = get_supabase()
    query = sb.table("swipes").select("tag").eq("user_id", current_user.id)
    if project_id == "none":
        query = query.is_("project_id", "null")
    elif project_id:
        query = query.eq("project_id", project_id)

    data = query.execute().data or []
    counts = {"hook": 0, "ad": 0, "organico": 0, "avatar": 0, "total": len(data)}
    # Aliases comuns que devem mapear pra a chave canônica
    alias = {
        "organic": "organico",
        "orgânico": "organico",
        "orgânicos": "organico",
        "organicos": "organico",
        "ads": "ad",
        "hooks": "hook",
        "avatars": "avatar",
        "avatares": "avatar",
    }
    unknown_tags = {}
    for s in data:
        raw = (s.get("tag") or "").strip().lower()
        key = alias.get(raw, raw)
        if key in counts:
            counts[key] += 1
        elif raw:
            unknown_tags[raw] = unknown_tags.get(raw, 0) + 1
    if unknown_tags:
        logger.warning(f"[swipes/counts] tags não mapeadas: {unknown_tags}")
    return counts


# ─── Taxonomia: nichos + formatos já usados (pra dropdowns) ──────────────────

@router.get("/taxonomy")
async def swipe_taxonomy(current_user=Depends(get_current_user)):
    """Retorna todos os nichos e formatos que o usuário JÁ usou (em swipes e projetos),
    pra os dropdowns de tag mostrarem valores custom criados em qualquer lugar."""
    sb = get_supabase()
    niches, formats = set(), set()

    res = sb.table("swipes").select("content").eq("user_id", current_user.id).execute()
    for r in res.data or []:
        try:
            c = json.loads(r["content"]) if isinstance(r["content"], str) else r["content"]
        except Exception:
            continue
        if isinstance(c, dict):
            n = (c.get("niche") or "").strip()
            f = (c.get("format") or "").strip()
            if n: niches.add(n)
            if f: formats.add(f)

    try:
        proj = sb.table("projects").select("nicho").eq("user_id", current_user.id).execute()
        for p in proj.data or []:
            n = (p.get("nicho") or "").strip()
            if n: niches.add(n)
    except Exception:
        pass

    return {"niches": sorted(niches), "formats": sorted(formats)}


# ─── CRUD ───────────────────────────────────────────────────────────────────

@router.post("")
async def create_swipe(body: SwipeCreate, current_user=Depends(get_current_user)):
    sb = get_supabase()
    data = body.model_dump(exclude_none=True)
    data["user_id"] = current_user.id

    # Se for hook, auto-classifica antes de salvar + status automático por origem
    if data.get("tag") == "hook" and data.get("content"):
        try:
            content_dict = json.loads(data["content"]) if isinstance(data["content"], str) else data["content"]
            if isinstance(content_dict, dict):
                content_dict = _classify_and_merge(content_dict, sb=sb, user_id=current_user.id)
                # Status automático: orgânico → viral; manual → inspiração; ad → em_teste (padrão)
                if not content_dict.get("status"):
                    origin = content_dict.get("source")
                    if origin == "organic":
                        content_dict["status"] = "viral"
                    elif origin == "manual":
                        content_dict["status"] = "inspiracao"
                    else:
                        content_dict["status"] = "inspiracao"
                data["content"] = json.dumps(content_dict)
        except json.JSONDecodeError:
            pass

    res = sb.table("swipes").insert(data).execute()
    return res.data[0] if res.data else {}


@router.post("/classify/{swipe_id}")
async def reclassify_swipe(swipe_id: str, current_user=Depends(get_current_user)):
    """Re-roda a IA pra classificar tipo + emoção de um hook específico."""
    sb = get_supabase()
    res = sb.table("swipes").select("*").eq("id", swipe_id).eq("user_id", current_user.id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Swipe não encontrado")

    swipe = res.data
    if swipe.get("tag") != "hook":
        raise HTTPException(status_code=400, detail="Só hooks podem ser classificados")

    try:
        content_dict = json.loads(swipe["content"]) if isinstance(swipe["content"], str) else swipe["content"]
        if not isinstance(content_dict, dict):
            raise HTTPException(status_code=400, detail="Content mal formatado")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Content não é JSON")

    content_dict = _classify_and_merge(content_dict, sb=sb, user_id=current_user.id)
    sb.table("swipes").update({"content": json.dumps(content_dict)}).eq("id", swipe_id).execute()
    return {
        "ok": True,
        "hook_type": content_dict.get("hook_type"),
        "emotion": content_dict.get("emotion"),
    }


@router.post("/classify-all")
async def reclassify_all_hooks(
    only_missing: bool = True,
    current_user=Depends(get_current_user),
):
    """Roda IA em todos os hooks do usuário.
    only_missing=True: só classifica os que ainda não têm hook_type.
    only_missing=False: re-classifica TUDO (pode estourar API)."""
    sb = get_supabase()
    res = (
        sb.table("swipes")
        .select("id, content")
        .eq("user_id", current_user.id)
        .eq("tag", "hook")
        .execute()
    )
    hooks = res.data or []
    classified = 0
    skipped = 0
    errors = 0

    for h in hooks:
        try:
            content_dict = json.loads(h["content"]) if isinstance(h["content"], str) else h["content"]
            if not isinstance(content_dict, dict):
                skipped += 1
                continue
            if only_missing and content_dict.get("hook_type"):
                skipped += 1
                continue
            content_dict = _classify_and_merge(content_dict, sb=sb, user_id=current_user.id)
            content_dict.setdefault("status", "inspiracao")
            sb.table("swipes").update({"content": json.dumps(content_dict)}).eq("id", h["id"]).execute()
            classified += 1
        except Exception as exc:
            logger.warning(f"[SWIPES] classify-all falhou no swipe {h.get('id')}: {exc}")
            errors += 1

    return {"classified": classified, "skipped": skipped, "errors": errors, "total": len(hooks)}


@router.patch("/{swipe_id}")
async def update_swipe(
    swipe_id: str, body: SwipeUpdate, current_user=Depends(get_current_user)
):
    sb = get_supabase()
    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        return {}
    res = (
        sb.table("swipes")
        .update(update_data)
        .eq("id", swipe_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    return res.data[0] if res.data else {}


@router.delete("/{swipe_id}")
async def delete_swipe(swipe_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    # Antes de apagar o registro, remove o vídeo do R2 (se houver) pra liberar espaço
    try:
        res = sb.table("swipes").select("content").eq("id", swipe_id).eq("user_id", current_user.id).single().execute()
        if res.data:
            content = json.loads(res.data["content"]) if isinstance(res.data["content"], str) else (res.data["content"] or {})
            key = (content.get("video") or {}).get("key")
            if key:
                from app.services import r2_storage
                r2_storage.delete_video(key)
    except Exception as exc:
        logger.warning(f"[swipes] falha ao remover vídeo do R2 ({swipe_id}): {exc}")

    sb.table("swipes").delete().eq("id", swipe_id).eq("user_id", current_user.id).execute()
    return {"ok": True}


# ─── Importação em massa ────────────────────────────────────────────────────

class BulkImport(BaseModel):
    items: list[dict]  # [{tag, content, source?, project_id?, custom_tags?}]


@router.post("/bulk-import")
async def bulk_import(body: BulkImport, current_user=Depends(get_current_user)):
    """Importa vários swipes de uma vez. Útil pra migrar de planilha."""
    sb = get_supabase()
    if not body.items:
        raise HTTPException(status_code=400, detail="Lista vazia")
    rows = []
    for it in body.items:
        if not it.get("tag") or it["tag"] not in ("hook", "ad", "avatar"):
            continue
        if not it.get("content"):
            continue
        rows.append({
            "user_id": current_user.id,
            "tag": it["tag"],
            "content": str(it["content"]),
            "source": it.get("source"),
            "project_id": it.get("project_id"),
        })
    if not rows:
        raise HTTPException(status_code=400, detail="Nenhum item válido (precisa de tag + content)")
    res = sb.table("swipes").insert(rows).execute()
    return {"imported": len(res.data or [])}
