"""
Painel admin — só pro(s) email(s) em ADMIN_EMAILS (.env).

Mostra o uso/custo de IA de TODAS as contas, pra precificar os planos com dados
reais. Base: tabela usage_events alimentada pelo usage_tracker.
"""
import os
from fastapi import APIRouter, Depends, HTTPException

from app.middleware.auth import get_current_user
from app.services.supabase_client import get_supabase
from app.services.usage_tracker import USD_TO_BRL

router = APIRouter()


def _admin_emails() -> set:
    raw = os.getenv("ADMIN_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def require_admin(current_user=Depends(get_current_user)):
    email = (getattr(current_user, "email", "") or "").lower()
    if email not in _admin_emails():
        raise HTTPException(status_code=403, detail="Acesso restrito.")
    return current_user


@router.get("/me")
async def am_i_admin(current_user=Depends(get_current_user)):
    """Frontend usa isso pra decidir se mostra o link do painel."""
    email = (getattr(current_user, "email", "") or "").lower()
    return {"is_admin": email in _admin_emails()}


@router.get("/usage")
async def usage_overview(_admin=Depends(require_admin)):
    """Resumo de uso/custo por USUÁRIO + por operação + totais."""
    sb = get_supabase()
    # Puxa tudo (paginação simples — pra MVP de teste, volume é baixo)
    rows = []
    page = 0
    while True:
        res = (sb.table("usage_events")
               .select("user_id, operation, model, input_tokens, output_tokens, "
                       "cache_read_tokens, cache_write_tokens, cost_usd, created_at")
               .order("created_at", desc=True)
               .range(page * 1000, page * 1000 + 999)
               .execute())
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < 1000:
            break
        page += 1

    # Mapeia user_id → email (via profiles, se existir)
    emails = {}
    try:
        profs = sb.table("profiles").select("id, email").execute().data or []
        emails = {p["id"]: p.get("email") for p in profs}
    except Exception:
        pass

    by_user = {}
    by_op = {}
    total_cost = 0.0
    total_events = len(rows)
    for r in rows:
        uid = r["user_id"]
        cost = float(r.get("cost_usd") or 0)
        total_cost += cost
        u = by_user.setdefault(uid, {
            "user_id": uid, "email": emails.get(uid) or uid[:8],
            "events": 0, "cost_usd": 0.0, "ops": {},
        })
        u["events"] += 1
        u["cost_usd"] += cost
        u["ops"][r["operation"]] = u["ops"].get(r["operation"], 0) + 1

        op = by_op.setdefault(r["operation"], {"operation": r["operation"], "events": 0, "cost_usd": 0.0})
        op["events"] += 1
        op["cost_usd"] += cost

    # Formata pra saída
    for u in by_user.values():
        u["cost_usd"] = round(u["cost_usd"], 4)
        u["cost_brl"] = round(u["cost_usd"] * USD_TO_BRL, 2)
    for o in by_op.values():
        o["cost_usd"] = round(o["cost_usd"], 4)
        o["cost_brl"] = round(o["cost_usd"] * USD_TO_BRL, 2)

    users = sorted(by_user.values(), key=lambda x: x["cost_usd"], reverse=True)
    ops = sorted(by_op.values(), key=lambda x: x["cost_usd"], reverse=True)

    return {
        "total_events": total_events,
        "total_cost_usd": round(total_cost, 4),
        "total_cost_brl": round(total_cost * USD_TO_BRL, 2),
        "usd_to_brl": USD_TO_BRL,
        "users": users,
        "operations": ops,
    }
