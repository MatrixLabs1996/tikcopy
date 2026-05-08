from fastapi import APIRouter, HTTPException, Depends

from app.models.schemas import ProjectCreate, ProjectUpdate
from app.middleware.auth import get_current_user
from app.services.supabase_client import get_supabase

router = APIRouter()


@router.get("")
async def list_projects(current_user=Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("projects")
        .select("*")
        .eq("user_id", current_user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.post("")
async def create_project(body: ProjectCreate, current_user=Depends(get_current_user)):
    sb = get_supabase()
    data = body.model_dump(exclude_none=True)
    data["user_id"] = current_user.id
    res = sb.table("projects").insert(data).execute()
    return res.data[0] if res.data else {}


@router.get("/{project_id}")
async def get_project(project_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("projects")
        .select("*, project_memory(*)")
        .eq("id", project_id)
        .eq("user_id", current_user.id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    return res.data


@router.patch("/{project_id}")
async def update_project(
    project_id: str, body: ProjectUpdate, current_user=Depends(get_current_user)
):
    sb = get_supabase()
    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
    res = (
        sb.table("projects")
        .update(update_data)
        .eq("id", project_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    return res.data[0]


@router.delete("/{project_id}")
async def delete_project(project_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    sb.table("projects").delete().eq("id", project_id).eq("user_id", current_user.id).execute()
    return {"ok": True}
