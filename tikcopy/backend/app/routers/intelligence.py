"""Inteligência: documentos enviados pelo usuário + análises salvas como memória do projeto."""

import io
import re
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, Body
from fastapi.responses import StreamingResponse

from app.middleware.auth import get_current_user
from app.services import document_parser
from app.services.supabase_client import get_supabase

router = APIRouter()

TEMP_DIR = Path(__file__).parent.parent.parent / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# Tipos de memória que esta API gerencia (mantém project_memory consistente)
DOCUMENT_TYPES = {
    "document", "vsl_analysis", "ad_analysis", "manual_note",
    "transcript_vsl", "transcript_ad", "transcript_organic", "transcript_lesson",
    "hook",
}


def _check_project_ownership(sb, project_id: str, user_id: str):
    project = sb.table("projects").select("user_id").eq("id", project_id).single().execute()
    if not project.data or project.data["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")


# ─── Upload de documentos ────────────────────────────────────────────────────

SUPPORTED_DOC_EXTENSIONS = (".pdf", ".docx", ".txt", ".md")


def _insert_memory_entry(sb, project_id: str, content: str, filename: str, title: str | None, source: str):
    """Helper: insere uma entrada em project_memory."""
    return sb.table("project_memory").insert({
        "project_id": project_id,
        "type": "document",
        "content": content,
        "metadata": {
            "source": source,
            "filename": filename,
            "title": title or Path(filename).stem,
            "size_chars": len(content),
        },
        "active": True,
    }).execute()


@router.post("/{project_id}/documents")
async def upload_document(
    project_id: str,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    source: Optional[str] = Form("upload"),
    current_user=Depends(get_current_user),
):
    """Upload de PDF/DOCX/TXT/MD ou ZIP (Obsidian/Notion/Claude) — extrai e salva como memória."""
    sb = get_supabase()
    _check_project_ownership(sb, project_id, current_user.id)

    suffix = Path(file.filename).suffix.lower()

    # ── ZIP: extrai e processa cada arquivo .md/.txt/.pdf/.docx dentro ──
    if suffix == ".zip":
        import zipfile
        tmp_zip = TEMP_DIR / f"{uuid.uuid4().hex}.zip"
        tmp_zip.write_bytes(await file.read())
        imported = 0
        errors = []
        try:
            with zipfile.ZipFile(tmp_zip, "r") as zf:
                for name in zf.namelist():
                    # ignora diretórios, arquivos ocultos e metadados do Obsidian/Notion
                    if name.endswith("/") or "/." in name or name.startswith("."):
                        continue
                    if "/.obsidian/" in name or "/_resources/" in name:
                        continue
                    ext = Path(name).suffix.lower()
                    if ext not in SUPPORTED_DOC_EXTENSIONS:
                        continue
                    try:
                        # Extrai pra arquivo temporário (necessário pro pypdf/docx)
                        tmp_file = TEMP_DIR / f"{uuid.uuid4().hex}{ext}"
                        tmp_file.write_bytes(zf.read(name))
                        try:
                            text = document_parser.extract_text(str(tmp_file))
                        finally:
                            try: tmp_file.unlink()
                            except OSError: pass

                        if text.strip():
                            # Notion adiciona um hash no final do nome — limpa
                            clean_name = Path(name).name
                            clean_title = Path(clean_name).stem
                            # Remove sufixo hexadecimal do Notion (ex: "Título abc123def...")
                            import re as _re
                            clean_title = _re.sub(r'\s+[a-f0-9]{32}$', '', clean_title)
                            _insert_memory_entry(sb, project_id, text, clean_name, clean_title, source or "import-zip")
                            imported += 1
                    except Exception as exc:
                        errors.append(f"{name}: {exc}")
        finally:
            try: tmp_zip.unlink()
            except OSError: pass

        if imported == 0:
            raise HTTPException(status_code=400, detail="Nenhum arquivo válido (PDF/DOCX/TXT/MD) encontrado no ZIP.")
        return {"imported": imported, "errors": errors[:5]}  # mostra até 5 erros

    # ── Arquivo único ──
    if suffix not in SUPPORTED_DOC_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Formato {suffix} não suportado. Use PDF, DOCX, TXT, MD ou ZIP.")

    tmp_path = TEMP_DIR / f"{uuid.uuid4().hex}{suffix}"
    try:
        tmp_path.write_bytes(await file.read())
        text = document_parser.extract_text(str(tmp_path))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Erro ao processar o arquivo: {exc}")
    finally:
        try: tmp_path.unlink()
        except OSError: pass

    if not text.strip():
        raise HTTPException(status_code=400, detail="Arquivo está vazio ou ilegível.")

    display_title = title or Path(file.filename).stem
    res = _insert_memory_entry(sb, project_id, text, file.filename, display_title, source or "upload")
    return res.data[0] if res.data else {}


# ─── Salvar análises (VSL / Ads) na memória ──────────────────────────────────

@router.post("/{project_id}/save-analysis")
async def save_analysis(
    project_id: str,
    body: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """Salva uma análise (VSL RMBC ou Engenharia Reversa de Ad) como memória do projeto.

    Body esperado:
    {
      "type": "vsl_analysis" | "ad_analysis",
      "title": "Nome para identificar",
      "content": "texto formatado da análise (markdown ou texto)",
      "metadata": { ... opcional ... }
    }
    """
    sb = get_supabase()
    _check_project_ownership(sb, project_id, current_user.id)

    mem_type = body.get("type")
    if mem_type not in ("vsl_analysis", "ad_analysis"):
        raise HTTPException(status_code=400, detail="type deve ser 'vsl_analysis' ou 'ad_analysis'")

    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content vazio")

    res = sb.table("project_memory").insert({
        "project_id": project_id,
        "type": mem_type,
        "content": content,
        "metadata": {
            "title": body.get("title") or "Análise sem título",
            **(body.get("metadata") or {}),
        },
        "active": True,
    }).execute()
    return res.data[0] if res.data else {}


# ─── Listar / deletar entradas ───────────────────────────────────────────────

@router.get("/{project_id}/documents")
async def list_documents(project_id: str, current_user=Depends(get_current_user)):
    """Lista todas as entradas de memória manuais (documentos + análises salvas)."""
    sb = get_supabase()
    _check_project_ownership(sb, project_id, current_user.id)

    # Tenta com metadata; se a coluna não existir ainda no banco, refaz sem
    try:
        res = (
            sb.table("project_memory")
            .select("id, type, content, metadata, created_at, active")
            .eq("project_id", project_id)
            .in_("type", list(DOCUMENT_TYPES))
            .order("created_at", desc=True)
            .execute()
        )
        return res.data or []
    except Exception as exc:
        if "metadata" in str(exc).lower() or "active" in str(exc).lower():
            # Fallback: schema antigo sem metadata/active
            res = (
                sb.table("project_memory")
                .select("id, type, content, created_at")
                .eq("project_id", project_id)
                .in_("type", list(DOCUMENT_TYPES))
                .order("created_at", desc=True)
                .execute()
            )
            # Normaliza pra ter os campos esperados pelo frontend
            data = res.data or []
            for item in data:
                item.setdefault("metadata", {"title": "Sem título"})
                item.setdefault("active", True)
            return data
        raise


@router.delete("/{project_id}/documents/{memory_id}")
async def delete_document(
    project_id: str,
    memory_id: str,
    current_user=Depends(get_current_user),
):
    sb = get_supabase()
    _check_project_ownership(sb, project_id, current_user.id)
    sb.table("project_memory").delete().eq("id", memory_id).eq("project_id", project_id).execute()
    return {"ok": True}


# ─── Export para Obsidian (ZIP de Markdown) ──────────────────────────────────

def _safe_filename(name: str) -> str:
    """Remove caracteres inválidos pra nome de arquivo, mantém legibilidade."""
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', name or '')
    name = re.sub(r'\s+', ' ', name).strip()
    return (name[:80] or 'sem-titulo').rstrip(' .')


def _md_frontmatter(**fields) -> str:
    """Gera bloco YAML frontmatter (compatível com Obsidian/Dataview)."""
    lines = ['---']
    for k, v in fields.items():
        if v is None:
            continue
        if isinstance(v, list):
            v = ', '.join(str(x) for x in v if x)
        lines.append(f'{k}: {v}')
    lines.append('---')
    return '\n'.join(lines) + '\n\n'


@router.get("/{project_id}/export")
async def export_to_obsidian(
    project_id: str,
    current_user=Depends(get_current_user),
):
    """Gera um ZIP de Markdown pronto pra extrair em um vault do Obsidian.

    Estrutura:
      <Projeto>/
        README.md
        Documentos/<titulo>.md
        Análises VSL/<titulo>.md
        Análises Ads/<titulo>.md
        Briefings/<titulo>.md
        Pesquisas/<titulo>.md
        Hooks.md          (lista consolidada)
        Swipes/<tag>.md
        Transcrições/<titulo>.md (com link pro original)
    """
    sb = get_supabase()
    project = sb.table("projects").select("*").eq("id", project_id).single().execute()
    if not project.data or project.data["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    project_name = project.data.get("name") or "Projeto"
    root = _safe_filename(project_name)

    # ── Coleta tudo do projeto ──
    memory  = sb.table("project_memory").select("*").eq("project_id", project_id).execute().data or []
    drafts  = sb.table("drafts").select("*").eq("project_id", project_id).eq("user_id", current_user.id).execute().data or []
    swipes  = sb.table("swipes").select("*").eq("project_id", project_id).eq("user_id", current_user.id).execute().data or []
    briefs  = sb.table("briefings").select("*").eq("project_id", project_id).eq("user_id", current_user.id).execute().data or []
    research = sb.table("researches").select("*").eq("project_id", project_id).eq("user_id", current_user.id).execute().data or []
    transcripts = sb.table("transcriptions").select("*").eq("project_id", project_id).eq("user_id", current_user.id).execute().data or []

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:

        # ── README com índice ──
        readme = [
            f"# {project_name}",
            "",
            f"_Exportado de TikCopy em {datetime.now().strftime('%d/%m/%Y %H:%M')}_",
            "",
            "## Conteúdo",
            "",
        ]

        # ── Memória (documentos + análises) ──
        by_type = {"document": [], "vsl_analysis": [], "ad_analysis": [], "manual_note": []}
        for m in memory:
            by_type.setdefault(m.get("type", "manual_note"), []).append(m)

        type_dirs = {
            "document":      ("Documentos",      "Documentos enviados manualmente"),
            "vsl_analysis":  ("Análises VSL",    "Análises RMBC de VSLs"),
            "ad_analysis":   ("Análises Ads",    "Engenharia reversa de anúncios"),
            "manual_note":   ("Notas",           "Notas manuais"),
        }

        for tkey, items in by_type.items():
            if not items:
                continue
            folder, desc = type_dirs.get(tkey, ("Outros", ""))
            readme.append(f"### {folder} ({len(items)})")
            readme.append(f"_{desc}_\n")
            for m in items:
                title = (m.get("metadata") or {}).get("title", "Sem título")
                fname = f"{_safe_filename(title)}.md"
                fm = _md_frontmatter(
                    tipo=tkey,
                    criado_em=m.get("created_at", "")[:10],
                    fonte=(m.get("metadata") or {}).get("filename") or "",
                    tags=[tkey, "tikcopy"],
                )
                content = fm + f"# {title}\n\n" + (m.get("content") or "")
                zf.writestr(f"{root}/{folder}/{fname}", content)
                readme.append(f"- [[{folder}/{Path(fname).stem}]]")
            readme.append("")

        # ── Briefings ──
        if briefs:
            readme.append(f"### Briefings ({len(briefs)})\n")
            for b in briefs:
                title = b.get("title") or "Briefing sem título"
                fname = f"{_safe_filename(title)}.md"
                fm = _md_frontmatter(tipo="briefing", criado_em=b.get("created_at", "")[:10], tags=["briefing", "tikcopy"])
                body = [fm, f"# {title}\n"]
                for k in ("angle", "new_idea", "avatar", "format", "editing_style", "organic_ref_url"):
                    v = b.get(k)
                    if v:
                        body.append(f"## {k.replace('_', ' ').title()}\n\n{v}\n")
                zf.writestr(f"{root}/Briefings/{fname}", "\n".join(body))
                readme.append(f"- [[Briefings/{Path(fname).stem}]]")
            readme.append("")

        # ── Pesquisas ──
        if research:
            readme.append(f"### Pesquisas ({len(research)})\n")
            for r in research:
                title = r.get("title") or "Pesquisa sem título"
                fname = f"{_safe_filename(title)}.md"
                fm = _md_frontmatter(tipo="pesquisa", criado_em=r.get("created_at", "")[:10], tags=["pesquisa", "tikcopy"])
                body = [fm, f"# {title}\n"]
                for k in ("market", "chiclete_name", "problem_mechanism", "solution_mechanism", "vsl_avatar", "vsl_format"):
                    v = r.get(k)
                    if v:
                        body.append(f"## {k.replace('_', ' ').title()}\n\n{v}\n")
                for k in ("main_pains", "main_desires", "slang", "validated_angles", "validated_formats"):
                    v = r.get(k)
                    if v and isinstance(v, list):
                        body.append(f"## {k.replace('_', ' ').title()}\n\n" + "\n".join(f"- {x}" for x in v) + "\n")
                zf.writestr(f"{root}/Pesquisas/{fname}", "\n".join(body))
                readme.append(f"- [[Pesquisas/{Path(fname).stem}]]")
            readme.append("")

        # ── Hooks consolidados (de drafts + swipes com tag hook) ──
        hooks = []
        for d in drafts:
            fields = d.get("fields_data") or {}
            if fields.get("source_type") == "hook" and fields.get("content"):
                hooks.append((d.get("title") or "Hook", fields["content"]))
        for s in swipes:
            if s.get("tag") == "hook" and s.get("content"):
                try:
                    import json as _json
                    parsed = _json.loads(s["content"])
                    if parsed.get("hook"):
                        hooks.append((parsed.get("title") or "Hook", parsed["hook"]))
                except Exception:
                    pass

        if hooks:
            lines = [_md_frontmatter(tipo="hooks", tags=["hooks", "tikcopy"]), "# Hooks\n"]
            for title, content in hooks:
                lines.append(f"## {title}\n\n{content}\n\n---\n")
            zf.writestr(f"{root}/Hooks.md", "".join(lines))
            readme.append(f"### Hooks ({len(hooks)})\n- [[Hooks]]\n")

        # ── Swipes por tag ──
        if swipes:
            by_tag = {}
            for s in swipes:
                by_tag.setdefault(s.get("tag") or "outros", []).append(s)
            readme.append(f"### Swipes ({len(swipes)})\n")
            for tag, items in by_tag.items():
                lines = [_md_frontmatter(tipo=f"swipe-{tag}", tags=[tag, "swipe", "tikcopy"]), f"# Swipes — {tag}\n\n"]
                for s in items:
                    lines.append("---\n\n")
                    if s.get("source"):
                        lines.append(f"**Fonte:** {s['source']}\n\n")
                    lines.append(f"{s.get('content', '')}\n\n")
                fname = f"{_safe_filename(tag)}.md"
                zf.writestr(f"{root}/Swipes/{fname}", "".join(lines))
                readme.append(f"- [[Swipes/{Path(fname).stem}]] ({len(items)})")
            readme.append("")

        # ── Transcrições (orgânico, ads, vsl, lessons) ──
        if transcripts:
            readme.append(f"### Transcrições ({len(transcripts)})\n")
            for t in transcripts:
                title = t.get("title") or "Sem título"
                ttype = t.get("type") or "transcript"
                fname = f"{_safe_filename(title)}.md"
                fm = _md_frontmatter(
                    tipo=f"transcript-{ttype}",
                    criado_em=t.get("created_at", "")[:10],
                    fonte=t.get("source_url") or t.get("source_filename") or "",
                    nicho=t.get("niche") or "",
                    tags=[ttype, "transcript", "tikcopy"],
                )
                body = [fm, f"# {title}\n"]
                for k, label in [("hook", "Hook"), ("body", "Corpo")]:
                    if t.get(k):
                        body.append(f"## {label}\n\n{t[k]}\n")
                if t.get("transcript_full"):
                    body.append(f"## Transcrição completa\n\n{t['transcript_full']}\n")
                zf.writestr(f"{root}/Transcrições/{fname}", "\n".join(body))
                readme.append(f"- [[Transcrições/{Path(fname).stem}]] _{ttype}_")
            readme.append("")

        # ── README ──
        zf.writestr(f"{root}/README.md", "\n".join(readme))

    buf.seek(0)
    filename = f"{_safe_filename(project_name)}-tikcopy-{datetime.now().strftime('%Y%m%d')}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch("/{project_id}/documents/{memory_id}/toggle")
async def toggle_document(
    project_id: str,
    memory_id: str,
    body: dict = Body(...),
    current_user=Depends(get_current_user),
):
    """Ativa/desativa uma entrada (sem deletar) — controla se entra no contexto da IA."""
    sb = get_supabase()
    _check_project_ownership(sb, project_id, current_user.id)
    active = bool(body.get("active", True))
    sb.table("project_memory").update({"active": active}).eq("id", memory_id).execute()
    return {"ok": True, "active": active}
