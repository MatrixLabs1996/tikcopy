import logging

from fastapi import APIRouter, HTTPException, Depends

from app.models.schemas import ProjectCreate, ProjectUpdate
from app.middleware.auth import get_current_user
from app.services.supabase_client import get_supabase
from app.services import r2_storage

router = APIRouter()
logger = logging.getLogger(__name__)

DEFAULT_PROJECT_NAME = "Geral"


def _cleanup_project_briefings(sb, user_id: str, project_id: str) -> None:
    """Remove os briefings (dossiê da oferta + pesquisas) do projeto e seus arquivos no R2."""
    try:
        res = (
            sb.table("briefings")
            .select("id, template_data")
            .eq("user_id", user_id)
            .eq("project_id", project_id)
            .execute()
        )
    except Exception as exc:
        logger.warning(f"[projects] erro listando briefings pra limpar: {exc}")
        return
    for row in res.data or []:
        td = row.get("template_data")
        file_key = td.get("file_key") if isinstance(td, dict) else None
        if file_key:
            try:
                r2_storage.delete_video(file_key)
            except Exception as exc:
                logger.warning(f"[projects] erro removendo arquivo do R2 {file_key}: {exc}")
    try:
        sb.table("briefings").delete().eq("user_id", user_id).eq("project_id", project_id).execute()
    except Exception as exc:
        logger.warning(f"[projects] erro removendo briefings do projeto: {exc}")


def _ensure_default_project(sb, user_id: str, existing: list) -> dict:
    """Garante que o usuário sempre tenha um projeto 'Geral'. Retorna ele.
    Insere apenas campos seguros — caso a tabela não tenha 'description', tenta sem."""
    for p in existing or []:
        if (p.get("name") or "").strip().lower() == DEFAULT_PROJECT_NAME.lower():
            return p
    payload = {
        "user_id": user_id,
        "name": DEFAULT_PROJECT_NAME,
        "description": "Espaço livre pra transcrições e testes sem projeto específico.",
    }
    try:
        res = sb.table("projects").insert(payload).execute()
    except Exception as exc:
        # Coluna inexistente → tenta sem o campo opcional
        if "description" in str(exc):
            res = sb.table("projects").insert({k: v for k, v in payload.items() if k != "description"}).execute()
        else:
            raise
    return res.data[0] if res.data else {}


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
    projects = res.data or []
    # Auto-cria "Geral" se ainda não existir
    has_default = any(
        (p.get("name") or "").strip().lower() == DEFAULT_PROJECT_NAME.lower()
        for p in projects
    )
    if not has_default:
        default = _ensure_default_project(sb, current_user.id, projects)
        if default:
            projects.append(default)
    return projects


@router.post("")
async def create_project(body: ProjectCreate, current_user=Depends(get_current_user)):
    sb = get_supabase()
    data = body.model_dump(exclude_none=True)
    # Bloqueia criar outro projeto com nome "Geral" (case-insensitive)
    if (data.get("name") or "").strip().lower() == DEFAULT_PROJECT_NAME.lower():
        raise HTTPException(status_code=400, detail=f'O nome "{DEFAULT_PROJECT_NAME}" é reservado pro projeto padrão.')
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

    # Se tá tentando renomear, não pode usar "Geral" (reservado) nem renomear o próprio Geral
    current = (
        sb.table("projects")
        .select("name")
        .eq("id", project_id)
        .eq("user_id", current_user.id)
        .single()
        .execute()
    )
    if not current.data:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    current_name = (current.data.get("name") or "").strip().lower()
    new_name = (update_data.get("name") or "").strip().lower() if update_data.get("name") else None

    if current_name == DEFAULT_PROJECT_NAME.lower() and new_name and new_name != DEFAULT_PROJECT_NAME.lower():
        raise HTTPException(status_code=400, detail=f'O projeto "{DEFAULT_PROJECT_NAME}" não pode ser renomeado.')
    if new_name == DEFAULT_PROJECT_NAME.lower() and current_name != DEFAULT_PROJECT_NAME.lower():
        raise HTTPException(status_code=400, detail=f'O nome "{DEFAULT_PROJECT_NAME}" é reservado pro projeto padrão.')

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
    # Bloqueia deletar o projeto "Geral"
    current = (
        sb.table("projects")
        .select("name")
        .eq("id", project_id)
        .eq("user_id", current_user.id)
        .single()
        .execute()
    )
    if current.data and (current.data.get("name") or "").strip().lower() == DEFAULT_PROJECT_NAME.lower():
        raise HTTPException(status_code=400, detail=f'O projeto "{DEFAULT_PROJECT_NAME}" não pode ser excluído.')
    # Limpa o dossiê da oferta + pesquisas (registros + arquivos no R2) antes de remover o projeto.
    _cleanup_project_briefings(sb, current_user.id, project_id)
    sb.table("projects").delete().eq("id", project_id).eq("user_id", current_user.id).execute()
    return {"ok": True}
