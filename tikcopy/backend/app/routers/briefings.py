from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from typing import Optional

from app.models.schemas import BriefingCreate, BriefingUpdate
from app.middleware.auth import get_current_user
from app.services import claude
from app.services.supabase_client import get_supabase

router = APIRouter()


@router.get("")
async def list_briefings(current_user=Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("briefings")
        .select("id, title, project_id, angle, format, created_at")
        .eq("user_id", current_user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.post("")
async def create_briefing(body: BriefingCreate, current_user=Depends(get_current_user)):
    sb = get_supabase()
    data = body.model_dump(exclude_none=True)
    data["user_id"] = current_user.id
    res = sb.table("briefings").insert(data).execute()
    return res.data[0] if res.data else {}


@router.post("/upload")
async def create_briefing_from_file(
    file: UploadFile = File(...),
    project_id: Optional[str] = Form(None),
    current_user=Depends(get_current_user),
):
    content = await file.read()
    text = content.decode("utf-8", errors="replace")
    fields = claude.extract_briefing_fields(text)
    fields["user_id"] = current_user.id
    fields["raw_content"] = text
    if project_id:
        fields["project_id"] = project_id
    sb = get_supabase()
    res = sb.table("briefings").insert(fields).execute()
    return res.data[0] if res.data else {}


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
