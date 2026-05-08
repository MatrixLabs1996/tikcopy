from fastapi import APIRouter, HTTPException, Depends

from app.models.schemas import DraftCreate, DraftUpdate, SuggestFieldRequest
from app.middleware.auth import get_current_user
from app.services import claude
from app.services.supabase_client import get_supabase

router = APIRouter()


@router.get("")
async def list_drafts(current_user=Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("copy_drafts")
        .select("id, title, project_id, template_id, updated_at, created_at")
        .eq("user_id", current_user.id)
        .order("updated_at", desc=True)
        .execute()
    )
    return res.data or []


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
