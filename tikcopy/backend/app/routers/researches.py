from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from typing import Optional

from app.models.schemas import ResearchCreate, ResearchUpdate
from app.middleware.auth import get_current_user
from app.services import claude
from app.services.supabase_client import get_supabase

router = APIRouter()


@router.get("")
async def list_researches(current_user=Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("researches")
        .select("id, title, project_id, market, created_at")
        .eq("user_id", current_user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.post("")
async def create_research(body: ResearchCreate, current_user=Depends(get_current_user)):
    sb = get_supabase()
    data = body.model_dump(exclude_none=True)
    data["user_id"] = current_user.id
    res = sb.table("researches").insert(data).execute()
    return res.data[0] if res.data else {}


@router.post("/upload")
async def create_research_from_file(
    file: UploadFile = File(...),
    project_id: Optional[str] = Form(None),
    current_user=Depends(get_current_user),
):
    content = await file.read()
    text = content.decode("utf-8", errors="replace")
    fields = claude.extract_research_fields(text)
    fields["user_id"] = current_user.id
    fields["raw_content"] = text
    if project_id:
        fields["project_id"] = project_id
    sb = get_supabase()
    res = sb.table("researches").insert(fields).execute()
    return res.data[0] if res.data else {}


@router.get("/{research_id}")
async def get_research(research_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("researches")
        .select("*")
        .eq("id", research_id)
        .eq("user_id", current_user.id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Pesquisa não encontrada")
    return res.data


@router.patch("/{research_id}")
async def update_research(
    research_id: str, body: ResearchUpdate, current_user=Depends(get_current_user)
):
    sb = get_supabase()
    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
    res = (
        sb.table("researches")
        .update(update_data)
        .eq("id", research_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Pesquisa não encontrada")
    return res.data[0]


@router.delete("/{research_id}")
async def delete_research(research_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    sb.table("researches").delete().eq("id", research_id).eq("user_id", current_user.id).execute()
    return {"ok": True}
