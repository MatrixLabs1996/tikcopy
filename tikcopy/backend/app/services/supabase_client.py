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


def update_minutes_used(user_id: str, minutes: int):
    sb = get_supabase()
    profile = get_user_profile(user_id)
    if profile:
        new_total = (profile.get("minutes_used") or 0) + minutes
        sb.table("profiles").update({"minutes_used": new_total}).eq("id", user_id).execute()


def save_transcription(data: dict) -> dict:
    sb = get_supabase()
    res = sb.table("transcriptions").insert(data).execute()
    return res.data[0] if res.data else {}


def get_transcriptions(user_id: str, limit: int = 50) -> list:
    sb = get_supabase()
    res = (
        sb.table("transcriptions")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


def get_projects(user_id: str) -> list:
    sb = get_supabase()
    res = (
        sb.table("projects")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


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
