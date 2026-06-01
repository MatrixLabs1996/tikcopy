import os
import re
import json
import time
from pathlib import Path

GEMINI_MIME = {
    ".mp4": "video/mp4", ".mov": "video/quicktime", ".avi": "video/avi",
    ".mkv": "video/x-matroska", ".webm": "video/webm",
    ".m4a": "audio/mp4", ".mp3": "audio/mpeg",
    ".wav": "audio/wav", ".ogg": "audio/ogg", ".flac": "audio/flac",
}

ANALYSIS_PROMPT = """Você é especialista em análise de anúncios de resposta direta.
Assista a este vídeo e preencha TODOS os campos abaixo com precisão.
Retorne SOMENTE um JSON válido, sem texto antes ou depois.

{
  "titulo": "descrição curta do anúncio em até 8 palavras",
  "duracao": "duração no formato MM:SS",
  "avatar": {
    "nome": "nome se for celebridade/famoso, senão deixe vazio",
    "genero": "Masculino / Feminino / Não identificado",
    "idade_aparente": "ex: 25-30 anos",
    "roupa": "descrição da roupa",
    "ambiente": "onde foi gravado",
    "energia": "ex: calmo, empolgado, urgente, neutro"
  },
  "formato_video": "como o vídeo foi filmado: podcast, frente à câmera, entrevista, notícia, UGC, receita, cinematográfico, etc",
  "edicao": {
    "legendas": "Sim — estilo / Não",
    "trilha": "Sim — tipo / Não",
    "ritmo": "Lento / Médio / Rápido",
    "headline": "headline principal exibida na tela se houver — senão: Não",
    "elementos_visuais": "cortes, gráficos, imagens de apoio, etc"
  },
  "hook_visual": "o que aparece nos primeiros 2-3 segundos: elementos em cena, headline na tela, formato do hook. REGRA IMPORTANTE: se uma pessoa aparece falando por cima de um vídeo sem fundo próprio = React (NÃO tela dividida). Tela dividida = dois painéis lado a lado. Outros formatos: frente à câmera, receita, notícia, UGC, podcast, etc",
  "hook_escrito": "primeiras 3-5 frases exatamente como foram ditas (apenas o gancho de abertura)",
  "corpo": "TRANSCRIÇÃO LITERAL E COMPLETA de TUDO que é falado no vídeo APÓS as frases do hook escrito, palavra por palavra, na ordem exata, do começo ao fim do vídeo. REGRAS CRÍTICAS: (1) Comece exatamente na primeira palavra dita logo depois do hook. (2) NÃO pule NENHUMA frase, incluindo frases de transição/conexão entre o hook e o restante. (3) NÃO resuma, NÃO comente, NÃO parafraseie. (4) Vá até a última palavra falada no vídeo, incluindo o CTA final. (5) Se houver múltiplas vozes, transcreva todas na ordem em que aparecem. O hook + o corpo, juntos, devem reconstruir o áudio INTEIRO do anúncio sem nenhum trecho faltando."
}"""


# Preço gemini-2.5-flash: in US$0.30/M, out US$2.50/M (vídeo/áudio é tokenizado no input).
GEMINI_IN_PER_M = 0.30
GEMINI_OUT_PER_M = 2.50


def _track(user_id, operation, usage_metadata, project_id):
    """Registra o custo da análise Gemini no medidor (best-effort)."""
    if not user_id or usage_metadata is None:
        return
    try:
        from app.services.usage_tracker import track_flat
        inp = getattr(usage_metadata, "prompt_token_count", 0) or 0
        out = getattr(usage_metadata, "candidates_token_count", 0) or 0
        cost = (inp * GEMINI_IN_PER_M + out * GEMINI_OUT_PER_M) / 1_000_000
        track_flat(
            user_id=user_id, operation=operation, provider="gemini",
            model="gemini-2.5-flash", cost_usd=cost, project_id=project_id,
            meta={"input_tokens": inp, "output_tokens": out},
        )
    except Exception:
        pass


def analyze_ad(file_path: str, *, track_user_id=None, operation="analise_anuncio", track_project_id=None) -> dict:
    """Analyze an ad video/audio file using Gemini 2.5 Flash."""
    try:
        from google import genai as google_genai
    except ImportError:
        raise RuntimeError("Instale google-genai: pip install google-genai")

    gemini_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_key:
        raise ValueError("GEMINI_API_KEY não configurada.")

    client = google_genai.Client(api_key=gemini_key)
    mime_type = GEMINI_MIME.get(Path(file_path).suffix.lower(), "video/mp4")
    file_ref = client.files.upload(file=file_path, config={"mime_type": mime_type})

    while file_ref.state.name == "PROCESSING":
        time.sleep(2)
        file_ref = client.files.get(name=file_ref.name)

    if file_ref.state.name != "ACTIVE":
        raise RuntimeError(f"Gemini não processou o arquivo (estado: {file_ref.state.name}).")

    # Retry com backoff em erros transientes do Gemini (503 sobrecarga, 429 rate limit).
    response = None
    last_exc = None
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[file_ref, ANALYSIS_PROMPT],
            )
            break
        except Exception as exc:
            msg = str(exc)
            transient = any(s in msg for s in (
                "503", "UNAVAILABLE", "overloaded", "high demand",
                "429", "RESOURCE_EXHAUSTED",
            ))
            last_exc = exc
            if transient and attempt < 2:
                time.sleep(2 ** (attempt + 1))  # 2s, 4s
                continue
            raise
    if response is None:
        raise last_exc or RuntimeError("Gemini não respondeu.")

    _track(track_user_id, operation, getattr(response, "usage_metadata", None), track_project_id)

    try:
        client.files.delete(name=file_ref.name)
    except Exception:
        pass

    # response.text pode ser None se o Gemini bloqueou ou não gerou texto
    if not response.text:
        # Tenta extrair motivo do bloqueio
        reason = ""
        try:
            reason = str(response.prompt_feedback) or str(response.candidates[0].finish_reason)
        except Exception:
            pass
        raise ValueError(f"Gemini não gerou resposta de texto.{' Motivo: ' + reason if reason else ' Possível bloqueio de segurança ou arquivo inválido.'}")

    raw = response.text.strip()
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if not match:
        raise ValueError(f"Gemini não retornou JSON válido.\nResposta: {raw[:400]}")

    data = json.loads(match.group())
    return {
        "title": data.get("titulo", Path(file_path).stem),
        "duration": data.get("duracao", "—"),
        "avatar": data.get("avatar", {}),
        "video_format": data.get("formato_video", ""),
        "editing": data.get("edicao", {}),
        "hook_visual": data.get("hook_visual", ""),
        "hook_written": data.get("hook_escrito", ""),
        "landing_phrase": data.get("frase_aterrissagem", ""),
        "body": data.get("corpo", ""),
    }
