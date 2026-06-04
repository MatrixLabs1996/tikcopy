"""
Públicos — fatias de público por nicho do usuário.
Cada nicho pode ter vários públicos (ex: emagrecimento → mulher pós-parto, menopausa, homem 40+).
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from app.models.schemas import PublicoCreate, PublicoUpdate
from app.middleware.auth import get_current_user
from app.services.supabase_client import get_supabase

router = APIRouter()


@router.get("")
async def list_publicos(
    nicho: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    """Lista os públicos do usuário. Filtra por nicho se fornecido."""
    sb = get_supabase()
    q = sb.table("publicos").select("*").eq("user_id", current_user.id)
    if nicho:
        q = q.eq("nicho", nicho)
    res = q.order("nome", desc=False).execute()
    return res.data or []


@router.post("")
async def create_publico(body: PublicoCreate, current_user=Depends(get_current_user)):
    sb = get_supabase()
    nicho = body.nicho.strip()
    nome = body.nome.strip()
    if not nicho or not nome:
        raise HTTPException(status_code=400, detail="Nicho e nome são obrigatórios")
    try:
        res = sb.table("publicos").insert({
            "user_id": current_user.id,
            "nicho": nicho,
            "nome": nome,
        }).execute()
    except Exception as exc:
        # duplicate key
        if "duplicate" in str(exc).lower() or "unique" in str(exc).lower():
            raise HTTPException(status_code=409, detail=f'Público "{nome}" já existe nesse nicho.')
        raise
    return res.data[0] if res.data else {}


@router.patch("/{publico_id}")
async def update_publico(
    publico_id: str, body: PublicoUpdate, current_user=Depends(get_current_user)
):
    sb = get_supabase()
    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    res = (
        sb.table("publicos")
        .update(update_data)
        .eq("id", publico_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Público não encontrado")
    return res.data[0]


@router.delete("/{publico_id}")
async def delete_publico(publico_id: str, current_user=Depends(get_current_user)):
    sb = get_supabase()
    sb.table("publicos").delete().eq("id", publico_id).eq("user_id", current_user.id).execute()
    return {"ok": True}
