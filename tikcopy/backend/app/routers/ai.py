"""
AI Writer — endpoints que dão suporte aos modos Híbrido e Automático
do editor de copy.

- POST /ai/suggest-field : sugere conteúdo pra UM campo (hook, body, etc.)
                          recebendo todo o contexto atual.
- POST /ai/chat          : chat livre com a IA, com contexto do projeto/briefing/copy.
- POST /ai/generate-copy : modo automático — gera copy do zero a partir
                          de briefing + pesquisas selecionadas.
"""
import json
import logging
import os
import re
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import anthropic

from app.middleware.auth import get_current_user
from app.services.supabase_client import get_supabase
from app.services.amanda_method import build_hook_prompt, build_structure_prompt
from app.services.amanda_copy_method import build_body_prompt, build_improve_prompt, SYSTEM_BASE, POWER_PHRASES, COPY_STRUCTURE

logger = logging.getLogger(__name__)
router = APIRouter()

from app.services.ai_models import SONNET_MODEL
from app.services import usage_tracker

MODEL = SONNET_MODEL
# Modelo "Boost": qualidade máxima pras gerações de copy quando o usuário liga o boost.
BOOST_MODEL = os.getenv("COPY_BOOST_MODEL", "claude-opus-4-8")
# Trava de segurança: o Boost (Opus, caro) só é permitido se EXPLICITAMENTE habilitado
# via env. Sem isso, um `boost: true` vindo do frontend (ex: localStorage antigo) é
# ignorado e usamos sempre o Sonnet. Pra reativar: COPY_BOOST_ENABLED=true no .env.
BOOST_ENABLED = os.getenv("COPY_BOOST_ENABLED", "false").lower() in ("true", "1", "yes")
MAX_TOKENS_SUGGEST = 800
MAX_TOKENS_CHAT = 1500
MAX_TOKENS_GENERATE = 4000


def _pick_model(boost: bool = False) -> str:
    """Escolhe o modelo: Boost (Opus) só quando ligado E permitido por env; senão Sonnet."""
    return BOOST_MODEL if (boost and BOOST_ENABLED) else MODEL


def _claude_client():
    return anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))


# Dossiês com pelo menos ~1024 tokens valem cache (mínimo da API). Abaixo disso o
# cache não ativa e não há perda — só não economiza.
_CACHE_MIN_CHARS = 3000


def _call_with_cache(*, model, max_tokens, prompt, cache_prefix=None,
                     user_id=None, operation="ai", project_id=None):
    """Chama o Claude separando um PREFIXO ESTÁVEL (cache_prefix, ex: dossiê da oferta)
    pra prompt caching. O dossiê é idêntico entre gerações do mesmo projeto, então fica
    em cache e o input cacheado custa ~90% menos (a partir da 2ª chamada em ~5min).

    Registra o uso/custo no medidor (best-effort).
    """
    client = _claude_client()
    if cache_prefix and len(cache_prefix) >= _CACHE_MIN_CHARS:
        resp = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=[{
                "type": "text",
                "text": cache_prefix,
                "cache_control": {"type": "ephemeral"},
            }],
            messages=[{"role": "user", "content": prompt}],
        )
    else:
        resp = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
    if user_id:
        usage_tracker.track_claude(
            user_id=user_id, operation=operation, model=model,
            usage=resp.usage, project_id=project_id,
        )
    return resp


# ─── SCHEMAS ────────────────────────────────────────────────────────────────

class WriterContext(BaseModel):
    """Contexto compartilhado entre todos os endpoints — tudo opcional."""
    project_id: Optional[str] = None
    offer_id: Optional[str] = None        # briefing da OFERTA selecionada (pra qual produto/funil escrever)
    briefing: Optional[dict] = None       # campos do briefing (angle_why, new_idea, organic_base etc.)
    meta: Optional[dict] = None           # ads_number, angle, format, avatar, etc.
    current_hooks: Optional[list[str]] = None
    current_body: Optional[str] = None
    reference: Optional[dict] = None      # anúncio de referência selecionado pra MODELAR {title, niche, content}
    boost: bool = False                   # liga o modelo premium (Opus) nas gerações de copy


class SuggestFieldRequest(WriterContext):
    field: str                  # ex: "hook", "body", "briefing.angle_why"
    current_value: Optional[str] = None
    instruction: Optional[str] = None  # instrução extra opcional ("mais curto", "tom agressivo")
    n: int = 3                  # número de sugestões
    # ── Menu de estratégias do "Sugerir Hook" (field == "hook") ──
    strategy: Optional[str] = None      # "organico" | "swipe_same" | "swipe_other" | "validated"
    swipe_source: Optional[str] = None  # "ad" | "organic" — origem dos hooks do swipe (strategy swipe_same)
    selected_hook: Optional[str] = None # hook validado escolhido (strategy == "validated")
    validated_mode: Optional[str] = None # "similar" (gerar semelhante) | "same" (usar o mesmo)


class ChatMessage(BaseModel):
    role: str   # 'user' | 'assistant'
    content: str


class ChatRequest(WriterContext):
    message: str
    history: list[ChatMessage] = []


# ─── HELPERS ────────────────────────────────────────────────────────────────

def _build_context_block(ctx: WriterContext) -> str:
    """Monta um bloco de texto com o contexto atual da copy pra IA usar."""
    parts = []
    # Referência selecionada pra MODELAR — vai PRIMEIRO e com destaque máximo.
    if ctx.reference and isinstance(ctx.reference, dict):
        ref_content = (ctx.reference.get("content") or "").strip()
        if ref_content:
            ref_title = ctx.reference.get("title") or "Anúncio de referência"
            ref_niche = ctx.reference.get("niche")
            head = f"ANÚNCIO DE REFERÊNCIA PARA MODELAR — \"{ref_title}\""
            if ref_niche:
                head += f" (nicho: {ref_niche})"
            parts.append(
                head + "\n"
                "Modele a ESTRUTURA, o RITMO e o estilo de gancho/CTA deste anúncio validado, "
                "adaptando para a oferta atual. NÃO copie literalmente o tema/produto dele; "
                "use-o como molde de execução.\n\n" + ref_content
            )
    if ctx.meta:
        meta_lines = [f"- {k}: {v}" for k, v in ctx.meta.items() if v]
        if meta_lines:
            parts.append("INFORMAÇÕES DO ANÚNCIO:\n" + "\n".join(meta_lines))
    if ctx.briefing:
        brief_lines = []
        for k, v in ctx.briefing.items():
            if v and isinstance(v, str) and v.strip():
                brief_lines.append(f"### {k}\n{v.strip()}")
        if brief_lines:
            parts.append("BRIEFING:\n" + "\n\n".join(brief_lines))
    if ctx.current_hooks:
        hooks = [h for h in ctx.current_hooks if h and h.strip()]
        if hooks:
            parts.append("HOOKS ATUAIS:\n" + "\n".join(f"{i+1}. {h}" for i, h in enumerate(hooks)))
    if ctx.current_body and ctx.current_body.strip():
        parts.append(f"BODY ATUAL:\n{ctx.current_body.strip()}")
    return "\n\n---\n\n".join(parts) if parts else "(sem contexto preenchido ainda)"


def _strip_html(html: str) -> str:
    import re
    if not html:
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()


def _no_dashes(text: str) -> str:
    """Rede de segurança anti cara-de-IA: troca travessão (—) / meia-risca (–) por vírgula.
    O prompt já pede zero travessões; isso garante 100% mesmo se o modelo escorregar."""
    if not text or not isinstance(text, str):
        return text
    import re
    return re.sub(r"\s*[—–]\s*", ", ", text)


def _get_offer(user_id: str, project_id: Optional[str]) -> dict:
    """Carrega a OFERTA do projeto (cada projeto É uma oferta, 1:1) e lê o
    dossiê em markdown do R2. Retorna {title, market, product_type, funnel_type,
    content} ou {} se o projeto ainda não tem oferta criada."""
    if not project_id:
        return {}
    try:
        import json as _json
        from app.services import r2_storage
        sb = get_supabase()

        # Acha o registro de dossiê da oferta (kind == offer_dossier) do projeto.
        # select("*") — não listar colunas evita erro caso `template_data` não exista no schema.
        try:
            res = (
                sb.table("briefings")
                .select("*")
                .eq("user_id", user_id)
                .eq("project_id", project_id)
                .order("created_at", desc=True)
                .execute()
            )
        except Exception:
            return {}

        rec = None
        for row in res.data or []:
            td = row.get("template_data")
            if isinstance(td, dict) and td.get("kind") == "offer_dossier":
                rec = row
                break
            # Fallback: schema sem coluna template_data → meta vai no raw_content.
            raw = row.get("raw_content") or ""
            if isinstance(raw, str) and raw.startswith("__FILE_META__"):
                try:
                    m = _json.loads(raw[len("__FILE_META__"):])
                    if isinstance(m, dict) and m.get("kind") == "offer_dossier":
                        rec = row
                        break
                except Exception:
                    pass
        if not rec:
            return {}

        # file_meta do dossiê (template_data ou prefixo __FILE_META__)
        meta = None
        td = rec.get("template_data")
        if isinstance(td, dict) and td.get("file_key"):
            meta = td
        else:
            raw = rec.get("raw_content") or ""
            if isinstance(raw, str) and raw.startswith("__FILE_META__"):
                try:
                    meta = _json.loads(raw[len("__FILE_META__"):])
                except Exception:
                    meta = None

        content = ""
        if meta and meta.get("file_key"):
            try:
                client = r2_storage._client()
                bucket = r2_storage._bucket()
                obj = client.get_object(Bucket=bucket, Key=meta["file_key"])
                content = obj["Body"].read().decode("utf-8", errors="replace").strip()
            except Exception:
                content = ""

        meta = meta or {}
        return {
            "title": meta.get("offer_name") or rec.get("title") or "",
            "market": meta.get("niche") or rec.get("market") or "",
            "product_type": meta.get("product_type") or "",
            "funnel_type": meta.get("funnel_type") or "",
            "content": content[:14000],  # cap pra não estourar o prompt
        }
    except Exception:
        return {}


def _build_offer_block(offer: dict) -> str:
    """Formata a oferta como bloco de destaque pra IA — vai NO TOPO do contexto."""
    if not offer:
        return ""
    lines = ["═══════════════════════════════════════",
             "🎯 OFERTA QUE VOCÊ VAI ESCREVER (LEIA PRIMEIRO — toda a copy é sobre ESTE produto/oferta/funil):"]
    if offer.get("title"):
        lines.append(f"Oferta: {offer['title']}")
    if offer.get("market"):
        lines.append(f"Nicho/Mercado: {offer['market']}")
    if offer.get("product_type"):
        lines.append(f"Tipo de produto: {offer['product_type']}")
    if offer.get("funnel_type"):
        lines.append(f"Tipo de funil: {offer['funnel_type']}")
    if offer.get("content"):
        lines.append("\nDOSSIÊ COMPLETO DA OFERTA (use os pontos-chave, voz do cliente, provas e mecanismos aqui dentro):\n" + offer["content"])
    lines.append("═══════════════════════════════════════")
    return "\n".join(lines)


def _get_project_info(project_id: Optional[str]) -> dict:
    """Carrega nome + nicho do projeto pra dar contexto à IA."""
    if not project_id:
        return {}
    try:
        sb = get_supabase()
        res = sb.table("projects").select("name, nicho, instructions").eq("id", project_id).single().execute()
        return res.data or {}
    except Exception:
        return {}


def _get_niche_swipe_hooks(user_id: str, niche: Optional[str], limit: int = 25,
                           source: Optional[str] = None) -> list[dict]:
    """Retorna os hooks do swipe do usuário que pertencem ao nicho dado.
    Cada item: {hook, hook_type, emotion}. O nicho fica dentro do JSON content,
    então filtramos em Python.
    source: 'ad' | 'organic' → filtra pela ORIGEM do hook (None = todos)."""
    if not niche:
        return []
    # normaliza alias 'organico' → 'organic'
    src = (source or "").strip().lower()
    if src == "organico":
        src = "organic"
    try:
        sb = get_supabase()
        res = (
            sb.table("swipes")
            .select("content")
            .eq("user_id", user_id)
            .eq("tag", "hook")
            .execute()
        )
        rows = res.data or []
        target = niche.strip().lower()
        out = []
        for r in rows:
            try:
                c = json.loads(r["content"]) if isinstance(r["content"], str) else (r["content"] or {})
            except Exception:
                continue
            if not isinstance(c, dict):
                continue
            if (c.get("niche") or "").strip().lower() != target:
                continue
            if src and (c.get("source") or "").strip().lower() != src:
                continue
            hook = (c.get("hook") or "").strip()
            if not hook:
                continue
            out.append({
                "hook": hook,
                "hook_type": c.get("hook_type"),
                "emotion": c.get("emotion"),
            })
            if len(out) >= limit:
                break
        return out
    except Exception:
        return []


def _get_combined_instructions(user_id: str, project_instructions: Optional[str]) -> str:
    """Junta instruções UNIVERSAIS (do perfil) + instruções do PROJETO."""
    universal = ""
    try:
        sb = get_supabase()
        prof = sb.table("profiles").select("universal_instructions").eq("id", user_id).single().execute()
        universal = (prof.data or {}).get("universal_instructions") or ""
    except Exception:
        universal = ""
    parts = []
    if universal.strip():
        parts.append("[Instruções universais do copywriter]\n" + universal.strip())
    if (project_instructions or "").strip():
        parts.append("[Instruções deste projeto]\n" + project_instructions.strip())
    return "\n\n".join(parts)


def _get_niche_research(user_id: str, niche: Optional[str], limit: int = 5) -> list[dict]:
    """Pesquisas (research_docs) do nicho — texto colado/extraído. {title, content}."""
    if not niche:
        return []
    try:
        sb = get_supabase()
        res = (
            sb.table("research_docs")
            .select("title, content, type")
            .eq("user_id", user_id)
            .eq("nicho", niche)
            .execute()
        )
        out = []
        for r in (res.data or []):
            content = (r.get("content") or "").strip()
            if content:
                out.append({"title": r.get("title"), "content": content})
            if len(out) >= limit:
                break
        return out
    except Exception:
        return []


def _relevance_words(text: str) -> set:
    """Palavras significativas (>=4 letras) pra medir sobreposição de relevância."""
    return set(re.findall(r"[a-zá-úà-ãâêôçü]{4,}", (text or "").lower()))


def _get_project_memory(project_id: Optional[str], query: str = "", limit: int = 4) -> list[dict]:
    """Transcrições/análises da memória do projeto, RANKEADAS por relevância ao que
    está sendo escrito agora (`query`). Sem query → as mais recentes. {title, content}."""
    if not project_id:
        return []
    try:
        sb = get_supabase()
        res = (
            sb.table("project_memory")
            .select("type, content, metadata, created_at")
            .eq("project_id", project_id)
            .eq("active", True)
            .order("created_at", desc=True)
            .limit(40)                      # pool maior pra rankear em memória
            .execute()
        )
        items = []
        for r in (res.data or []):
            content = (r.get("content") or "").strip()
            if content:
                meta = r.get("metadata") or {}
                items.append({"title": meta.get("title") or r.get("type"), "content": content})

        q_words = _relevance_words(query)
        if not q_words:
            return items[:limit]            # nada escrito ainda → mais recentes

        def score(it):
            return len(q_words & _relevance_words(it["title"] + " " + it["content"]))

        ranked = sorted(items, key=score, reverse=True)
        # Se nada tem relação com o que está sendo escrito, volta pra recência
        if not ranked or score(ranked[0]) == 0:
            return items[:limit]
        return ranked[:limit]
    except Exception:
        return []


def _get_niche_swipe_ads(user_id: str, niche: Optional[str], limit: int = 6) -> list[dict]:
    """Retorna anúncios validados do swipe do nicho. Cada item: {title, hook, body}."""
    if not niche:
        return []
    try:
        sb = get_supabase()
        res = (
            sb.table("swipes")
            .select("content")
            .eq("user_id", user_id)
            .eq("tag", "ad")
            .execute()
        )
        rows = res.data or []
        target = niche.strip().lower()
        out = []
        for r in rows:
            try:
                c = json.loads(r["content"]) if isinstance(r["content"], str) else (r["content"] or {})
            except Exception:
                continue
            if not isinstance(c, dict):
                continue
            if (c.get("niche") or "").strip().lower() != target:
                continue
            out.append({
                "title": c.get("title"),
                "hook": c.get("hook_written") or c.get("hook"),
                "body": c.get("body"),
            })
            if len(out) >= limit:
                break
        return out
    except Exception:
        return []


def _get_swipe_hooks_other_niches(user_id: str, exclude_niche: Optional[str], limit: int = 30) -> list[dict]:
    """Hooks do swipe de OUTROS nichos (≠ exclude_niche). Cada item: {hook, hook_type, emotion, niche}."""
    try:
        sb = get_supabase()
        res = (
            sb.table("swipes")
            .select("content")
            .eq("user_id", user_id)
            .eq("tag", "hook")
            .execute()
        )
        rows = res.data or []
        excl = (exclude_niche or "").strip().lower()
        out = []
        for r in rows:
            try:
                c = json.loads(r["content"]) if isinstance(r["content"], str) else (r["content"] or {})
            except Exception:
                continue
            if not isinstance(c, dict):
                continue
            nich = (c.get("niche") or "").strip()
            if not nich or nich.lower() == excl:
                continue
            hook = (c.get("hook") or "").strip()
            if not hook:
                continue
            out.append({
                "hook": hook,
                "hook_type": c.get("hook_type"),
                "emotion": c.get("emotion"),
                "niche": nich,
            })
            if len(out) >= limit:
                break
        return out
    except Exception:
        return []


def _get_validated_hooks(user_id: str, project_id: Optional[str] = None, niche: Optional[str] = None,
                         limit: int = 40) -> list[dict]:
    """Hooks já escritos nas copys do usuário (copy_drafts.fields_data.hooks).
    Cada item: {hook, draft_title, draft_id, rating}. Filtra por projeto se dado.
    Prioriza hooks com rating mais alto."""
    try:
        sb = get_supabase()
        q = (
            sb.table("copy_drafts")
            .select("id, title, project_id, fields_data")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
        )
        if project_id:
            q = q.eq("project_id", project_id)
        res = q.execute()
        rows = res.data or []
        out = []
        seen = set()
        for r in rows:
            fd = r.get("fields_data") or {}
            if not isinstance(fd, dict):
                continue
            hooks = fd.get("hooks") or []
            rating = fd.get("rating") or {}
            for h in hooks:
                clean = _strip_html(h).strip()
                if not clean or clean.lower() in seen:
                    continue
                seen.add(clean.lower())
                out.append({
                    "hook": clean,
                    "draft_title": r.get("title") or "Sem título",
                    "draft_id": r.get("id"),
                    "rating": rating.get(h) if isinstance(rating, dict) else None,
                })
                if len(out) >= limit:
                    return out
        return out
    except Exception:
        return []


# ─── ENDPOINT 1: SUGERIR CAMPO (modo Híbrido) ───────────────────────────────

@router.post("/suggest-field")
async def suggest_field(body: SuggestFieldRequest, current_user=Depends(get_current_user)):
    """Sugere conteúdo pra um campo específico. Usado pelos botões '✨ Sugerir'
    em cada campo do editor."""
    project = _get_project_info(body.project_id)
    ctx_block = _build_context_block(body)

    # Oferta do projeto (1:1) — vai NO TOPO do contexto pra IA saber pra qual produto escrever.
    offer = _get_offer(current_user.id, body.project_id)
    offer_block = _build_offer_block(offer)
    # PROMPT CACHING: o offer_block (dossiê da oferta) é grande e IDÊNTICO entre gerações
    # do mesmo projeto. Vai como prefixo cacheado (system) em vez de embutido no prompt,
    # cortando ~90% do custo de input a partir da 2ª geração. cache_prefix é definido aqui.
    cache_prefix = offer_block if (offer_block and len(offer_block) >= _CACHE_MIN_CHARS) else None
    if offer_block and not cache_prefix:
        # dossiê pequeno demais pra cache → mantém embutido no contexto como antes
        ctx_block = offer_block + "\n\n---\n\n" + ctx_block

    # Body atual em texto puro (vem como HTML do RichEditor)
    current_clean = _strip_html(body.current_value or "")

    # ── CASO ESPECIAL: campo HOOK usa o Método Amanda Khayat (9 pilares) ──
    # Menu de estratégias (mapa mental dos 3 modos): organico | swipe_same |
    # swipe_other | validated. Contexto comum: pesquisa + memória + instruções + briefing.
    if body.field == "hook":
        niche = project.get("nicho") or (body.meta or {}).get("niche") or offer.get("market")
        briefing = body.briefing or {}
        organic_base = _strip_html(briefing.get("organic_base") or "").strip()
        strategy = (body.strategy or "organico").strip()

        # ── Atalho: usar o MESMO hook validado (sem IA) ──
        if strategy == "validated" and (body.validated_mode or "") == "same":
            if not (body.selected_hook or "").strip():
                raise HTTPException(status_code=422, detail="Selecione um hook validado das suas copys.")
            return {
                "suggestions": [body.selected_hook.strip()],
                "method": "validated_same",
                "modeled_from": {"validated": 1},
            }

        research = _get_niche_research(current_user.id, niche)
        # Relevância: rankeia a memória pelo que está em jogo agora (hooks/body/ângulo/ref/nicho)
        mem_query = " ".join(filter(None, [
            " ".join(body.current_hooks or []),
            body.current_body or "",
            organic_base,
            (body.meta or {}).get("angle") or "",
            ((body.reference or {}).get("content") or ""),
            niche or "",
        ]))
        memory = _get_project_memory(body.project_id, query=mem_query)
        instructions = _get_combined_instructions(current_user.id, project.get("instructions"))

        # Monta args específicos por estratégia (com gating onde faz sentido).
        kwargs = dict(
            strategy=strategy,
            niche=niche,
            organic_base=organic_base,
            research_snippets=research,
            instructions=instructions,
            memory_snippets=memory,
            context_block=ctx_block,
            current_value=current_clean,
            instruction=body.instruction or "",
            n=body.n,
        )
        modeled = {"research": len(research), "memory": len(memory)}

        if strategy == "swipe_same":
            swipe_hooks = _get_niche_swipe_hooks(current_user.id, niche, source=body.swipe_source)
            if not swipe_hooks:
                origem = "de anúncios" if (body.swipe_source or "").lower().startswith("ad") else (
                    "de orgânicos" if body.swipe_source else "")
                raise HTTPException(
                    status_code=422,
                    detail=f"Sem hooks {origem} no swipe do nicho \"{niche or '—'}\". Salve hooks {origem} desse nicho primeiro.".replace("  ", " "),
                )
            kwargs["swipe_hooks"] = swipe_hooks
            modeled["swipe_hooks"] = len(swipe_hooks)

        elif strategy == "swipe_other":
            other = _get_swipe_hooks_other_niches(current_user.id, niche)
            if not other:
                raise HTTPException(
                    status_code=422,
                    detail="Sem hooks de outros nichos no swipe. Salve hooks de outros nichos primeiro.",
                )
            kwargs["other_niche_hooks"] = other
            modeled["other_niche_hooks"] = len(other)

        elif strategy == "validated":
            sel = (body.selected_hook or "").strip()
            if not sel:
                raise HTTPException(status_code=422, detail="Selecione um hook validado das suas copys.")
            kwargs["strategy"] = "validated_similar"
            kwargs["validated_hooks"] = [sel]
            modeled["validated"] = 1

        else:  # "organico" (default)
            # Gating: o gancho do orgânico depende da Comunicação preenchida.
            if not organic_base:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "Preencha a COMUNICAÇÃO no Briefing primeiro (link + transcrição do orgânico "
                        "validado). Esse gancho modela a estrutura invisível desse orgânico."
                    ),
                )
            swipe_hooks = _get_niche_swipe_hooks(current_user.id, niche)
            kwargs["swipe_hooks"] = swipe_hooks
            modeled["organic"] = bool(organic_base)

        prompt = build_hook_prompt(**kwargs)
        try:
            resp = _call_with_cache(
                model=_pick_model(body.boost),
                max_tokens=MAX_TOKENS_SUGGEST,
                prompt=prompt,
                cache_prefix=cache_prefix,
                user_id=current_user.id, operation="gerar_hook", project_id=body.project_id,
            )
            raw = resp.content[0].text.strip()
            import re as _re
            match = _re.search(r'\{[\s\S]*\}', raw)
            if not match:
                raise ValueError(f"Resposta sem JSON: {raw[:200]}")
            data = json.loads(match.group())
            suggestions = [_no_dashes(s) for s in (data.get("suggestions") or [])]
            return {
                "suggestions": suggestions[:body.n],
                "method": "amanda_khayat",
                "strategy": strategy,
                "modeled_from": modeled,
            }
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("[ai/suggest-field hook] falhou")
            raise HTTPException(status_code=500, detail=f"Erro ao gerar ganchos: {exc}")

    # ── CASO ESPECIAL: campo BODY usa o método de copy Amanda Khayat ──
    # modela a estrutura invisível dos anúncios validados do swipe do nicho.
    if body.field == "body":
        niche = project.get("nicho") or (body.meta or {}).get("niche") or offer.get("market")
        market = (body.meta or {}).get("market") or (body.briefing or {}).get("market") or offer.get("market")
        briefing = body.briefing or {}
        organic_base = _strip_html(briefing.get("organic_base") or "").strip()

        # Gating: o body modela o orgânico da Comunicação. Sem ele, não gera.
        if not organic_base:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Preencha a COMUNICAÇÃO no Briefing primeiro (link + transcrição do orgânico "
                    "validado). O body modela a estrutura invisível desse orgânico."
                ),
            )

        swipe_ads = _get_niche_swipe_ads(current_user.id, niche)
        research = _get_niche_research(current_user.id, niche)
        prompt = build_body_prompt(
            niche=niche,
            market=market,
            context_block=ctx_block,
            organic_base=organic_base,
            swipe_ads=swipe_ads,
            research_snippets=research,
            instructions=_get_combined_instructions(current_user.id, project.get("instructions")),
            current_value=current_clean,
            instruction=body.instruction or "",
            funnel_type=offer.get("funnel_type") or "",
        )
        try:
            resp = _call_with_cache(
                model=_pick_model(body.boost),
                max_tokens=MAX_TOKENS_GENERATE,
                prompt=prompt,
                cache_prefix=cache_prefix,
                user_id=current_user.id, operation="gerar_body", project_id=body.project_id,
            )
            raw = resp.content[0].text.strip()
            import re as _re
            match = _re.search(r'\{[\s\S]*\}', raw)
            if not match:
                raise ValueError(f"Resposta sem JSON: {raw[:200]}")
            data = json.loads(match.group())
            suggestions = [_no_dashes(s) for s in (data.get("suggestions") or [])]
            return {
                "suggestions": suggestions[:body.n],
                "method": "amanda_khayat",
                "modeled_from": len(swipe_ads),
            }
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("[ai/suggest-field body] falhou")
            raise HTTPException(status_code=500, detail=f"Erro ao gerar body: {exc}")

    field_help = {
        "hook": "Hook = primeira frase que para o scroll. Curto (1-2 frases), específico, com tensão.",
        "body": "Body = corpo do anúncio. Conta uma história, gera identificação, apresenta solução. Use parágrafos curtos.",
        "briefing.angle_why": "Ângulo do anúncio + justificativa (por que esse ângulo).",
        "briefing.new_idea": "A 'new idea' do anúncio — o que vai fazer ele se destacar.",
        "briefing.avatar_why": "Qual avatar usar e por quê.",
        "briefing.format_why": "Qual formato (UGC, depoimento, narração, etc.) e por quê.",
        "briefing.headline": "Headline do anúncio (se for usar).",
        "briefing.editing_style": "Estilo de edição e trilha sonora.",
        "briefing.organic_base": "Vídeo/anúncio orgânico validado pra usar como base.",
    }
    field_explanation = field_help.get(body.field, f"Campo: {body.field}")

    instruction_block = f"\nINSTRUÇÃO EXTRA DO COPYWRITER: {body.instruction}" if body.instruction else ""
    current_block = f"\nVALOR ATUAL DO CAMPO (que o copy quer melhorar/substituir):\n{current_clean}" if current_clean else ""

    prompt = f"""Você é um copywriter sênior de direct response brasileiro, treinado no método Amanda Khayat.

CONTEXTO ATUAL DA COPY:
Projeto: {project.get('name') or '—'} (nicho: {project.get('nicho') or '—'})

{ctx_block}
{current_block}
{instruction_block}

TAREFA:
Gere {body.n} sugestões pro campo "{body.field}".
{field_explanation}

REGRAS:
- Cada sugestão DEVE usar o contexto acima (briefing, hooks/body já escritos)
- Linguagem natural, brasileiro, sem cara de IA
- Sem emojis a menos que faça sentido pro nicho
- Sem hashtags
- Cada sugestão é uma alternativa COMPLETA pro campo (não complementos)

RETORNE APENAS JSON VÁLIDO no formato:
{{"suggestions": ["sugestão 1", "sugestão 2", "sugestão 3"]}}"""

    try:
        resp = _call_with_cache(
            model=_pick_model(body.boost),
            max_tokens=MAX_TOKENS_SUGGEST,
            prompt=prompt,
            cache_prefix=cache_prefix,
            user_id=current_user.id, operation=f"sugerir_{body.field}", project_id=body.project_id,
        )
        raw = resp.content[0].text.strip()
        # Tenta extrair JSON
        import re as _re
        match = _re.search(r'\{[\s\S]*\}', raw)
        if not match:
            raise ValueError(f"Resposta da IA sem JSON: {raw[:200]}")
        data = json.loads(match.group())
        suggestions = [_no_dashes(s) for s in (data.get("suggestions") or [])]
        if not isinstance(suggestions, list):
            raise ValueError("'suggestions' não é uma lista")
        return {"suggestions": suggestions[:body.n]}
    except Exception as exc:
        logger.exception("[ai/suggest-field] falhou")
        raise HTTPException(status_code=500, detail=f"Erro ao gerar sugestões: {exc}")


# ─── ENDPOINT 1b: HOOKS VALIDADOS (pra Opção 04 do menu de hook) ────────────

@router.get("/validated-hooks")
async def validated_hooks(project_id: Optional[str] = None, current_user=Depends(get_current_user)):
    """Lista os hooks já escritos nas copys do usuário, pra escolher como base
    na estratégia 'validated' do menu Sugerir Hook."""
    hooks = _get_validated_hooks(current_user.id, project_id=project_id)
    return {"hooks": hooks}


# ─── ENDPOINT 1c: EXTRAIR ESTRUTURA INVISÍVEL (modo Manual) ─────────────────

class ExtractStructureRequest(BaseModel):
    project_id: Optional[str] = None
    organic_base: Optional[str] = None   # se não vier, usa o briefing... (frontend manda)


@router.post("/extract-structure")
async def extract_structure(body: ExtractStructureRequest, current_user=Depends(get_current_user)):
    """Faz engenharia reversa da estrutura invisível do orgânico da Comunicação.
    Retorna {hook: str, body: [{label, purpose}]} pra guiar o copy no modo Manual."""
    import re as _re
    import html as _html
    project = _get_project_info(body.project_id)
    niche = project.get("nicho")

    # ── 1) Quebra o orgânico em parágrafos a partir do HTML/texto BRUTO ──
    # (preserva quebras de <p>/<br>/\n\n; o _strip_html colapsaria tudo numa linha)
    raw_ob = body.organic_base or ""
    _norm = _re.sub(r'<\s*br\s*/?>', '\n', raw_ob, flags=_re.I)
    _norm = _re.sub(r'</\s*(p|div|li|h[1-6])\s*>', '\n\n', _norm, flags=_re.I)
    _norm = _re.sub(r'<[^>]+>', '', _norm)
    _norm = _html.unescape(_norm)
    paragraphs = [_re.sub(r'[ \t\r]+', ' ', p).strip() for p in _re.split(r'\n\s*\n+', _norm)]
    paragraphs = [p for p in paragraphs if p]
    if len(paragraphs) <= 1:  # sem quebras duplas, tenta linha a linha
        paragraphs = [p.strip() for p in _norm.splitlines() if p.strip()]

    if not paragraphs:
        raise HTTPException(
            status_code=422,
            detail="Preencha a COMUNICAÇÃO no Briefing primeiro (transcrição do orgânico validado).",
        )

    hook_text = paragraphs[0]

    prompt = build_structure_prompt(paragraphs=paragraphs, niche=niche)
    try:
        client = _claude_client()
        resp = client.messages.create(
            model=MODEL,
            max_tokens=2000,  # só label+purpose por parágrafo (JSON pequeno e seguro)
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.content[0].text.strip()

        # ── 2) Parse do formato PIPE (texto puro, sem JSON) ──
        #   HOOK: <descrição>
        #   <numero> | <label> | <purpose>
        hook = ""
        clean_steps = []
        used_indices = set()
        body_paragraphs = paragraphs[1:]
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            low = line.lower()
            if low.startswith("hook:"):
                hook = line.split(":", 1)[1].strip()
                continue
            if "|" not in line:
                continue
            parts = [p.strip() for p in line.split("|")]
            # NUMERO | LABEL | PURPOSE  (purpose pode ter sido cortado)
            num_raw = parts[0]
            label = parts[1] if len(parts) > 1 else ""
            purpose = parts[2] if len(parts) > 2 else ""
            try:
                para_idx = int(_re.sub(r'[^0-9]', '', num_raw))
            except (TypeError, ValueError):
                para_idx = None
            text = ""
            if para_idx is not None and 0 <= para_idx < len(paragraphs):
                text = paragraphs[para_idx]
                used_indices.add(para_idx)
            clean_steps.append({"label": label, "purpose": purpose, "text": text})

        # ── 3) Fallback: se a IA não usou índices válidos, alinha por posição ──
        if not used_indices and clean_steps:
            for i, step in enumerate(clean_steps):
                if i < len(body_paragraphs):
                    step["text"] = body_paragraphs[i]
        # Garante que NENHUM parágrafo do body fique de fora se vieram menos blocos.
        # Se o texto repete um bloco anterior, herda o label dele (ex: CTA repetido).
        if len(clean_steps) < len(body_paragraphs):
            seen = {s["text"]: s["label"] for s in clean_steps if s.get("text")}
            for i in range(len(clean_steps), len(body_paragraphs)):
                txt = body_paragraphs[i]
                prev_label = seen.get(txt)
                clean_steps.append({
                    "label": (f"{prev_label} (repetição)" if prev_label else "Continuação"),
                    "purpose": "",
                    "text": txt,
                })

        # Nenhum label vazio chega ao front
        for s in clean_steps:
            if not (s.get("label") or "").strip():
                s["label"] = "Continuação"

        return {"hook": hook, "hook_text": hook_text, "body": clean_steps}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[ai/extract-structure] falhou")
        raise HTTPException(status_code=500, detail=f"Erro ao extrair estrutura: {exc}")


# ─── ENDPOINT 1d: MELHORAR SELEÇÃO DO BODY (selecionar texto + IA) ──────────

class ImproveSelectionRequest(WriterContext):
    selection: str                       # trecho selecionado no body
    instruction: Optional[str] = None    # o que melhorar
    n: int = 3


@router.post("/improve-selection")
async def improve_selection(body: ImproveSelectionRequest, current_user=Depends(get_current_user)):
    """Melhora SÓ o trecho de texto selecionado no body, no método Amanda.
    Retorna alternativas que encaixam no lugar do trecho."""
    selection = (body.selection or "").strip()
    if not selection:
        raise HTTPException(status_code=422, detail="Selecione um trecho do body primeiro.")

    project = _get_project_info(body.project_id)
    offer = _get_offer(current_user.id, body.project_id)
    niche = project.get("nicho") or (body.meta or {}).get("niche") or offer.get("market")
    market = (body.meta or {}).get("market") or (body.briefing or {}).get("market") or offer.get("market")
    ctx_block = _build_context_block(body)
    offer_block = _build_offer_block(offer)
    # PROMPT CACHING do dossiê (idêntico ao suggest-field): corta input nas chamadas
    # seguidas de melhorar trecho no mesmo projeto.
    cache_prefix = offer_block if (offer_block and len(offer_block) >= _CACHE_MIN_CHARS) else None
    if offer_block and not cache_prefix:
        ctx_block = offer_block + "\n\n---\n\n" + ctx_block
    research = _get_niche_research(current_user.id, niche)

    prompt = build_improve_prompt(
        selection=selection,
        niche=niche,
        market=market,
        context_block=ctx_block,
        research_snippets=research,
        instructions=_get_combined_instructions(current_user.id, project.get("instructions")),
        instruction=body.instruction or "",
    )
    try:
        resp = _call_with_cache(
            model=_pick_model(body.boost),
            # Reescrever um trecho longo x N versões precisa de espaço — senão o JSON trunca.
            max_tokens=MAX_TOKENS_GENERATE,
            prompt=prompt,
            cache_prefix=cache_prefix,
            user_id=current_user.id, operation="melhorar_trecho", project_id=body.project_id,
        )
        raw = resp.content[0].text.strip()
        import re as _re
        match = _re.search(r'\{[\s\S]*\}', raw)
        if not match:
            raise ValueError(f"Resposta sem JSON: {raw[:200]}")
        data = json.loads(match.group())
        suggestions = [_no_dashes(s) for s in (data.get("suggestions") or [])]
        return {"suggestions": suggestions[:body.n], "method": "amanda_khayat"}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[ai/improve-selection] falhou")
        raise HTTPException(status_code=500, detail=f"Erro ao melhorar trecho: {exc}")


# ─── ENDPOINT 2: CHAT (modo Híbrido) ────────────────────────────────────────

@router.post("/chat")
async def chat(body: ChatRequest, current_user=Depends(get_current_user)):
    """Chat livre com a IA — copywriter sênior com acesso ao contexto da copy
    em andamento."""
    project = _get_project_info(body.project_id)
    offer = _get_offer(current_user.id, body.project_id)
    ctx_block = _build_context_block(body)
    offer_block = _build_offer_block(offer)
    if offer_block:
        ctx_block = offer_block + "\n\n---\n\n" + ctx_block

    # Cérebro padrão: método Amanda Khayat completo (mesma base de hooks/body).
    system = f"""{SYSTEM_BASE}

{POWER_PHRASES}

{COPY_STRUCTURE}

═══════════════════════════════════════
Você está ajudando o copywriter humano enquanto ele escreve um anúncio AGORA.

PROJETO ATIVO: {project.get('name') or '—'} (nicho: {project.get('nicho') or '—'})

ESTADO ATUAL DA COPY:
{ctx_block}

REGRAS DE CONVERSA:
- TODA resposta segue o método acima (filosofia, proibições, estrutura de 7 blocos).
- Sempre considere o contexto atual da copy.
- Direto ao ponto — copywriter tem pouco tempo.
- Quando sugerir copy, dê alternativas concretas seguindo o método (não teoria genérica).
- Se faltar contexto crítico (briefing vazio, sem referência), aponte isso."""

    messages = [{"role": m.role, "content": m.content} for m in body.history]
    messages.append({"role": "user", "content": body.message})

    try:
        client = _claude_client()
        model = _pick_model(body.boost)
        resp = client.messages.create(
            model=model,
            max_tokens=MAX_TOKENS_CHAT,
            system=system,
            messages=messages,
        )
        usage_tracker.track_claude(
            user_id=current_user.id, operation="chat", model=model,
            usage=resp.usage, project_id=body.project_id,
        )
        reply = resp.content[0].text.strip()
        return {"reply": reply}
    except Exception as exc:
        logger.exception("[ai/chat] falhou")
        raise HTTPException(status_code=500, detail=f"Erro no chat: {exc}")


# ─── ENDPOINT 3: GERAR COPY DO ZERO (modo Automático — Fase 2) ──────────────
# Placeholder pra Fase 2 — só pra rota não dar 404 se frontend chamar.

class GenerateCopyRequest(BaseModel):
    project_id: str
    briefing_id: Optional[str] = None
    include_research_doc_ids: list[str] = []
    extra_instructions: Optional[str] = None


@router.post("/generate-copy")
async def generate_copy(body: GenerateCopyRequest, current_user=Depends(get_current_user)):
    """[FASE 2] Gera copy completa do zero. Em construção."""
    raise HTTPException(status_code=501, detail="Em construção — modo automático será liberado na Fase 2")
