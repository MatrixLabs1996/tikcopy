"""Fallback de download de TikTok quando yt-dlp falha (IP block).

Tenta múltiplos serviços públicos em cascata — se um falhar, tenta o próximo.
Esses serviços são gratuitos mas instáveis (mudam de domínio, bloqueiam, etc).
"""

import logging
import re
import requests

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 30
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"


def _fmt_num(n) -> str:
    try:
        n = int(n)
    except (TypeError, ValueError):
        return "—"
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n/1_000:.1f}K"
    return str(n)


def _fmt_duration(sec) -> str:
    try:
        sec = int(sec)
        return f"{sec // 60:02d}:{sec % 60:02d}"
    except (TypeError, ValueError):
        return "—"


# ─── Estratégia 1: tikwm.com ─────────────────────────────────────────────────

def _try_tikwm(url: str) -> dict | None:
    """tikwm.com — usa POST form-encoded."""
    try:
        # tikwm aceita só a URL sem query string e exige protocolo correto
        clean = url.split("?")[0].strip()
        resp = requests.post(
            "https://www.tikwm.com/api/",
            data={"url": clean, "hd": "1"},
            headers={"User-Agent": UA, "Referer": "https://www.tikwm.com/"},
            timeout=DEFAULT_TIMEOUT,
        )
        body = resp.json()
        if body.get("code") == 0 and body.get("data"):
            data = body["data"]
            video_url = data.get("hdplay") or data.get("play") or data.get("wmplay")
            if not video_url:
                return None
            author = data.get("author") or {}
            metrics = {
                "views": _fmt_num(data.get("play_count")),
                "likes": _fmt_num(data.get("digg_count")),
                "comments": _fmt_num(data.get("comment_count")),
                "shares": _fmt_num(data.get("share_count")),
                "plays": _fmt_num(data.get("play_count")),
                "duration": _fmt_duration(data.get("duration")),
                "author": (author.get("nickname") or author.get("unique_id") or "—") if isinstance(author, dict) else str(author),
                "title": data.get("title") or "Sem título",
                "source": "tikwm",
            }
            return {"video_url": video_url, "metrics": metrics}
        logger.info(f"[tikwm] code={body.get('code')} msg={body.get('msg')}")
    except Exception as exc:
        logger.warning(f"[tikwm] {exc}")
    return None


# ─── Estratégia 2: tikvm.com (mirror) ────────────────────────────────────────

def _try_tikvm(url: str) -> dict | None:
    try:
        resp = requests.get(
            f"https://tikvm.com/api/?url={url}",
            headers={"User-Agent": UA},
            timeout=DEFAULT_TIMEOUT,
        )
        body = resp.json()
        if body.get("success") or body.get("data"):
            data = body.get("data", body)
            video_url = data.get("video_no_watermark") or data.get("video_url") or data.get("play")
            if not video_url:
                return None
            return {
                "video_url": video_url,
                "metrics": {
                    "views": _fmt_num(data.get("views")),
                    "likes": _fmt_num(data.get("likes")),
                    "duration": _fmt_duration(data.get("duration")),
                    "author": data.get("author", "—"),
                    "title": data.get("title", "Sem título"),
                    "source": "tikvm",
                },
            }
    except Exception as exc:
        logger.warning(f"[tikvm] {exc}")
    return None


# ─── Estratégia 3: snaptik.app (HTML scraping) ───────────────────────────────

def _try_snaptik(url: str) -> dict | None:
    try:
        session = requests.Session()
        session.headers.update({
            "User-Agent": UA,
            "Referer": "https://snaptik.app/",
        })
        # Pega CSRF/cookies
        session.get("https://snaptik.app/", timeout=DEFAULT_TIMEOUT)
        # Submete pra API interna
        resp = session.post(
            "https://snaptik.app/abc2.php",
            data={"url": url, "lang": "en", "token": ""},
            timeout=DEFAULT_TIMEOUT,
        )
        # Resposta é HTML — procura URL de vídeo (.mp4)
        html = resp.text
        matches = re.findall(r'https?://[^"\']+\.mp4[^"\']*', html)
        if matches:
            return {
                "video_url": matches[0].replace("\\/", "/"),
                "metrics": {"source": "snaptik", "title": "Sem título"},
            }
    except Exception as exc:
        logger.warning(f"[snaptik] {exc}")
    return None


# ─── Pipeline público ───────────────────────────────────────────────────────

STRATEGIES = [
    ("tikwm",   _try_tikwm),
    ("tikvm",   _try_tikvm),
    ("snaptik", _try_snaptik),
]


def fetch_tiktok_info(url: str) -> dict | None:
    """Retorna {video_url, metrics} ou None."""
    for name, fn in STRATEGIES:
        result = fn(url)
        if result and result.get("video_url"):
            logger.info(f"[tiktok_fallback] {name} funcionou pra {url[:60]}")
            return result
    logger.warning(f"[tiktok_fallback] TODAS as {len(STRATEGIES)} estratégias falharam")
    return None


def download_via_fallback(url: str, output_path: str) -> tuple[str, dict] | None:
    """Tenta baixar via fallbacks públicos. Retorna (path, metrics) ou None."""
    info = fetch_tiktok_info(url)
    if not info:
        return None

    video_url = info["video_url"]
    if not output_path.endswith(".mp4"):
        output_path = output_path.rsplit(".", 1)[0] + ".mp4" if "." in output_path else output_path + ".mp4"

    try:
        with requests.get(video_url, stream=True, timeout=120, headers={"User-Agent": UA}) as r:
            r.raise_for_status()
            with open(output_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=64 * 1024):
                    if chunk:
                        f.write(chunk)
        logger.info(f"[tiktok_fallback] Download OK: {output_path}")
        return output_path, info["metrics"]
    except Exception as exc:
        logger.warning(f"[tiktok_fallback] Falha no download: {exc}")
        return None


# Alias antigo pra compatibilidade
download_via_tikwm = download_via_fallback
