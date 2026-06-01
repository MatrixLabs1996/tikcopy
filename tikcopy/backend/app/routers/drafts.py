import re
from fastapi import APIRouter, HTTPException, Depends

from app.models.schemas import DraftCreate, DraftUpdate, SuggestFieldRequest
from app.middleware.auth import get_current_user
from app.services import claude
from app.services.supabase_client import get_supabase

router = APIRouter()


def _strip_html(html: str) -> str:
    if not html:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()


def _make_lite_fields_data(fd: dict) -> dict:
    """Reduz fields_data a apenas o que a lista precisa pra mostrar — sem HTML pesado.
    Mantém: status, ads_number, hooks (texto puro só), comments count, body preview."""
    if not isinstance(fd, dict):
        return {}
    body_preview = _strip_html(fd.get("content") or fd.get("hook") or fd.get("body") or "")[:200]
    hooks = fd.get("hooks") or []
    rating = fd.get("rating") or {}
    return {
        "status": fd.get("status"),
        "ads_number": fd.get("ads_number"),
        "angle": fd.get("angle"),
        "format": fd.get("format"),
        "body_preview": body_preview,
        "hooks_count": len(hooks),
        "comments_count": len(fd.get("comments") or []),
        # Hooks só como texto puro (curto, pra preview/rating)
        "hooks": [_strip_html(h)[:120] for h in hooks],
        "rating": rating,  # ratings são pequenos, mantém
    }


@router.get("")
async def list_drafts(current_user=Depends(get_current_user)):
    """Lista 'lite' — só com o necessário pra renderizar a página Meus Anúncios.
    HTML pesado (body completo, hooks com markup) é carregado sob demanda em GET /drafts/{id}."""
    sb = get_supabase()
    res = (
        sb.table("copy_drafts")
        .select("id, title, project_id, template_id, fields_data, updated_at, created_at")
        .eq("user_id", current_user.id)
        .order("updated_at", desc=True)
        .execute()
    )
    rows = res.data or []
    # Reduz fields_data pra cada draft (preserva o que a UI usa, descarta HTML)
    for r in rows:
        r["fields_data"] = _make_lite_fields_data(r.get("fields_data") or {})
    return rows


@router.post("")
async def create_draft(body: DraftCreate, current_user=Depends(get_current_user)):
    sb = get_supabase()
    data = body.model_dump(exclude_none=True)
    data["user_id"] = current_user.id
    res = sb.table("copy_drafts").insert(data).execute()
    return res.data[0] if res.data else {}


@router.get("/{draft_id}")
async def get_draft(draft_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("copy_drafts")
        .select("*, copy_templates(name, fields)")
        .eq("id", draft_id)
        .eq("user_id", current_user.id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Rascunho não encontrado")
    return res.data


@router.patch("/{draft_id}")
async def update_draft(draft_id: str, body: DraftUpdate, current_user=Depends(get_current_user)):
    sb = get_supabase()
    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    # MERGE em fields_data ao invés de substituir tudo — protege contra clientes
    # que mandam só um sub-campo (ex: { rating: {...} }) sem perder body/hooks/comments.
    if "fields_data" in update_data and isinstance(update_data["fields_data"], dict):
        current = (
            sb.table("copy_drafts")
            .select("fields_data")
            .eq("id", draft_id)
            .eq("user_id", current_user.id)
            .single()
            .execute()
        )
        if current.data:
            existing_fd = current.data.get("fields_data") or {}
            if isinstance(existing_fd, dict):
                merged = {**existing_fd, **update_data["fields_data"]}
                update_data["fields_data"] = merged

    res = (
        sb.table("copy_drafts")
        .update(update_data)
        .eq("id", draft_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Rascunho não encontrado")
    return res.data[0]


@router.post("/{draft_id}/suggest")
async def suggest_field(
    draft_id: str, body: SuggestFieldRequest, current_user=Depends(get_current_user)
):
    sb = get_supabase()
    draft = (
        sb.table("copy_drafts")
        .select("*, copy_templates(fields)")
        .eq("id", draft_id)
        .eq("user_id", current_user.id)
        .single()
        .execute()
    )
    if not draft.data:
        raise HTTPException(status_code=404, detail="Rascunho não encontrado")

    context = body.context or draft.data.get("fields_data") or {}
    suggestion = claude.suggest_copy_field(body.field_name, body.field_label, context)
    return {"suggestion": suggestion}


@router.delete("/{draft_id}")
async def delete_draft(draft_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    sb.table("copy_drafts").delete().eq("id", draft_id).eq("user_id", current_user.id).execute()
    return {"ok": True}
