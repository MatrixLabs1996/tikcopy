"""Cloudflare R2 storage — guarda vídeos originais das transcrições.

R2 é compatível com a API do S3, então usamos boto3.
Variáveis de ambiente necessárias:
- R2_ACCOUNT_ID
- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- R2_BUCKET (default: tikcopy-videos)
- R2_PUBLIC_URL (opcional — se usar custom domain)
"""

import os
import logging
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)


def _enabled() -> bool:
    """R2 está configurado e ativo?"""
    return all([
        os.environ.get("R2_ACCOUNT_ID"),
        os.environ.get("R2_ACCESS_KEY_ID"),
        os.environ.get("R2_SECRET_ACCESS_KEY"),
    ])


@lru_cache(maxsize=1)
def _client():
    """Cliente boto3 configurado pra R2."""
    import boto3
    from botocore.client import Config

    account_id = os.environ["R2_ACCOUNT_ID"]
    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def _bucket() -> str:
    return os.environ.get("R2_BUCKET", "tikcopy-videos")


def upload_video(file_path: str, user_id: str, swipe_id: str, content_type: str = "video/mp4") -> dict:
    """Sobe um vídeo pro R2.

    Caminho no bucket: {user_id}/{swipe_id}{ext}
    Retorna: {key, size_bytes, content_type}
    """
    if not _enabled():
        raise RuntimeError("R2 não está configurado. Configure as variáveis R2_* no .env")

    ext = Path(file_path).suffix.lower() or ".mp4"
    key = f"{user_id}/{swipe_id}{ext}"
    size_bytes = os.path.getsize(file_path)

    logger.info(f"[R2] Uploading {file_path} ({size_bytes / 1024 / 1024:.1f} MB) → {key}")

    with open(file_path, "rb") as f:
        _client().upload_fileobj(
            f,
            _bucket(),
            key,
            ExtraArgs={"ContentType": content_type},
        )

    logger.info(f"[R2] Upload completo: {key}")
    return {
        "key": key,
        "size_bytes": size_bytes,
        "content_type": content_type,
    }


def upload_file(file_path: str, key: str, content_type: str = "application/octet-stream") -> dict:
    """Sobe um arquivo genérico pro R2 num caminho específico."""
    if not _enabled():
        raise RuntimeError("R2 não está configurado. Configure as variáveis R2_* no .env")

    size_bytes = os.path.getsize(file_path)
    logger.info(f"[R2] Uploading {file_path} ({size_bytes / 1024 / 1024:.1f} MB) → {key}")

    with open(file_path, "rb") as f:
        _client().upload_fileobj(f, _bucket(), key, ExtraArgs={"ContentType": content_type})

    logger.info(f"[R2] Upload completo: {key}")
    return {"key": key, "size_bytes": size_bytes, "content_type": content_type}


def get_presigned_url(key: str, expires_in: int = 3600) -> str:
    """Gera URL temporária pra playback/download (1h por padrão)."""
    if not _enabled():
        raise RuntimeError("R2 não está configurado")

    # Se tem um custom domain configurado, usa ele (URL pública permanente)
    public_url = os.environ.get("R2_PUBLIC_URL")
    if public_url:
        return f"{public_url.rstrip('/')}/{key}"

    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": _bucket(), "Key": key},
        ExpiresIn=expires_in,
    )


def delete_video(key: str) -> None:
    if not _enabled():
        return
    _client().delete_object(Bucket=_bucket(), Key=key)
    logger.info(f"[R2] Deletado: {key}")


def list_user_keys(user_id: str) -> list[str]:
    """Lista TODAS as keys de vídeos do usuário no bucket (com paginação)."""
    if not _enabled():
        return []
    keys = []
    token = None
    try:
        while True:
            kwargs = {"Bucket": _bucket(), "Prefix": f"{user_id}/"}
            if token:
                kwargs["ContinuationToken"] = token
            resp = _client().list_objects_v2(**kwargs)
            keys.extend(obj["Key"] for obj in resp.get("Contents", []))
            if resp.get("IsTruncated"):
                token = resp.get("NextContinuationToken")
            else:
                break
    except Exception as exc:
        logger.warning(f"[R2] Erro ao listar keys do user {user_id}: {exc}")
    return keys


def get_user_storage_used(user_id: str) -> int:
    """Soma o tamanho de todos os vídeos do usuário (bytes)."""
    if not _enabled():
        return 0
    try:
        total = 0
        token = None
        while True:
            kwargs = {"Bucket": _bucket(), "Prefix": f"{user_id}/"}
            if token:
                kwargs["ContinuationToken"] = token
            resp = _client().list_objects_v2(**kwargs)
            total += sum(obj.get("Size", 0) for obj in resp.get("Contents", []))
            if resp.get("IsTruncated"):
                token = resp.get("NextContinuationToken")
            else:
                break
        return total
    except Exception as exc:
        logger.warning(f"[R2] Erro ao calcular storage do user {user_id}: {exc}")
        return 0


def health_check() -> dict:
    """Verifica se R2 está acessível."""
    if not _enabled():
        return {"enabled": False, "configured": False}
    try:
        _client().head_bucket(Bucket=_bucket())
        return {"enabled": True, "configured": True, "bucket": _bucket(), "ok": True}
    except Exception as exc:
        return {"enabled": True, "configured": True, "ok": False, "error": str(exc)[:200]}
