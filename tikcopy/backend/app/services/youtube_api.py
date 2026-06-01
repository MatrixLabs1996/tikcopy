"""
YouTube Data API v3 — lista os vídeos MAIS VIRAIS (por views absolutas) de um canal.

Usada pelo Raio-X de Perfil como caminho preferencial (mais rápido e pega o top
do canal inteiro, não só os recentes). Se a chave não estiver configurada ou a
cota acabar, o chamador cai no fallback do yt-dlp (`ytdlp.list_profile_videos`).

Cota: search.list custa 100 unidades; channels/videos.list custam 1. O free tier
é 10.000 unidades/dia → ~95 análises/dia.
"""
import os
import re
import logging
from datetime import datetime
from urllib.parse import urlparse

import requests

logger = logging.getLogger(__name__)

_BASE = "https://www.googleapis.com/youtube/v3"
_TIMEOUT = 15


def api_key() -> str | None:
    key = os.getenv("YOUTUBE_API_KEY")
    return key.strip() if key else None


def is_configured() -> bool:
    return bool(api_key())


def _get(endpoint: str, params: dict) -> dict:
    params = {**params, "key": api_key()}
    r = requests.get(f"{_BASE}/{endpoint}", params=params, timeout=_TIMEOUT)
    if r.status_code != 200:
        # Erros comuns: 403 (cota esgotada / chave inválida), 400 (param ruim)
        raise RuntimeError(f"YouTube API {endpoint} HTTP {r.status_code}: {r.text[:200]}")
    return r.json()


def _resolve_channel_id(url: str) -> tuple[str, str]:
    """Resolve a URL/handle de um canal pra (channel_id, channel_title)."""
    u = (url or "").strip()
    path = urlparse(u).path if "://" in u else u

    # /channel/UCxxxx — já é o ID
    m = re.search(r"/channel/(UC[\w-]+)", u)
    if m:
        data = _get("channels", {"part": "snippet", "id": m.group(1)})
        items = data.get("items") or []
        title = items[0]["snippet"]["title"] if items else ""
        return m.group(1), title

    # /@handle
    m = re.search(r"/@([\w.\-]+)", u)
    handle = m.group(1) if m else None
    # bare handle sem URL (ex: "@fulano" ou "fulano")
    if not handle and not u.startswith("http"):
        handle = u.lstrip("@").strip() or None

    if handle:
        data = _get("channels", {"part": "snippet", "forHandle": handle})
        items = data.get("items") or []
        if items:
            return items[0]["id"], items[0]["snippet"]["title"]

    # /user/NAME
    m = re.search(r"/user/([\w.\-]+)", u)
    if m:
        data = _get("channels", {"part": "snippet", "forUsername": m.group(1)})
        items = data.get("items") or []
        if items:
            return items[0]["id"], items[0]["snippet"]["title"]

    # /c/NAME ou custom — cai na busca por canal
    m = re.search(r"/c/([\w.\-]+)", u)
    query = m.group(1) if m else (handle or path.strip("/").split("/")[-1])
    if query:
        data = _get("search", {"part": "snippet", "q": query, "type": "channel", "maxResults": 1})
        items = data.get("items") or []
        if items:
            return items[0]["snippet"]["channelId"], items[0]["snippet"].get("channelTitle", "")

    raise RuntimeError("Não consegui identificar o canal a partir dessa URL.")


# Limite de duração (em segundos) pra considerar um vídeo "Short"
SHORT_MAX_SECONDS = 180


def _parse_iso_duration(iso: str) -> int:
    """Converte duração ISO 8601 do YouTube (ex: 'PT1M30S') em segundos."""
    if not iso:
        return 0
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso)
    if not m:
        return 0
    h, mi, s = (int(x) if x else 0 for x in m.groups())
    return h * 3600 + mi * 60 + s


def _search_video_ids(channel_id: str, order: str, query: str | None, max_results: int,
                     video_duration: str | None = None) -> list[str]:
    params = {
        "part": "id", "channelId": channel_id, "order": order,
        "type": "video", "maxResults": min(max_results, 50),
    }
    if query and query.strip():
        params["q"] = query.strip()
    if video_duration:
        params["videoDuration"] = video_duration   # 'short' | 'medium' | 'long'
    data = _get("search", params)
    return [it["id"]["videoId"] for it in (data.get("items") or []) if it.get("id", {}).get("videoId")]


def _fetch_videos_details(ids: list[str]) -> list[dict]:
    """videos.list em lotes de 50, retorna snippet+statistics+duração normalizados."""
    out = []
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        resp = _get("videos", {"part": "snippet,statistics,contentDetails", "id": ",".join(chunk)})
        for it in resp.get("items") or []:
            vid = it.get("id")
            sn = it.get("snippet") or {}
            st = it.get("statistics") or {}
            cd = it.get("contentDetails") or {}
            try:
                views = int(st.get("viewCount") or 0)
            except (TypeError, ValueError):
                views = 0
            try:
                likes = int(st.get("likeCount") or 0)
            except (TypeError, ValueError):
                likes = 0
            thumbs = sn.get("thumbnails") or {}
            thumb = (thumbs.get("medium") or thumbs.get("high") or thumbs.get("default") or {}).get("url")
            # publishedAt: "2021-03-04T12:00:00Z" → dd/mm/yyyy
            pub_iso = sn.get("publishedAt") or ""
            published = ""
            pub_dt = None
            try:
                pub_dt = datetime.strptime(pub_iso[:10], "%Y-%m-%d")
                published = pub_dt.strftime("%d/%m/%Y")
            except Exception:
                pass
            dur_sec = _parse_iso_duration(cd.get("duration") or "")
            out.append({
                "id": vid,
                "title": sn.get("title") or "Sem título",
                "url": f"https://www.youtube.com/watch?v={vid}",
                "view_count": views,
                "like_count": likes,
                "thumbnail": thumb,
                "description": (sn.get("description") or "").strip(),
                "published": published,
                "duration_sec": dur_sec,
                "is_short": dur_sec > 0 and dur_sec <= SHORT_MAX_SECONDS,
                "_published_dt": pub_dt,
            })
    return out


def list_top_videos(url: str, top_n: int = 5, query: str | None = None,
                    rank_by: str = "views", video_type: str = "both") -> tuple[list[dict], str]:
    """Retorna (videos, author) com os `top_n` vídeos do canal.

    rank_by:
      - 'views': mais views absolutas (campeões históricos)
      - 'relevance': "em alta" = mais views por tempo (views ÷ dias desde a postagem)
    video_type:
      - 'both' (padrão) | 'long' (só vídeos longos) | 'shorts' (só Shorts, ≤ 3 min)

    Se `query` for passado, filtra pelo tema dentro do canal.
    """
    if not is_configured():
        raise RuntimeError("YOUTUBE_API_KEY não configurada.")

    top_n = max(1, min(int(top_n or 5), 10))
    video_type = video_type if video_type in ("both", "long", "shorts") else "both"
    channel_id, channel_title = _resolve_channel_id(url)

    # Pra Shorts, enviesa a busca pra vídeos curtos (<4min); o filtro fino é por duração
    search_dur = "short" if video_type == "shorts" else None

    if rank_by == "relevance":
        # Pool maior: recentes + mais vistos (um vídeo "em alta" pode não estar no top absoluto)
        ids = []
        seen = set()
        for order in ("date", "viewCount"):
            for vid in _search_video_ids(channel_id, order, query, 50, video_duration=search_dur):
                if vid not in seen:
                    seen.add(vid)
                    ids.append(vid)
    else:
        # Over-fetch (50) pra ter pool suficiente depois de filtrar por tipo
        ids = _search_video_ids(channel_id, "viewCount", query, 50, video_duration=search_dur)

    _type_label = {"shorts": "Shorts", "long": "vídeos longos"}.get(video_type, "vídeos")
    if not ids:
        if video_type == "shorts":
            raise RuntimeError("Não encontrei Shorts neste canal (talvez ele poste Shorts em outro canal).")
        raise RuntimeError("Canal sem vídeos públicos encontrados.")

    out = _fetch_videos_details(ids)

    # Filtro por tipo de vídeo (longo vs short) — sem fallback silencioso pro tipo errado
    if video_type == "shorts":
        out = [v for v in out if v.get("is_short")]
    elif video_type == "long":
        out = [v for v in out if not v.get("is_short")]

    if not out:
        raise RuntimeError(f"Não encontrei {_type_label} sobre esse tema neste canal." if query
                           else f"Não encontrei {_type_label} neste canal.")

    if rank_by == "relevance":
        now = datetime.utcnow()
        MIN_AGE_DAYS = 2     # piso: ignora vídeo novo demais (sem dado suficiente)
        MIN_VIEWS = 500
        scored = []
        for v in out:
            dt = v.get("_published_dt")
            if not dt:
                continue
            age_days = max((now - dt).days, 1)
            if age_days < MIN_AGE_DAYS or v["view_count"] < MIN_VIEWS:
                continue
            v["velocity"] = v["view_count"] / age_days
            scored.append(v)
        # Se o piso zerou tudo (canal muito novo), relaxa
        if not scored:
            for v in out:
                dt = v.get("_published_dt")
                age_days = max((now - dt).days, 1) if dt else 1
                v["velocity"] = v["view_count"] / age_days
                scored.append(v)
        scored.sort(key=lambda v: v.get("velocity") or 0, reverse=True)
        out = scored[:top_n]
        logger.info(f"[youtube_api] {len(out)} vídeos de '{channel_title}' por RELEVÂNCIA (views/tempo)")
    else:
        out.sort(key=lambda v: v.get("view_count") or 0, reverse=True)
        out = out[:top_n]
        logger.info(f"[youtube_api] {len(out)} vídeos de '{channel_title}' por VIEWS absolutas")

    for v in out:
        v.pop("_published_dt", None)   # não serializa datetime
    return out, channel_title


# Compat: chamada antiga (sempre por views)
def list_top_videos_by_views(url: str, top_n: int = 5, query: str | None = None) -> tuple[list[dict], str]:
    return list_top_videos(url, top_n, query, rank_by="views")


def list_video_comments(video_id: str, max_comments: int = 80) -> list[dict]:
    """Puxa os comentários top de um vídeo (ordenados por relevância, depois por likes).

    Retorna [{text, likes, author}]. Lista vazia se a chave não existir, os
    comentários estiverem desativados, ou der qualquer erro (não derruba o fluxo).
    Custo: 1 unidade de cota por vídeo.
    """
    if not is_configured() or not video_id:
        return []
    try:
        data = _get("commentThreads", {
            "part": "snippet",
            "videoId": video_id,
            "order": "relevance",
            "maxResults": min(max(int(max_comments), 1), 100),
            "textFormat": "plainText",
        })
    except Exception as exc:
        # Comentários desativados (403) ou erro de cota — só ignora
        logger.warning(f"[youtube_api] comentários indisponíveis ({video_id}): {exc}")
        return []

    out = []
    for it in data.get("items") or []:
        sn = (((it.get("snippet") or {}).get("topLevelComment") or {}).get("snippet")) or {}
        text = (sn.get("textOriginal") or sn.get("textDisplay") or "").strip()
        if not text:
            continue
        try:
            likes = int(sn.get("likeCount") or 0)
        except (TypeError, ValueError):
            likes = 0
        out.append({
            "text": text,
            "likes": likes,
            "author": sn.get("authorDisplayName") or "",
        })
    out.sort(key=lambda c: c.get("likes") or 0, reverse=True)
    return out


def list_all_video_comments(video_id: str, max_total: int = 3000) -> list[dict]:
    """Puxa TODOS os comentários de topo de um vídeo, paginando, até o teto `max_total`.

    Diferente de list_video_comments (que pega só a 1ª página dos mais relevantes),
    aqui percorre tudo (order=time) pra capturar a cauda longa — cada lead conta,
    não só os mais curtidos. Cada página são 100 comentários = 1 unidade de cota.

    Retorna [{text, likes, author}]. Em erro (comentários desativados / cota), devolve
    o que conseguiu até ali (parcial), nunca derruba o fluxo.
    """
    if not is_configured() or not video_id:
        return []
    out = []
    page_token = None
    try:
        while len(out) < max_total:
            params = {
                "part": "snippet",
                "videoId": video_id,
                "order": "time",          # permite paginar fundo (relevance limita)
                "maxResults": 100,
                "textFormat": "plainText",
            }
            if page_token:
                params["pageToken"] = page_token
            data = _get("commentThreads", params)
            for it in data.get("items") or []:
                sn = (((it.get("snippet") or {}).get("topLevelComment") or {}).get("snippet")) or {}
                text = (sn.get("textOriginal") or sn.get("textDisplay") or "").strip()
                if not text:
                    continue
                try:
                    likes = int(sn.get("likeCount") or 0)
                except (TypeError, ValueError):
                    likes = 0
                out.append({"text": text, "likes": likes, "author": sn.get("authorDisplayName") or ""})
                if len(out) >= max_total:
                    break
            page_token = data.get("nextPageToken")
            if not page_token:
                break
    except Exception as exc:
        logger.warning(f"[youtube_api] paginação de comentários parou ({video_id}, {len(out)} lidos): {exc}")
    return out
