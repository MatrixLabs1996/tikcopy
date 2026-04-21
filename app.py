import os
import re
import sys
import glob
import time
import json
import subprocess
from datetime import datetime
from pathlib import Path

import requests
import anthropic
import streamlit as st

BASE_DIR = Path(__file__).parent.resolve()

# Pasta local: Documentos no PC, /tmp na nuvem
_docs = Path.home() / "Documents" / "TikCopy"
TRANSCRICOES_DIR = _docs if _docs.parent.exists() else Path("/tmp/TikCopy")
TRANSCRICOES_DIR.mkdir(parents=True, exist_ok=True)

# Carrega secrets do Streamlit Cloud ou usa valores locais
def _secret(key: str, fallback: str = "") -> str:
    try:
        return st.secrets[key]
    except Exception:
        return os.environ.get(key, fallback)

ASSEMBLYAI_KEY = _secret("ASSEMBLYAI_KEY", "072432b2e3c4451c966bf4cb3cc8c857")
AAI_HEADERS    = {"authorization": ASSEMBLYAI_KEY, "content-type": "application/json"}
GDOCS_SCOPES   = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
]

# Google token: arquivo local ou secret da nuvem
TOKEN_PATH = BASE_DIR / "token.json"

def _ensure_token() -> Path | None:
    """Garante que token.json existe (local ou via secret)."""
    if TOKEN_PATH.exists():
        return TOKEN_PATH
    try:
        token_str = st.secrets["GOOGLE_TOKEN"]
        tmp = Path("/tmp/token.json")
        tmp.write_text(token_str)
        return tmp
    except Exception:
        return None

st.set_page_config(page_title="TikCopy", page_icon="🎬", layout="centered")

# ── Estilo ────────────────────────────────────────────────────────────────────
st.markdown("""
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  html, body, [class*="css"] { font-family: 'Inter', sans-serif; }

  .block-container { max-width: 820px; padding-top: 1.5rem; }

  /* Header */
  .tikcopy-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 4px;
  }
  .tikcopy-title {
    font-size: 2.2rem;
    font-weight: 700;
    background: linear-gradient(135deg, #fe2c55, #25f4ee);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    line-height: 1;
  }
  .tikcopy-sub {
    color: #888;
    font-size: 0.9rem;
    margin-bottom: 1.5rem;
  }

  /* Cards de resultado */
  .hook-box {
    background: linear-gradient(135deg, #1a0a10, #2d0d1a);
    border-left: 4px solid #fe2c55;
    border-radius: 10px;
    padding: 18px 22px;
    font-size: 1.1rem;
    font-weight: 600;
    line-height: 1.6;
    margin-bottom: 1rem;
    box-shadow: 0 4px 20px rgba(254,44,85,0.15);
  }
  .corpo-box {
    background: #0d1117;
    border: 1px solid #21262d;
    border-radius: 10px;
    padding: 18px 22px;
    line-height: 1.8;
    font-size: 0.97rem;
  }

  /* Abas */
  .stTabs [data-baseweb="tab-list"] {
    gap: 8px;
    background: transparent;
  }
  .stTabs [data-baseweb="tab"] {
    border-radius: 8px;
    padding: 6px 18px;
    font-weight: 500;
  }

  /* Input */
  .stTextInput input {
    border-radius: 10px;
    border: 1px solid #30363d;
    background: #0d1117;
    font-size: 0.95rem;
  }

  /* Botão primário */
  .stButton > button[kind="primary"] {
    background: linear-gradient(135deg, #fe2c55, #c0195e);
    border: none;
    border-radius: 10px;
    font-weight: 600;
    letter-spacing: 0.3px;
    height: 46px;
    transition: opacity 0.2s;
  }
  .stButton > button[kind="primary"]:hover { opacity: 0.88; }

  /* Sidebar */
  section[data-testid="stSidebar"] {
    background: #0d1117;
    border-right: 1px solid #21262d;
  }
  .sidebar-logo {
    text-align: center;
    padding: 1rem 0 0.5rem;
    font-size: 1.6rem;
    font-weight: 800;
    background: linear-gradient(135deg, #fe2c55, #25f4ee);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  /* Métricas */
  [data-testid="stMetricValue"] { font-size: 1.1rem; font-weight: 700; }
</style>
""", unsafe_allow_html=True)

# ── Sidebar ───────────────────────────────────────────────────────────────────
LOGO_PATH = BASE_DIR / "logo.png"

with st.sidebar:
    if LOGO_PATH.exists():
        st.image(str(LOGO_PATH), use_container_width=True)
    else:
        st.markdown('<div class="sidebar-logo">TikCopy</div>', unsafe_allow_html=True)
    st.caption("by Matrix Labs Digital")
    st.divider()

    # Carrega chave Anthropic do secret ou permite digitar manualmente
    _ant_key = _secret("ANTHROPIC_API_KEY")
    if _ant_key:
        os.environ["ANTHROPIC_API_KEY"] = _ant_key
    else:
        st.markdown("**🔑 Anthropic API Key**")
        anthropic_key_input = st.text_input(
            "key", value="", type="password",
            placeholder="sk-ant-...", label_visibility="collapsed",
        )
        if anthropic_key_input:
            os.environ["ANTHROPIC_API_KEY"] = anthropic_key_input

    st.divider()
    st.markdown("**📁 Pasta local**")
    st.code(str(TRANSCRICOES_DIR), language=None)
    if st.button("Abrir pasta", use_container_width=True):
        subprocess.Popen(f'explorer "{TRANSCRICOES_DIR}"')

    st.divider()
    st.markdown("**📄 Google Docs**")
    gdocs_ok = _ensure_token() is not None
    if gdocs_ok:
        st.success("Conectado ✓")
    else:
        st.warning("Não configurado")
        with st.expander("Como configurar"):
            st.markdown("""
1. [console.cloud.google.com](https://console.cloud.google.com)
2. Ative **Google Docs API** e **Google Drive API**
3. Crie credencial OAuth 2.0 → **Desktop**
4. Salve como `credentials.json` nesta pasta
5. Execute: `python setup_google.py`
""")

# ── Header ────────────────────────────────────────────────────────────────────
col_logo, col_titulo = st.columns([1, 4])
with col_logo:
    if LOGO_PATH.exists():
        st.image(str(LOGO_PATH), width=90)
with col_titulo:
    st.markdown('<div class="tikcopy-title">TikCopy</div>', unsafe_allow_html=True)
    st.markdown('<div class="tikcopy-sub">Transcreva, formate e salve conteúdo do TikTok em segundos.</div>', unsafe_allow_html=True)


# ── Helpers ───────────────────────────────────────────────────────────────────

def sanitize(name: str, max_len: int = 80) -> str:
    name = re.sub(r'[\\/*?:"<>|]', "", name)
    name = re.sub(r'\s+', " ", name).strip()
    return name[:max_len] or "sem_titulo"


def fmt_num(n) -> str:
    """Formata número: 115100 → 115.1K, 3100 → 3.1K, 169 → 169."""
    try:
        n = int(n)
    except (TypeError, ValueError):
        return "—"
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n/1_000:.1f}K"
    return str(n)


def fmt_duration(sec) -> str:
    """Formata segundos em MM:SS."""
    try:
        sec = int(sec)
        return f"{sec // 60:02d}:{sec % 60:02d}"
    except (TypeError, ValueError):
        return "—"


def download_audio(tiktok_url: str) -> tuple[str, str, dict]:
    """Baixa o áudio e retorna (caminho, titulo, metricas)."""
    output_template = str(BASE_DIR / "audio.%(ext)s")

    for f in glob.glob(str(BASE_DIR / "audio.*")):
        try:
            os.remove(f)
        except OSError:
            pass

    # Metadados completos (título + métricas) sem baixar
    meta_proc = subprocess.run(
        [sys.executable, "-m", "yt_dlp", "-j", "--skip-download", tiktok_url],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )

    metricas = {}
    titulo   = "Sem título"
    if meta_proc.stdout.strip():
        try:
            info   = json.loads(meta_proc.stdout.strip().splitlines()[0])
            titulo = info.get("title") or "Sem título"

            raw_date = info.get("upload_date", "")
            try:
                pub = datetime.strptime(raw_date, "%Y%m%d").strftime("%d/%m/%Y")
            except Exception:
                pub = raw_date or "—"

            metricas = {
                "views":          fmt_num(info.get("view_count")),
                "likes":          fmt_num(info.get("like_count")),
                "comentarios":    fmt_num(info.get("comment_count")),
                "compartilhamentos": fmt_num(info.get("repost_count")),
                "plays":          fmt_num(info.get("play_count") or info.get("view_count")),
                "duracao":        fmt_duration(info.get("duration")),
                "publicado":      pub,
                "autor":          info.get("uploader") or info.get("channel") or "—",
            }
        except Exception:
            pass

    # Download de fato
    dl_proc = subprocess.run(
        [sys.executable, "-m", "yt_dlp", "-f", "bestaudio/best",
         "--no-playlist", "-o", output_template, tiktok_url],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=str(BASE_DIR),
    )

    if dl_proc.returncode != 0:
        raise RuntimeError(dl_proc.stderr.strip() or "yt-dlp falhou.")

    files = glob.glob(str(BASE_DIR / "audio.*"))
    if not files:
        raise RuntimeError(f"Arquivo de áudio não encontrado em {BASE_DIR}.\n{dl_proc.stdout[:300]}")

    return files[0], titulo, metricas


def upload_to_assemblyai(file_path: str) -> str:
    with open(file_path, "rb") as f:
        resp = requests.post(
            "https://api.assemblyai.com/v2/upload",
            headers={"authorization": ASSEMBLYAI_KEY},
            data=f,
        )
    resp.raise_for_status()
    return resp.json()["upload_url"]


def transcrever(audio_url: str) -> str:
    resp = requests.post(
        "https://api.assemblyai.com/v2/transcript",
        headers=AAI_HEADERS,
        json={"audio_url": audio_url, "language_detection": True},
    )
    resp.raise_for_status()
    transcript_id = resp.json()["id"]

    while True:
        poll = requests.get(
            f"https://api.assemblyai.com/v2/transcript/{transcript_id}",
            headers=AAI_HEADERS,
        )
        poll.raise_for_status()
        data = poll.json()
        if data["status"] == "completed":
            return data.get("text") or ""
        if data["status"] == "error":
            raise RuntimeError(f"AssemblyAI error: {data.get('error')}")
        time.sleep(3)


def formatar(transcript: str) -> tuple[str, str]:
    client = anthropic.Anthropic()
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=800,
        messages=[{
            "role": "user",
            "content": (
                "Você é especialista em copywriting para redes sociais.\n"
                "Dado o transcript de um vídeo do TikTok, separe em:\n"
                "- HOOK: frase inicial que prende a atenção (max 2 frases)\n"
                "- CORPO: restante do conteúdo de forma clara\n\n"
                f"Transcript:\n{transcript}\n\n"
                'Responda SOMENTE em JSON válido, sem texto antes ou depois: {"hook": "...", "corpo": "..."}'
            ),
        }],
    )

    raw = resp.content[0].text.strip()
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        data = json.loads(match.group())
        return data["hook"], data["corpo"]

    # Fallback heurístico
    sentences = re.split(r'(?<=[.!?])\s+', transcript.strip())
    hook  = " ".join(sentences[:2]) if len(sentences) >= 2 else transcript[:200]
    corpo = " ".join(sentences[2:]) if len(sentences) > 2  else transcript
    return hook, corpo


def bloco_metricas(metricas: dict, capturado_em: str) -> str:
    """Gera o bloco de métricas formatado para txt/docs."""
    if not metricas:
        return ""
    return (
        f"📊 MÉTRICAS (capturadas em {capturado_em})\n"
        f"  👁  Views:               {metricas.get('views', '—')}\n"
        f"  ▶️  Plays:               {metricas.get('plays', '—')}\n"
        f"  ❤️  Likes:               {metricas.get('likes', '—')}\n"
        f"  💬 Comentários:         {metricas.get('comentarios', '—')}\n"
        f"  ↗️  Compartilhamentos:   {metricas.get('compartilhamentos', '—')}\n"
        f"  ⏱️  Duração:             {metricas.get('duracao', '—')}\n"
        f"  📅 Publicado em:        {metricas.get('publicado', '—')}\n"
        f"  👤 Autor:               @{metricas.get('autor', '—')}\n"
    )


def salvar_local(titulo: str, hook: str, corpo: str, transcript: str, url: str, metricas: dict) -> Path:
    data_hora     = datetime.now().strftime("%Y-%m-%d_%H-%M")
    capturado_em  = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    nome          = f"{data_hora} - {sanitize(titulo)}.txt"
    caminho       = TRANSCRICOES_DIR / nome

    with open(caminho, "w", encoding="utf-8") as f:
        f.write(f"Título: {titulo}\n")
        f.write(f"URL: {url}\n\n")
        f.write(bloco_metricas(metricas, capturado_em))
        f.write("\n" + "─" * 60 + "\n\n")
        f.write(f"HOOK:\n{hook}\n\n")
        f.write(f"CORPO:\n{corpo}\n\n")
        f.write("─" * 60 + "\n\n")
        f.write(f"TRANSCRIÇÃO COMPLETA:\n{transcript}\n")

    return caminho


def salvar_google_docs(titulo: str, hook: str, corpo: str, transcript: str, url: str, metricas: dict) -> str | None:
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build

        token_path = _ensure_token()
        if not token_path:
            return None

        creds = Credentials.from_authorized_user_file(str(token_path), GDOCS_SCOPES)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            TOKEN_PATH.write_text(creds.to_json())

        capturado_em = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

        service = build("docs", "v1", credentials=creds)
        doc     = service.documents().create(body={"title": titulo}).execute()
        doc_id  = doc["documentId"]

        content = (
            f"{titulo}\n"
            f"URL: {url}\n\n"
            f"{bloco_metricas(metricas, capturado_em)}\n"
            f"{'─'*60}\n\n"
            f"HOOK:\n{hook}\n\n"
            f"CORPO:\n{corpo}\n\n"
            f"{'─'*60}\n\n"
            f"TRANSCRIÇÃO COMPLETA:\n{transcript}\n"
        )
        service.documents().batchUpdate(
            documentId=doc_id,
            body={"requests": [{"insertText": {"location": {"index": 1}, "text": content}}]},
        ).execute()

        return f"https://docs.google.com/document/d/{doc_id}/edit"
    except Exception:
        return None


# ── Função de processamento (reutilizada nas duas abas) ──────────────────────
def processar_video(url: str) -> dict | None:
    audio_path = None
    try:
        st.write("⬇️ Baixando áudio e métricas...")
        audio_path, titulo, metricas = download_audio(url)
        st.write(f"✅ `{Path(audio_path).name}` baixado")

        st.write("☁️ Enviando para AssemblyAI...")
        audio_url_aai = upload_to_assemblyai(audio_path)
        st.write("✅ Upload concluído")

        st.write("🎙️ Transcrevendo...")
        transcript = transcrever(audio_url_aai)
        if not transcript:
            raise ValueError("Transcrição retornou vazia.")
        st.write("✅ Transcrição concluída")

        st.write("✍️ Formatando com Claude Haiku...")
        hook, corpo = formatar(transcript)
        st.write("✅ Formatação pronta")

        st.write("💾 Salvando...")
        txt_path = salvar_local(titulo, hook, corpo, transcript, url, metricas)
        doc_url  = salvar_google_docs(titulo, hook, corpo, transcript, url, metricas)
        st.write("✅ Salvo" + (" + Google Docs" if doc_url else " localmente"))

        return dict(titulo=titulo, metricas=metricas, hook=hook,
                    corpo=corpo, transcript=transcript,
                    txt_path=txt_path, doc_url=doc_url)
    except Exception as exc:
        st.error(f"Erro: {exc}")
        return None
    finally:
        for f in glob.glob(str(BASE_DIR / "audio.*")):
            try:
                os.remove(f)
            except OSError:
                pass


def exibir_resultado(r: dict, key_suffix: str = ""):
    st.subheader(f"📌 {r['titulo']}")
    if r["metricas"]:
        c1, c2, c3, c4, c5 = st.columns(5)
        c1.metric("👁 Views",    r["metricas"].get("views", "—"))
        c2.metric("❤️ Likes",    r["metricas"].get("likes", "—"))
        c3.metric("💬 Coment.", r["metricas"].get("comentarios", "—"))
        c4.metric("↗ Shares",   r["metricas"].get("compartilhamentos", "—"))
        c5.metric("⏱ Duração",  r["metricas"].get("duracao", "—"))
        st.caption(
            f"📅 {r['metricas'].get('publicado','—')} · "
            f"@{r['metricas'].get('autor','—')} · "
            f"Capturado em {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}"
        )
    st.markdown("**🪝 Hook**")
    st.markdown(f'<div class="hook-box">{r["hook"]}</div>', unsafe_allow_html=True)
    st.markdown("**📝 Corpo**")
    st.markdown(f'<div class="corpo-box">{r["corpo"]}</div>', unsafe_allow_html=True)
    with st.expander("Ver transcrição completa"):
        st.write(r["transcript"])
    col1, col2 = st.columns(2)
    with col1:
        st.caption(f"📁 `{r['txt_path'].name}`")
        if st.button("Abrir pasta", key=f"pasta{key_suffix}"):
            subprocess.Popen(f'explorer "{TRANSCRICOES_DIR}"')
    with col2:
        if r["doc_url"]:
            st.link_button("📄 Abrir no Google Docs", r["doc_url"], use_container_width=True)


# ── Abas ──────────────────────────────────────────────────────────────────────
aba_unico, aba_massa = st.tabs(["🔗 Link único", "📋 Em massa"])

# ── Aba 1: Link único ─────────────────────────────────────────────────────────
with aba_unico:
    url = st.text_input("Link do TikTok", placeholder="https://www.tiktok.com/@usuario/video/...")
    processar = st.button("▶ Processar", type="primary", use_container_width=True)

    if processar and url.strip():
        with st.status("Processando...", expanded=True) as status:
            resultado = processar_video(url.strip())
            if resultado:
                status.update(label="Concluído! ✅", state="complete")
        if resultado:
            st.divider()
            exibir_resultado(resultado, key_suffix="_unico")
    elif processar:
        st.warning("Cole um link antes de processar.")

# ── Aba 2: Em massa ───────────────────────────────────────────────────────────
with aba_massa:
    st.caption("Cole um link por linha. O app processa um de cada vez e salva tudo automaticamente.")
    links_raw = st.text_area(
        "Links do TikTok (um por linha)",
        placeholder="https://www.tiktok.com/@usuario/video/...\nhttps://www.tiktok.com/@outro/video/...",
        height=200,
        label_visibility="visible",
    )
    processar_massa = st.button("▶ Processar todos", type="primary", use_container_width=True)

    if processar_massa and links_raw.strip():
        links = [l.strip() for l in links_raw.splitlines() if l.strip()]
        total = len(links)
        st.info(f"**{total} links** encontrados. Processando um por vez...")

        progresso = st.progress(0, text="Iniciando...")
        resumo    = []

        for i, link in enumerate(links, start=1):
            progresso.progress((i - 1) / total, text=f"Processando {i}/{total}...")
            st.markdown(f"---\n**[{i}/{total}]** `{link}`")

            with st.status(f"Vídeo {i} de {total}", expanded=True) as s:
                resultado = processar_video(link)
                if resultado:
                    s.update(label=f"✅ {resultado['titulo'][:60]}", state="complete", expanded=False)
                    resumo.append({"ok": True, "titulo": resultado["titulo"], "doc": resultado["doc_url"]})
                    exibir_resultado(resultado, key_suffix=f"_massa_{i}")
                else:
                    s.update(label=f"❌ Falhou — link {i}", state="error", expanded=False)
                    resumo.append({"ok": False, "titulo": link, "doc": None})

        progresso.progress(1.0, text=f"Concluído! {sum(r['ok'] for r in resumo)}/{total} processados.")

        st.divider()
        st.subheader("📊 Resumo final")
        for item in resumo:
            status_icon = "✅" if item["ok"] else "❌"
            if item["doc"]:
                st.markdown(f"{status_icon} [{item['titulo'][:80]}]({item['doc']})")
            else:
                st.markdown(f"{status_icon} `{item['titulo'][:80]}`")
        if st.button("📁 Abrir pasta com todos os arquivos"):
            subprocess.Popen(f'explorer "{TRANSCRICOES_DIR}"')

    elif processar_massa:
        st.warning("Cole ao menos um link antes de processar.")
