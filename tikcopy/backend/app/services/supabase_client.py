import os
from functools import lru_cache
from supabase import create_client, Client


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


def get_user_profile(user_id: str) -> dict | None:
    sb = get_supabase()
    res = sb.table("profiles").select("*").eq("id", user_id).single().execute()
    return res.data


def save_transcription(data: dict) -> dict:
    sb = get_supabase()
    res = sb.table("transcriptions").insert(data).execute()
    return res.data[0] if res.data else {}


def get_project_memory(project_id: str) -> list:
    sb = get_supabase()
    res = (
        sb.table("project_memory")
        .select("*")
        .eq("project_id", project_id)
        .eq("active", True)
        .order("frequency", desc=True)
        .execute()
    )
    return res.data or []


def save_transcript_to_memory(project_id: str | None, mem_type: str, title: str, content: str, metadata: dict | None = None) -> None:
    """Salva uma transcrição/análise automaticamente na memória do projeto.
    Silencia erros pra não derrubar a pipeline principal."""
    if not project_id or not content or not content.strip():
        return
    try:
        sb = get_supabase()
        sb.table("project_memory").insert({
            "project_id": project_id,
            "type": mem_type,  # 'transcript_organic', 'transcript_ad', 'transcript_lesson', 'vsl_analysis', 'ad_analysis'
            "content": content,
            "metadata": {
                "title": title or "Sem título",
                "auto_saved": True,
                **(metadata or {}),
            },
            "active": True,
        }).execute()
    except Exception:
        pass  # falha silenciosa — não trava transcrição
