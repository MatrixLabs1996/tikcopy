import os
import time
import requests

AAI_BASE = "https://api.assemblyai.com/v2"


def _headers():
    key = os.environ["ASSEMBLYAI_KEY"]
    return {"authorization": key, "content-type": "application/json"}


def upload_file(file_path: str) -> str:
    """Upload a local file to AssemblyAI and return the upload URL."""
    key = os.environ["ASSEMBLYAI_KEY"]
    with open(file_path, "rb") as f:
        resp = requests.post(
            f"{AAI_BASE}/upload",
            headers={"authorization": key},
            data=f,
        )
    resp.raise_for_status()
    return resp.json()["upload_url"]


def transcribe(audio_url: str) -> str:
    """Submit transcription job and poll until done. Returns transcript text."""
    resp = requests.post(
        f"{AAI_BASE}/transcript",
        headers=_headers(),
        json={"audio_url": audio_url, "language_detection": True},
    )
    resp.raise_for_status()
    transcript_id = resp.json()["id"]

    while True:
        poll = requests.get(
            f"{AAI_BASE}/transcript/{transcript_id}",
            headers=_headers(),
        )
        poll.raise_for_status()
        data = poll.json()
        if data["status"] == "completed":
            return data.get("text") or ""
        if data["status"] == "error":
            raise RuntimeError(f"AssemblyAI error: {data.get('error')}")
        time.sleep(3)


def transcribe_file(file_path: str) -> str:
    """Upload + transcribe a local file."""
    audio_url = upload_file(file_path)
    return transcribe(audio_url)
