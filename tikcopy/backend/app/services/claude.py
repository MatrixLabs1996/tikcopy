import re
import json
import anthropic


def format_organic(transcript: str) -> dict:
    """Split transcript into hook, landing_phrase, body using Claude Haiku."""
    client = anthropic.Anthropic()
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1000,
        messages=[{"role": "user", "content": (
            "Você é especialista em copywriting para redes sociais.\n"
            "Dado o transcript de um vídeo, separe em 3 partes:\n\n"
            "- HOOK: frase(s) iniciais que param o scroll e prendem a atenção (max 2 frases)\n"
            "- FRASE_ATERRISSAGEM: contexto logo após o hook — ideia central que abre o loop "
            "e conecta o hook ao restante. 2-4 frases. Explica O QUE o vídeo vai entregar.\n"
            "- CORPO: restante do conteúdo desenvolvido de forma clara\n\n"
            f"Transcript:\n{transcript}\n\n"
            "Responda SOMENTE em JSON válido, sem texto antes ou depois:\n"
            '{"hook": "...", "frase_aterrissagem": "...", "corpo": "..."}'
        )}],
    )

    raw = resp.content[0].text.strip()
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        data = json.loads(match.group())
        return {
            "hook": data.get("hook", ""),
            "landing_phrase": data.get("frase_aterrissagem", ""),
            "body": data.get("corpo", ""),
        }

    sentences = re.split(r'(?<=[.!?])\s+', transcript.strip())
    return {
        "hook": " ".join(sentences[:2]) if len(sentences) >= 2 else transcript[:200],
        "landing_phrase": " ".join(sentences[2:5]) if len(sentences) > 4 else "",
        "body": " ".join(sentences[2:]) if len(sentences) > 2 else transcript,
    }


def extract_briefing_fields(raw_content: str) -> dict:
    """Extract structured briefing fields from unstructured text using Claude."""
    client = anthropic.Anthropic()
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2000,
        messages=[{"role": "user", "content": (
            "Extraia os campos de um briefing de copy a partir do texto abaixo.\n"
            "Retorne SOMENTE JSON válido:\n"
            '{"title": "...", "angle": "...", "new_idea": "...", "avatar": "...", '
            '"format": "...", "editing_style": "...", "organic_ref_url": "..."}\n\n'
            f"Texto:\n{raw_content}"
        )}],
    )
    raw = resp.content[0].text.strip()
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        return json.loads(match.group())
    return {"title": "Briefing importado", "angle": raw_content[:500]}


def extract_research_fields(raw_content: str) -> dict:
    """Extract structured research fields from unstructured text using Claude."""
    client = anthropic.Anthropic()
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=3000,
        messages=[{"role": "user", "content": (
            "Extraia os campos de uma pesquisa de oferta a partir do texto abaixo.\n"
            "Retorne SOMENTE JSON válido com os campos: title, market, chiclete_name, "
            "problem_mechanism, solution_mechanism, vsl_avatar, vsl_format, "
            "main_pains (array), main_desires (array), slang (array), "
            "validated_angles (array), validated_formats (array).\n\n"
            f"Texto:\n{raw_content}"
        )}],
    )
    raw = resp.content[0].text.strip()
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        return json.loads(match.group())
    return {"title": "Pesquisa importada"}


def suggest_copy_field(field_name: str, field_label: str, context: dict) -> str:
    """Suggest content for a copy draft field using Claude."""
    client = anthropic.Anthropic()
    ctx_str = json.dumps(context, ensure_ascii=False, indent=2)
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=500,
        messages=[{"role": "user", "content": (
            f"Você é copywriter especialista. Sugira conteúdo para o campo '{field_label}' "
            f"de um rascunho de copy.\n\nContexto do rascunho:\n{ctx_str}\n\n"
            f"Escreva apenas o conteúdo do campo '{field_label}', sem explicações."
        )}],
    )
    return resp.content[0].text.strip()


def copy_zone_chat(message: str, project_memory: list, active_context: dict) -> str:
    """Answer a copy question using project memory as context."""
    client = anthropic.Anthropic()
    memory_str = "\n".join([f"- [{m['type']}] {m['content']}" for m in project_memory])
    context_str = json.dumps(active_context, ensure_ascii=False, indent=2)
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1500,
        system=(
            "Você é um assistente de copywriting especializado. "
            "Use a memória do projeto e o contexto fornecido para dar respostas precisas e acionáveis.\n\n"
            f"MEMÓRIA DO PROJETO:\n{memory_str}\n\n"
            f"CONTEXTO ATIVO:\n{context_str}"
        ),
        messages=[{"role": "user", "content": message}],
    )
    return resp.content[0].text.strip()
