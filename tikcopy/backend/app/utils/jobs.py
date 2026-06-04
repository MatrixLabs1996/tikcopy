"""In-memory job store with automatic TTL-based cleanup.

Mantém o mesmo dict[str, dict] de antes (compatível com código existente),
mas anexa um timestamp interno e podas jobs concluídos com mais de TTL_SECONDS.
"""

import time

# 1 hora: tempo suficiente para o frontend completar polling, mas evita acúmulo.
TTL_SECONDS = 3600


def set_job(jobs: dict, job_id: str, payload: dict) -> None:
    """Salva o estado do job e injeta timestamp."""
    payload["_ts"] = time.time()
    jobs[job_id] = payload


def get_job(jobs: dict, job_id: str) -> dict | None:
    return jobs.get(job_id)


def cleanup_jobs(jobs: dict) -> int:
    """Remove jobs em estado terminal (done/error) com idade > TTL_SECONDS.
    Retorna a quantidade de jobs removidos."""
    now = time.time()
    expired = [
        jid for jid, job in jobs.items()
        if job.get("status") in ("done", "error") and (now - job.get("_ts", now)) > TTL_SECONDS
    ]
    for jid in expired:
        jobs.pop(jid, None)
    return len(expired)
