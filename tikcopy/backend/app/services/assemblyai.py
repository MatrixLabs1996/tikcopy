import os
import time
import logging
import requests

logger = logging.getLogger(__name__)

AAI_BASE = "https://api.assemblyai.com/v2"

# Preço AssemblyAI por minuto de áudio (USD), configurável por env.
# Default = tarifa PAGA (~US$0.27/hora Universal = 0.0045/min). Mesmo no free tier,
# medimos o custo REAL por usuário pra precificar os planos com a economia verdadeira
# (o crédito grátis é temporário). Pra zerar em algum cenário, defina AAI_USD_PER_MIN=0.
AAI_USD_PER_MIN = float(os.environ.get("AAI_USD_PER_MIN", "0.0045") or 0)


def _track(user_id, operation, audio_duration_sec, project_id):
    """Registra o custo da transcrição no medidor (best-effort, nunca derruba o job)."""
    if not user_id:
        return
    try:
        from app.services.usage_tracker import track_flat
        minutes = (audio_duration_sec or 0) / 60.0
        track_flat(
            user_id=user_id, operation=operation, provider="assemblyai",
            model="universal", cost_usd=minutes * AAI_USD_PER_MIN,
            units=round(minutes, 3), project_id=project_id,
            meta={"seconds": audio_duration_sec},
        )
    except Exception as exc:
        logger.warning(f"[AAI] falha ao registrar uso: {exc}")


def _key() -> str:
    key = os.environ.get("ASSEMBLYAI_KEY", "")
    if not key:
        raise RuntimeError("ASSEMBLYAI_KEY não encontrado no ambiente")
    return key


def _headers():
    return {"authorization": _key(), "content-type": "application/json"}


CHUNK_SIZE = 5 * 1024 * 1024  # 5MB por chunk — evita carregar arquivo inteiro na RAM
MAX_UPLOAD_RETRIES = 3


def _stream_file(file_path: str):
    """Generator que lê o arquivo em chunks (streaming upload — não estoura RAM)."""
    with open(file_path, "rb") as f:
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break
            yield chunk


def upload_file(file_path: str) -> str:
    """Upload de arquivo local pra AssemblyAI via streaming (resistente a arquivos grandes)."""
    size_mb = os.path.getsize(file_path) / (1024 * 1024)
    logger.info(f"[AAI] Uploading {file_path} ({size_mb:.1f} MB)")

    last_err = None
    for attempt in range(1, MAX_UPLOAD_RETRIES + 1):
        try:
            resp = requests.post(
                f"{AAI_BASE}/upload",
                headers={"authorization": _key()},
                data=_stream_file(file_path),   # streaming — não carrega o arquivo todo
                timeout=(30, 1800),             # (connect 30s, read 30min — pra arquivos grandes)
            )
            logger.info(f"[AAI] Upload response: {resp.status_code}")
            if not resp.ok:
                raise RuntimeError(f"AAI upload error {resp.status_code}: {resp.text[:300]}")
            data = resp.json()
            if "upload_url" not in data:
                raise RuntimeError(f"AAI upload sem upload_url: {resp.text[:300]}")
            return data["upload_url"]
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
            last_err = exc
            wait = 2 ** attempt  # backoff exponencial: 2s, 4s, 8s
            logger.warning(f"[AAI] Upload tentativa {attempt}/{MAX_UPLOAD_RETRIES} falhou ({type(exc).__name__}). Retentando em {wait}s...")
            time.sleep(wait)

    raise RuntimeError(f"Upload falhou após {MAX_UPLOAD_RETRIES} tentativas. Verifique sua conexão. Último erro: {last_err}")


def transcribe(audio_url: str, *, track_user_id=None, operation="transcricao", track_project_id=None) -> str:
    """Submit transcription job and poll until done. Returns transcript text."""
    logger.info(f"[AAI] Starting transcription for {audio_url}")
    resp = requests.post(
        f"{AAI_BASE}/transcript",
        headers=_headers(),
        json={"audio_url": audio_url, "language_detection": True},
        timeout=30,
    )
    logger.info(f"[AAI] Transcript create: {resp.status_code} — {resp.text[:200]}")
    if not resp.ok:
        raise RuntimeError(f"AAI transcript error {resp.status_code}: {resp.text[:300]}")
    transcript_id = resp.json()["id"]
    logger.info(f"[AAI] Polling transcript {transcript_id}")

    while True:
        poll = requests.get(
            f"{AAI_BASE}/transcript/{transcript_id}",
            headers=_headers(),
            timeout=30,
        )
        if not poll.ok:
            raise RuntimeError(f"AAI poll error {poll.status_code}: {poll.text[:300]}")
        data = poll.json()
        status = data.get("status")
        logger.info(f"[AAI] Transcript status: {status}")
        if status == "completed":
            _track(track_user_id, operation, data.get("audio_duration"), track_project_id)
            return data.get("text") or ""
        if status == "error":
            raise RuntimeError(f"AAI transcription error: {data.get('error')}")
        time.sleep(5)


def transcribe_file(file_path: str, *, track_user_id=None, operation="transcricao", track_project_id=None) -> str:
    """Upload + transcribe a local file."""
    audio_url = upload_file(file_path)
    return transcribe(
        audio_url, track_user_id=track_user_id,
        operation=operation, track_project_id=track_project_id,
    )
