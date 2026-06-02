"""
Brainstorm ADS — gera conceitos de anúncio novos a partir dos anúncios selecionados
no Swipe, cruzando as 7 Camadas Macro + as 5 Portas de Entrada (Leilões Fantasmas).
Retorna padrões observados, lacunas e conceitos (conceito + 7 camadas, sem copy escrita).
"""
import json
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from app.middleware.auth import get_current_user
from app.services.supabase_client import get_supabase
from app.services import claude

logger = logging.getLogger(__name__)
router = APIRouter()


class BrainstormRequest(BaseModel):
    project_id: Optional[str] = None
    swipe_ids: list[str] = []
    niche: Optional[str] = None


class CouncilRequest(BaseModel):
    project_id: Optional[str] = None
    concepts: list[dict] = []
    niche: Optional[str] = None


def _parse(content):
    try:
        return json.loads(content) if isinstance(content, str) else (content or {})
    except Exception:
        return {}


@router.post("")
async def generate_brainstorm(body: BrainstormRequest, current_user=Depends(get_current_user)):
    if not body.swipe_ids:
        raise HTTPException(status_code=422, detail="Selecione ao menos 1 anúncio do Swipe.")

    sb = get_supabase()
    res = (
        sb.table("swipes")
        .select("id, content")
        .eq("user_id", current_user.id)
        .in_("id", body.swipe_ids)
        .execute()
    )

    ads = []
    niche = (body.niche or "").strip()
    for row in (res.data or []):
        c = _parse(row.get("content"))
        ads.append({
            "title": c.get("title") or "Anúncio",
            "hook": c.get("hook_written") or c.get("hook") or "",
            "body": c.get("body") or c.get("transcript_full") or "",
            "seven_layers": c.get("seven_layers"),
        })
        if not niche and c.get("niche"):
            niche = c["niche"]

    if not ads:
        raise HTTPException(status_code=404, detail="Anúncios não encontrados.")

    # Oferta do projeto pra manter os conceitos congruentes (reusa helper da ai.py)
    offer_summary = ""
    try:
        from app.routers.ai import _get_offer
        offer = _get_offer(current_user.id, body.project_id) or {}
        offer_summary = offer.get("content") or ""
        if not niche:
            niche = offer.get("market") or ""
    except Exception as exc:
        logger.warning(f"[brainstorm] sem oferta: {exc}")

    result = claude.generate_brainstorm_ads(
        ads, offer_summary=offer_summary, niche=niche,
        track_user_id=current_user.id, track_project_id=body.project_id,
    )
    if not result:
        raise HTTPException(status_code=502, detail="A IA não retornou um brainstorm válido. Tente de novo.")
    result["_meta"] = {"ads_count": len(ads), "niche": niche}
    return result


@router.post("/council")
async def run_council(body: CouncilRequest, current_user=Depends(get_current_user)):
    """Conselho dos 5: pressiona os conceitos gerados e crava um veredito."""
    if not body.concepts:
        raise HTTPException(status_code=422, detail="Gere os conceitos primeiro.")

    offer_summary = ""
    niche = (body.niche or "").strip()
    try:
        from app.routers.ai import _get_offer
        offer = _get_offer(current_user.id, body.project_id) or {}
        offer_summary = offer.get("content") or ""
        if not niche:
            niche = offer.get("market") or ""
    except Exception as exc:
        logger.warning(f"[council] sem oferta: {exc}")

    result = claude.brainstorm_council(
        body.concepts, offer_summary=offer_summary, niche=niche,
        track_user_id=current_user.id, track_project_id=body.project_id,
    )
    if not result:
        raise HTTPException(status_code=502, detail="O conselho não retornou um veredito válido. Tente de novo.")
    return result
