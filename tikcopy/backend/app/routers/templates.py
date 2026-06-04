from fastapi import APIRouter, HTTPException, Depends

from app.models.schemas import TemplateCreate, TemplateUpdate
from app.middleware.auth import get_current_user
from app.services.supabase_client import get_supabase

router = APIRouter()


@router.get("")
async def list_templates(current_user=Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("copy_templates")
        .select("*")
        .or_(f"user_id.eq.{current_user.id},is_public.eq.true")
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.post("")
async def create_template(body: TemplateCreate, current_user=Depends(get_current_user)):
    sb = get_supabase()
    data = body.model_dump()
    data["fields"] = [f.model_dump() for f in body.fields]
    data["user_id"] = current_user.id
    res = sb.table("copy_templates").insert(data).execute()
    return res.data[0] if res.data else {}


@router.patch("/{template_id}")
async def update_template(
    template_id: str, body: TemplateUpdate, current_user=Depends(get_current_user)
):
    sb = get_supabase()
    update_data = body.model_dump(exclude_none=True)
    if "fields" in update_data:
        update_data["fields"] = [f.model_dump() for f in body.fields]
    res = (
        sb.table("copy_templates")
        .update(update_data)
        .eq("id", template_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Template não encontrado")
    return res.data[0]


@router.delete("/{template_id}")
async def delete_template(template_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    sb.table("copy_templates").delete().eq("id", template_id).eq("user_id", current_user.id).execute()
    return {"ok": True}


@router.post("/{template_id}/duplicate")
async def duplicate_template(template_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    original = (
        sb.table("copy_templates")
        .select("*")
        .eq("id", template_id)
        .single()
        .execute()
    )
    if not original.data:
        raise HTTPException(status_code=404, detail="Template não encontrado")
    new_data = {k: v for k, v in original.data.items() if k not in ("id", "created_at")}
    new_data["user_id"] = current_user.id
    new_data["name"] = f"{new_data['name']} (cópia)"
    new_data["is_public"] = False
    res = sb.table("copy_templates").insert(new_data).execute()
    return res.data[0] if res.data else {}
