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
  "hook_escrito": "primeiras 3-5 frases exatamente como foram ditas",
  "frase_aterrissagem": "frases de transição do hook para o corpo — ideia central que conecta os dois (2-4 frases)",
  "corpo": "TRANSCRIÇÃO LITERAL E COMPLETA de tudo que é falado no vídeo após o hook escrito — palavra por palavra, exatamente como foi dito, sem resumir, sem comentar, sem parafrasear. Se houver múltiplas vozes, transcreva todas na ordem em que aparecem."
}"""


def analyze_ad(file_path: str) -> dict:
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

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[file_ref, ANALYSIS_PROMPT],
    )

    try:
        client.files.delete(name=file_ref.name)
    except Exception:
        pass

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
