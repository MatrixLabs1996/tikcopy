"""
Nichos — nível acima da Oferta (ex-Projeto).

Um nicho agrupa várias ofertas que compartilham a MESMA pesquisa de público
(avatar, dores, desejos, voz, nível de consciência). Cada oferta tem a sua VSL.

Etapa 1 (aditiva): só CRUD do nicho + listagem das ofertas dentro dele. A pesquisa
compartilhada e o dossiê do nicho entram na Etapa 2.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from app.middleware.auth import get_current_user
from app.services.supabase_client import get_supabase

router = APIRouter()


class NicheCreate(BaseModel):
    name: str


class NicheUpdate(BaseModel):
    name: Optional[str] = None


@router.get("")
async def list_niches(current_user=Depends(get_current_user)):
    """Lista os nichos do usuário com a contagem de ofertas dentro de cada um."""
    sb = get_supabase()
    niches = (
        sb.table("niches")
        .select("id, name, created_at")
        .eq("user_id", current_user.id)
        .order("created_at", desc=False)
        .execute()
    ).data or []
    # Contagem de ofertas (projects) por nicho
    projs = (
        sb.table("projects")
        .select("id, niche_id")
        .eq("user_id", current_user.id)
        .execute()
    ).data or []
    counts = {}
    for p in projs:
        nid = p.get("niche_id")
        if nid:
            counts[nid] = counts.get(nid, 0) + 1
    for n in niches:
        n["offers_count"] = counts.get(n["id"], 0)
    return niches


@router.post("")
async def create_niche(body: NicheCreate, current_user=Depends(get_current_user)):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Informe o nome do nicho.")
    sb = get_supabase()
    # Não duplica nicho com o mesmo nome (case-insensitive)
    existing = (
        sb.table("niches")
        .select("id, name")
        .eq("user_id", current_user.id)
        .ilike("name", name)
        .limit(1)
        .execute()
    ).data
    if existing:
        return existing[0]
    res = sb.table("niches").insert({"user_id": current_user.id, "name": name}).execute()
    return res.data[0] if res.data else {}


@router.get("/{niche_id}")
async def get_niche(niche_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("niches")
        .select("*")
        .eq("id", niche_id)
        .eq("user_id", current_user.id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Nicho não encontrado.")
    # Anexa as ofertas (projects) deste nicho
    offers = (
        sb.table("projects")
        .select("id, name, nicho, created_at")
        .eq("user_id", current_user.id)
        .eq("niche_id", niche_id)
        .order("created_at", desc=True)
        .execute()
    ).data or []
    data = res.data
    data["offers"] = offers
    return data


@router.patch("/{niche_id}")
async def update_niche(niche_id: str, body: NicheUpdate, current_user=Depends(get_current_user)):
    sb = get_supabase()
    patch = {}
    if body.name is not None and body.name.strip():
        patch["name"] = body.name.strip()
    if not patch:
        raise HTTPException(status_code=400, detail="Nada para atualizar.")
    res = (
        sb.table("niches")
        .update(patch)
        .eq("id", niche_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    return res.data[0] if res.data else {}


@router.delete("/{niche_id}")
async def delete_niche(niche_id: str, current_user=Depends(get_current_user)):
    """Exclui o nicho. As ofertas dentro dele ficam sem niche_id (não são apagadas)."""
    sb = get_supabase()
    sb.table("niches").delete().eq("id", niche_id).eq("user_id", current_user.id).execute()
    return {"ok": True}
