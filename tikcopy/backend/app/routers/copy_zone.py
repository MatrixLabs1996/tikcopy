from fastapi import APIRouter, HTTPException, Depends

from app.models.schemas import ChatRequest, SwipeCreate
from app.middleware.auth import get_current_user
from app.services import claude
from app.services.supabase_client import get_supabase, get_project_memory

router = APIRouter()


@router.get("/{project_id}/memory")
async def get_memory(project_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    project = sb.table("projects").select("user_id").eq("id", project_id).single().execute()
    if not project.data or project.data["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    return get_project_memory(project_id)


@router.post("/{project_id}/chat")
async def chat(project_id: str, body: ChatRequest, current_user=Depends(get_current_user)):
    sb = get_supabase()
    project = sb.table("projects").select("user_id").eq("id", project_id).single().execute()
    if not project.data or project.data["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    memory = get_project_memory(project_id)
    response = claude.copy_zone_chat(
        message=body.message,
        project_memory=memory,
        active_context=body.active_context or {},
    )
    return {"response": response}


@router.post("/{project_id}/swipes")
async def create_swipe(project_id: str, body: SwipeCreate, current_user=Depends(get_current_user)):
    sb = get_supabase()
    data = body.model_dump(exclude_none=True)
    data["user_id"] = current_user.id
    data["project_id"] = project_id
    res = sb.table("swipes").insert(data).execute()
    return res.data[0] if res.data else {}


@router.get("/{project_id}/swipes")
async def list_swipes(project_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("swipes")
        .select("*")
        .eq("project_id", project_id)
        .eq("user_id", current_user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.post("/{project_id}/index")
async def index_project(project_id: str, current_user=Depends(get_current_user)):
    """Re-index project transcriptions to extract hooks, vocab, and objections."""
    sb = get_supabase()
    project = sb.table("projects").select("user_id").eq("id", project_id).single().execute()
    if not project.data or project.data["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    transcriptions = (
        sb.table("transcriptions")
        .select("hook, landing_phrase, body, transcript_full")
        .eq("project_id", project_id)
        .eq("user_id", current_user.id)
        .execute()
    ).data or []

    # Delete existing auto-generated memory entries
    sb.table("project_memory").delete().eq("project_id", project_id).execute()

    # Insert hooks as memory entries
    for t in transcriptions:
        if t.get("hook"):
            sb.table("project_memory").insert({
                "project_id": project_id,
                "type": "hook",
                "content": t["hook"],
            }).execute()

    return {"indexed": len(transcriptions)}
