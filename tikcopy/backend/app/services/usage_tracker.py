"""
Medidor de uso/custo de IA.

Grava um evento por chamada de IA (quem, qual operação, tokens, custo estimado)
na tabela `usage_events` do Supabase. Usado pelo painel /admin pra ver quanto
cada conta está gastando — base pra precificar os planos com dados reais.

Tudo é best-effort: se o tracking falhar, NUNCA derruba a operação principal.
"""
import logging

from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# Preços por MILHÃO de tokens (USD). Atualize se a Anthropic/serviços mudarem.
# Sonnet 4.x e Haiku 4.x. Cache read = 10% do input; cache write = 125% do input.
_PRICES = {
    "claude-sonnet-4-6": {"in": 3.00, "out": 15.00},
    "claude-sonnet-4-5": {"in": 3.00, "out": 15.00},
    "claude-haiku-4-5":  {"in": 0.80, "out": 4.00},
    "claude-opus-4-8":   {"in": 15.00, "out": 75.00},
}
_DEFAULT_PRICE = {"in": 3.00, "out": 15.00}

USD_TO_BRL = 5.30   # câmbio aproximado pra exibir em R$


def _cost_usd(model: str, usage) -> float:
    """Calcula o custo em USD a partir do objeto usage da resposta do Claude."""
    p = _PRICES.get(model, _DEFAULT_PRICE)
    inp = getattr(usage, "input_tokens", 0) or 0
    out = getattr(usage, "output_tokens", 0) or 0
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0
    cost = (
        inp * p["in"]
        + out * p["out"]
        + cache_read * p["in"] * 0.10      # leitura de cache custa 10% do input
        + cache_write * p["in"] * 1.25     # escrita de cache custa 125% do input
    ) / 1_000_000
    return round(cost, 6)


def track_claude(*, user_id: str, operation: str, model: str, usage,
                 project_id: str = None, meta: dict = None):
    """Registra uma chamada do Claude. `usage` é resp.usage da SDK."""
    try:
        inp = getattr(usage, "input_tokens", 0) or 0
        out = getattr(usage, "output_tokens", 0) or 0
        cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
        cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0
        cost = _cost_usd(model, usage)
        _insert(
            user_id=user_id, operation=operation, provider="anthropic", model=model,
            input_tokens=inp, output_tokens=out,
            cache_read_tokens=cache_read, cache_write_tokens=cache_write,
            units=0, cost_usd=cost, project_id=project_id, meta=meta,
        )
    except Exception as exc:
        logger.warning(f"[usage] falha ao registrar claude ({operation}): {exc}")


def track_flat(*, user_id: str, operation: str, provider: str, cost_usd: float = 0.0,
               units: float = 0, model: str = "", project_id: str = None, meta: dict = None):
    """Registra um custo "fixo" sem tokens (ex: transcrição AssemblyAI por minuto)."""
    try:
        _insert(
            user_id=user_id, operation=operation, provider=provider, model=model,
            input_tokens=0, output_tokens=0, cache_read_tokens=0, cache_write_tokens=0,
            units=units, cost_usd=round(cost_usd, 6), project_id=project_id, meta=meta,
        )
    except Exception as exc:
        logger.warning(f"[usage] falha ao registrar flat ({operation}): {exc}")


def _insert(**row):
    sb = get_supabase()
    if row.get("meta") is None:
        row.pop("meta", None)
    sb.table("usage_events").insert(row).execute()
