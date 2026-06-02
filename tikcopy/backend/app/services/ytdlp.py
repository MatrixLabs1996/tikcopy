import re
import sys
import glob
import json
import logging
import subprocess
from pathlib import Path
from datetime import datetime
from urllib.parse import urlparse, urlunparse

logger = logging.getLogger(__name__)


def _extract_youtube_id(url: str) -> str | None:
    """Extrai o ID de 11 caracteres de uma URL do YouTube (watch, youtu.be, shorts, embed)."""
    m = re.search(r'(?:v=|youtu\.be/|shorts/|/embed/|/v/)([A-Za-z0-9_-]{11})', url or '')
    return m.group(1) if m else None


def fetch_youtube_transcript(url: str) -> str | None:
    """Pega a LEGENDA/transcrição que o próprio YouTube já tem (sem baixar o vídeo).
    Bem menos bloqueado em IP de datacenter que o download via yt-dlp. Retorna texto
    corrido (sem timestamps) ou None se o vídeo não tiver legenda disponível."""
    vid = _extract_youtube_id(url)
    if not vid:
        return None
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        return None
    try:
        tlist = YouTubeTranscriptApi.list_transcripts(vid)
        t = None
        # 1) legenda manual em PT
        try:
            t = tlist.find_transcript(['pt', 'pt-BR'])
        except Exception:
            pass
        # 2) auto-legenda (PT/EN/ES)
        if t is None:
            try:
                t = tlist.find_generated_transcript(['pt', 'pt-BR', 'en', 'es'])
            except Exception:
                pass
        # 3) qualquer uma disponível
        if t is None:
            for tr in tlist:
                t = tr
                break
        if t is None:
            return None
        segs = t.fetch()
        text = " ".join((s.get('text') or '').strip() for s in segs).strip()
        return text or None
    except Exception as exc:
        logger.warning(f"[ytdlp] legenda indisponível pra {vid}: {type(exc).__name__}: {exc}")
        return None


def is_youtube(url: str) -> bool:
    u = (url or "").lower()
    return "youtube.com" in u or "youtu.be" in u


def youtube_title(url: str) -> str | None:
    """Título do vídeo via oEmbed (endpoint público, não bloqueia em datacenter)."""
    try:
        import requests
        r = requests.get("https://www.youtube.com/oembed", params={"url": url, "format": "json"}, timeout=10)
        if r.ok:
            return (r.json().get("title") or "").strip() or None
    except Exception:
        pass
    return None

TEMP_DIR = Path(__file__).parent.parent.parent / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# Arquivo de cookies (gerado pelo user via extensão "Get cookies.txt LOCALLY")
# Procura em: backend/cookies.txt
COOKIES_FILE = Path(__file__).parent.parent.parent / "cookies.txt"


def _bootstrap_cookies_from_env():
    """No servidor (Railway) não há arquivo. Se a env YOUTUBE_COOKIES estiver setada
    (conteúdo do cookies.txt exportado de um navegador LOGADO no YouTube), grava no
    cookies.txt no boot. É a gambiarra pra furar o bloqueio de IP de datacenter."""
    import os
    raw = os.environ.get("YOUTUBE_COOKIES", "")
    if raw and raw.strip():
        try:
            # aceita \n escapado (caso a env venha numa linha só)
            content = raw.replace("\\n", "\n")
            COOKIES_FILE.write_text(content, encoding="utf-8")
            logger.warning(f"[ytdlp] cookies.txt gravado a partir de YOUTUBE_COOKIES ({len(content)} chars)")
    else:
        logger.warning("[ytdlp] YOUTUBE_COOKIES nao setado — download do YouTube sem cookies")
        except Exception as exc:
            logger.warning(f"[ytdlp] falha ao gravar cookies do env: {exc}")


_bootstrap_cookies_from_env()


def _cookies_args() -> list[str]:
    """Retorna args extras se cookies.txt existir, senão lista vazia."""
    if COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 0:
        return ["--cookies", str(COOKIES_FILE)]
    return []


def _ffmpeg_path() -> str | None:
    """Retorna o caminho do binário ffmpeg (do imageio-ffmpeg). None se não disponível."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def _ffmpeg_args() -> list[str]:
    """Args pra apontar yt-dlp pro nosso ffmpeg estático."""
    p = _ffmpeg_path()
    return ["--ffmpeg-location", p] if p else []


def has_cookies_file() -> bool:
    return COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 0

# Browsers que o curl-cffi consegue imitar — TikTok bloqueia clientes não-browser
IMPERSONATE_TARGETS = ["Chrome", "Safari", "Chrome-133"]

# Tenta usar cookies do Brave/Chrome do user (bypassa muitos bloqueios)
# Se nenhum funcionar, ignora silenciosamente
BROWSERS_FOR_COOKIES = ["brave", "chrome", "edge", "firefox"]


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


def _clean_tiktok_url(url: str) -> str:
    p = urlparse(url)
    if "tiktok.com" in p.netloc and "/video/" in p.path:
        return urlunparse(p._replace(query="", fragment=""))
    return url


def _is_tiktok(url: str) -> bool:
    return "tiktok.com" in urlparse(url).netloc.lower()


def _clean_temp(pattern: str):
    for f in glob.glob(pattern):
        try:
            Path(f).unlink()
        except OSError:
            pass


def _parse_friendly_error(stderr: str, url: str) -> str:
    """Transforma erros crus do yt-dlp em mensagens humanas."""
    if not stderr:
        return "Nenhum formato de áudio disponível para este vídeo."
    s = stderr.lower()

    if "ip address is blocked" in s or "blocked from accessing" in s:
        if _is_tiktok(url):
            if has_cookies_file():
                return ("__TIKTOK_VIDEO_RESTRICTED__|"
                        "Esse vídeo específico do TikTok tem restrição (provavelmente região/idade ou bloqueado pelo creator). "
                        "Os outros vídeos funcionam normal — esse só vai via Upload de arquivo.")
            return ("__TIKTOK_NEEDS_COOKIES__|"
                    "TikTok bloqueou. Configure cookies.txt no backend pra resolver, "
                    "ou baixe o vídeo e use Upload de arquivo.")
        return "Plataforma bloqueou esse IP. Aguarde alguns minutos ou tente Upload de arquivo."

    if "cookie database" in s or "could not copy" in s.lower():
        return "Tentei usar cookies do navegador, mas ele está aberto e travou o acesso. Tente fechar o navegador e re-enviar, ou use Upload de arquivo."

    if "private" in s or "login required" in s or "sign in" in s:
        return "Vídeo privado ou requer login. Não consigo baixar."

    if "404" in s or "not found" in s:
        return "Vídeo não encontrado (URL incorreta ou removido)."

    if "video unavailable" in s:
        return "Vídeo indisponível na plataforma."

    if "geo" in s and ("block" in s or "restrict" in s):
        return "Vídeo bloqueado pela região do servidor."

    # Último recurso: pega só a primeira linha de ERROR
    for line in stderr.splitlines():
        if line.strip().startswith("ERROR:"):
            return line.strip().lstrip("ERROR:").strip()[:200]
    return stderr.strip()[:200] or "Falha ao baixar áudio."


def _run_ytdlp(args: list[str], extra_args: list[str] = None) -> subprocess.CompletedProcess:
    """Roda yt-dlp com args base + extras opcionais. Sempre injeta --ffmpeg-location."""
    cmd = [sys.executable, "-m", "yt_dlp"] + _ffmpeg_args() + (extra_args or []) + args
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")


def download_audio(url: str, job_id: str) -> tuple[str, str, dict]:
    """Download audio from TikTok/Instagram/YouTube. Returns (audio_path, title, metrics).

    Estratégia anti-bloqueio:
    1. Tenta com impersonation de browser (curl-cffi) — bypassa bloqueios anti-bot
    2. Pra TikTok, sempre usa impersonation desde a 1ª tentativa
    3. Pra outros, tenta sem; se falhar, tenta com
    """
    url = _clean_tiktok_url(url)
    output_template = str(TEMP_DIR / f"{job_id}.%(ext)s")
    _clean_temp(str(TEMP_DIR / f"{job_id}.*"))

    is_tiktok = _is_tiktok(url)
    cookies = _cookies_args()  # args com cookies.txt se existir (vazio caso contrário)

    # Estratégias em ordem (mais conservadoras → mais agressivas)
    # Cada item é uma lista de args extras pro yt-dlp
    # OBS: NÃO usamos --cookies-from-browser (Brave/Chrome) porque no servidor
    # (Railway/Linux) não existe navegador instalado — só gera erro e desperdiça
    # tentativa. Quando precisar de cookies, use o arquivo cookies.txt.
    if is_tiktok:
        # TikTok: PRIORIZA cookies.txt + impersonate (sem cookies raramente rola)
        if cookies:
            attempt_strategies = [
                cookies + ["--impersonate", "Chrome"],
                cookies + ["--impersonate", "Safari"],
                cookies,
                ["--impersonate", "Chrome"],
                [],
            ]
        else:
            attempt_strategies = [
                ["--impersonate", "Chrome"],
                ["--impersonate", "Safari"],
                [],
            ]
    else:
        # YouTube/Instagram: cookies ajuda, mas nem sempre necessário
        attempt_strategies = []
        if cookies:
            attempt_strategies.append(cookies)
        attempt_strategies.extend([
            [],
            ["--impersonate", "Chrome"],
        ])

    # ── 1. Metadata ──
    metrics = {}
    title = "Sem título"
    meta_stderr = ""
    for extra in attempt_strategies:
        meta_proc = _run_ytdlp(["-j", "--skip-download", url], extra_args=extra)
        if meta_proc.stdout.strip():
            try:
                info = json.loads(meta_proc.stdout.strip().splitlines()[0])
                title = info.get("title") or "Sem título"
                raw_date = info.get("upload_date", "")
                try:
                    pub = datetime.strptime(raw_date, "%Y%m%d").strftime("%d/%m/%Y")
                except Exception:
                    pub = raw_date or "—"
                metrics = {
                    "views": _fmt_num(info.get("view_count")),
                    "likes": _fmt_num(info.get("like_count")),
                    "comments": _fmt_num(info.get("comment_count")),
                    "shares": _fmt_num(info.get("repost_count")),
                    "plays": _fmt_num(info.get("play_count") or info.get("view_count")),
                    "duration": _fmt_duration(info.get("duration")),
                    "published": pub,
                    "author": info.get("uploader") or info.get("channel") or "—",
                }
                logger.info(f"[ytdlp] Metadata OK com {extra or 'sem impersonate'}")
                break
            except Exception:
                pass
        meta_stderr = meta_proc.stderr or meta_stderr

    # ── 2. Download ──
    # Prioridade: extrair áudio. Se não der, baixar best COM áudio (acodec!=none).
    # Última opção é merge (precisa ffmpeg).
    format_attempts = [
        # Extrai só áudio (mais leve + transcrição não precisa de vídeo)
        ("bestaudio[ext=m4a]/bestaudio", []),
        # Best stream que JÁ TEM áudio embutido
        ("best[acodec!=none]", []),
        # Merge video + audio (exige ffmpeg disponível no PATH)
        ("bestvideo+bestaudio/best", ["--merge-output-format", "mp4"]),
        # Último recurso: qualquer best
        ("best", []),
    ]

    def _file_has_audio(path: str) -> bool:
        """Verifica se o arquivo baixado tem stream de áudio (usa ffmpeg pra inspecionar)."""
        ff = _ffmpeg_path()
        if not ff:
            return True  # sem ffmpeg, não dá pra checar — assume que tem
        try:
            # ffmpeg -i <file> imprime metadata em stderr — procuramos "Stream #X:Y: Audio"
            r = subprocess.run(
                [ff, "-i", path],
                capture_output=True, text=True, timeout=10,
            )
            return "Audio:" in r.stderr
        except Exception:
            return True

    dl_proc = None
    last_stderr = meta_stderr
    for extra in attempt_strategies:
        for fmt, extra_fmt_args in format_attempts:
            args = ["-f", fmt, "--no-playlist", "-o", output_template] + extra_fmt_args + [url]
            dl_proc = _run_ytdlp(args, extra_args=extra)
            files = glob.glob(str(TEMP_DIR / f"{job_id}.*"))
            if dl_proc.returncode == 0 and files:
                # Verifica se tem áudio antes de retornar
                if _file_has_audio(files[0]):
                    logger.info(f"[ytdlp] Download OK com áudio: estratégia={extra or 'plain'}, fmt={fmt}")
                    return files[0], title, metrics
                logger.warning(f"[ytdlp] Download OK mas SEM áudio (fmt={fmt}) — tentando próximo formato")
            _clean_temp(str(TEMP_DIR / f"{job_id}.*"))
            last_stderr = dl_proc.stderr or last_stderr

    # ── 3. Fallback pra TikTok: tikwm.com (resolve IP block) ──
    if is_tiktok:
        try:
            from app.services import tiktok_fallback
            logger.info("[ytdlp] Tudo falhou — tentando fallback tikwm.com")
            fallback_path = str(TEMP_DIR / f"{job_id}.mp4")
            result = tiktok_fallback.download_via_tikwm(url, fallback_path)
            if result:
                final_path, fb_metrics = result
                # Combina metrics: se já tinha do meta, mantém; senão usa do fallback
                if not metrics:
                    metrics = fb_metrics
                if title == "Sem título" and fb_metrics.get("title"):
                    title = fb_metrics["title"]
                logger.info("[ytdlp] Fallback tikwm.com FUNCIONOU")
                return final_path, title, metrics
        except Exception as exc:
            logger.warning(f"[ytdlp] Fallback tikwm.com falhou: {exc}")

    raise RuntimeError(_parse_friendly_error(last_stderr, url))


def _normalize_channel_url(url: str) -> str:
    """Normaliza URL de canal do YouTube pra a aba de vídeos.
    Evita que o yt-dlp devolva as 'abas' (featured/playlists) em vez dos vídeos."""
    u = (url or "").strip().rstrip("/")
    low = u.lower()
    if not ("youtube.com" in low or "youtu.be" in low):
        return u  # outras plataformas: usa como veio
    # Já aponta pra uma aba específica
    if any(seg in low for seg in ("/videos", "/shorts", "/streams", "/featured", "/playlist", "watch?v=")):
        return u
    # @handle, /channel/ID, /c/Nome, /user/Nome → aba de vídeos
    return u + "/videos"


def list_profile_videos(url: str, scan_limit: int = 40) -> list[dict]:
    """Lista os vídeos mais recentes de um perfil/canal COM view_count, SEM baixar.

    Retorna lista de dicts: {id, title, url, view_count, duration}.
    Ordenável por view_count pra escolher os mais virais.

    Importante: o modo `--flat-playlist` do yt-dlp NÃO traz view_count (só id/título/url).
    Pra ter as views usamos `--print` em extração normal, limitada a `scan_limit`
    vídeos mais recentes (cada um é ~1 a 2s de fetch — por isso o cap baixo).
    """
    target = _normalize_channel_url(url)

    # Estratégias: simples primeiro, impersonate depois; cookies se existir
    attempts = []
    cookies = _cookies_args()
    if cookies:
        attempts.append(cookies)
    attempts.extend([[], ["--impersonate", "Chrome"]])

    # Separador improvável de aparecer no título (evita quebrar no split)
    SEP = "\t||\t"
    fmt = SEP.join(["%(view_count)s", "%(id)s", "%(webpage_url)s", "%(title)s", "%(duration)s"])

    last_stderr = ""
    for extra in attempts:
        proc = _run_ytdlp(
            ["--print", fmt, "--playlist-end", str(scan_limit),
             "--ignore-errors", "--no-warnings", target],
            extra_args=extra,
        )
        out = []
        for line in (proc.stdout or "").splitlines():
            if SEP not in line:
                continue
            parts = line.split(SEP)
            if len(parts) < 4:
                continue
            vc, vid, vurl, title = parts[0], parts[1], parts[2], parts[3]
            dur = parts[4] if len(parts) > 4 else ""
            try:
                views = int(vc)
            except (TypeError, ValueError):
                views = 0
            if vid and (not vurl or not str(vurl).startswith("http")):
                vurl = f"https://www.youtube.com/watch?v={vid}"
            if not vurl:
                continue
            try:
                duration = float(dur)
            except (TypeError, ValueError):
                duration = None
            out.append({
                "id": vid or None,
                "title": title or "Sem título",
                "url": vurl,
                "view_count": views,
                "duration": duration,
            })
        if out:
            logger.info(f"[ytdlp] list_profile_videos: {len(out)} vídeos ({extra or 'plain'})")
            return out
        last_stderr = proc.stderr or last_stderr

    raise RuntimeError(_parse_friendly_error(last_stderr, target))
