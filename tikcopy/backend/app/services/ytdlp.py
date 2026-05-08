import re
import sys
import glob
import json
import subprocess
from pathlib import Path
from datetime import datetime
from urllib.parse import urlparse, urlunparse

TEMP_DIR = Path("/tmp/tikcopy")
TEMP_DIR.mkdir(parents=True, exist_ok=True)


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


def _clean_temp(pattern: str):
    for f in glob.glob(pattern):
        try:
            Path(f).unlink()
        except OSError:
            pass


def download_audio(url: str, job_id: str) -> tuple[str, str, dict]:
    """Download audio from TikTok/Instagram/YouTube. Returns (audio_path, title, metrics)."""
    url = _clean_tiktok_url(url)
    output_template = str(TEMP_DIR / f"{job_id}.%(ext)s")
    _clean_temp(str(TEMP_DIR / f"{job_id}.*"))

    meta_proc = subprocess.run(
        [sys.executable, "-m", "yt_dlp", "-j", "--skip-download", url],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )

    metrics = {}
    title = "Sem título"
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
        except Exception:
            pass

    format_attempts = [
        "bestaudio[ext=m4a]", "bestaudio",
        "best[acodec!=none][vcodec=none]", "best[acodec!=none]", "best",
    ]

    dl_proc = None
    for fmt in format_attempts:
        dl_proc = subprocess.run(
            [sys.executable, "-m", "yt_dlp", "-f", fmt,
             "--no-playlist", "-o", output_template, url],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        files = glob.glob(str(TEMP_DIR / f"{job_id}.*"))
        if dl_proc.returncode == 0 and files:
            return files[0], title, metrics
        _clean_temp(str(TEMP_DIR / f"{job_id}.*"))

    raise RuntimeError(
        (dl_proc.stderr.strip() if dl_proc else "") or
        "Nenhum formato de áudio disponível para este vídeo."
    )
