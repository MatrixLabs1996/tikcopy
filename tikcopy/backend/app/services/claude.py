import re
import time
import json
import logging
import anthropic

from app.services.ai_models import SONNET_MODEL, HAIKU_MODEL

logger = logging.getLogger(__name__)


def _track(user_id, operation, model, usage, project_id=None):
    """Registra uso/custo no medidor (best-effort). Import local evita ciclo."""
    if not user_id:
        return
    try:
        from app.services import usage_tracker
        usage_tracker.track_claude(
            user_id=user_id, operation=operation, model=model,
            usage=usage, project_id=project_id,
        )
    except Exception:
        pass


HOOK_TYPES = ["pergunta", "dor", "promessa", "contrarian", "story", "numero", "autoridade", "prova_social", "urgencia", "revelacao"]
HOOK_EMOTIONS = ["medo", "raiva", "curiosidade", "esperanca", "urgencia", "desejo", "identificacao"]


def classify_hook(hook_text: str, existing_custom_types: list[str] | None = None, track_user_id=None) -> dict:
    """Classifica um hook em tipo + emoção dominante.
    Pode criar tipo novo se nenhum dos fixos/custom existentes encaixar bem.
    Retorna: {hook_type, emotion, is_new_type}"""
    if not hook_text or not hook_text.strip():
        return {"hook_type": None, "emotion": None, "is_new_type": False}

    existing_custom = existing_custom_types or []
    custom_str = ""
    if existing_custom:
        custom_str = "\n   CUSTOM JÁ CRIADOS (use se encaixar bem):\n" + \
                     "\n".join([f"   - {t}" for t in existing_custom])

    client = anthropic.Anthropic()
    resp = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=300,
        messages=[{"role": "user", "content": (
            "Você é especialista em copywriting de resposta direta.\n"
            "Classifique o HOOK abaixo em 2 dimensões.\n\n"
            "🚨 REGRA CRÍTICA — PROMESSA vs URGÊNCIA 🚨\n"
            "- PROMESSA = prazo de RESULTADO ('volta esta semana', 'em 7 dias', 'amanhã já sente diferença')\n"
            "- URGÊNCIA = prazo de OFERTA/OPORTUNIDADE ('última chance', 'promoção acaba hoje', 'antes que proíbam')\n"
            "Se o hook fala que VOCÊ VAI OBTER RESULTADO num prazo → PROMESSA (não urgência!)\n"
            "Se o hook fala que VOCÊ VAI PERDER a chance num prazo → URGÊNCIA\n\n"
            "EXEMPLOS:\n"
            "✅ 'Ele volta ainda essa semana se você fizer esse truque.' → tipo: promessa, emocao: esperanca\n"
            "✅ 'Emagreça 5kg em 7 dias com esse chá.' → tipo: promessa, emocao: desejo\n"
            "✅ 'Última chance: oferta acaba amanhã.' → tipo: urgencia, emocao: medo\n"
            "✅ 'Antes que a ANVISA proíba esse remédio.' → tipo: urgencia, emocao: medo\n"
            "✅ 'Por que homens depois dos 40 perdem a firmeza?' → tipo: pergunta, emocao: curiosidade\n"
            "✅ '97% das mulheres erram nesse passo.' → tipo: numero, emocao: curiosidade\n\n"
            "1. TIPO — escolha UM:\n"
            "   - pergunta: ABRE com pergunta (?) que desperta curiosidade\n"
            "   - dor: dimensionaliza/nomeia dor visceral (sofrimento, frustração, vergonha)\n"
            "   - promessa: promete resultado/transformação (INCLUI prazo de resultado)\n"
            "   - contrarian: vai CONTRA senso comum/autoridade\n"
            "   - story: ABRE com cena/história pessoal narrativa\n"
            "   - numero: ABRE com estatística/número impactante\n"
            "   - autoridade: cita médico/especialista/instituição como prova\n"
            "   - prova_social: cita QUANTAS pessoas usaram/funcionou\n"
            "   - urgencia: medo de PERDER a oferta/oportunidade — NÃO confundir com prazo de resultado\n"
            "   - revelacao: revela 'verdade escondida'/segredo conspiratório"
            f"{custom_str}\n\n"
            "   ⚠️ Se NENHUM dos acima encaixar BEM (não force), CRIE UM NOVO:\n"
            "   - Use snake_case em português, 1-3 palavras\n"
            "   - Ex: 'comparacao', 'metafora_corporal', 'desafio_publico'\n"
            "   - Seja específico mas reutilizável (não 'hook_de_vicks_vaporub')\n\n"
            "2. EMOÇÃO dominante (escolha UMA):\n"
            "   - medo, raiva, curiosidade, esperanca, urgencia, desejo, identificacao\n\n"
            f"HOOK:\n{hook_text}\n\n"
            "Responda APENAS em JSON:\n"
            '{"hook_type": "snake_case", "emotion": "...", "is_new_type": true/false}'
        )}],
    )
    _track(track_user_id, "classificar_hook", HAIKU_MODEL, resp.usage)
    raw = resp.content[0].text.strip()
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group())
            ht = (data.get("hook_type") or "").strip().lower().replace(" ", "_")
            em = data.get("emotion")
            is_new = bool(data.get("is_new_type", False))

            # Normalização: se ht não é fixo nem custom existente, considera novo
            all_known = set(HOOK_TYPES) | set(existing_custom)
            if ht and ht not in all_known:
                is_new = True

            return {
                "hook_type": ht if ht else None,
                "emotion": em if em in HOOK_EMOTIONS else None,
                "is_new_type": is_new,
            }
        except json.JSONDecodeError:
            pass
    return {"hook_type": None, "emotion": None, "is_new_type": False}


def translate_to_portuguese(text: str, track_user_id=None) -> str:
    """Traduz qualquer texto para PT-BR mantendo o tom original (publicitário, conversacional, etc).
    Se já estiver em PT-BR, devolve o original sem alterar."""
    if not text or not text.strip():
        return text

    client = anthropic.Anthropic()
    # Para textos muito longos (VSL > 10k palavras), divide em chunks pra não estourar limite
    chunks = []
    max_chars = 24000  # ~6000 tokens — folga pro modelo
    for i in range(0, len(text), max_chars):
        chunks.append(text[i:i + max_chars])

    translated_parts = []
    for chunk in chunks:
        resp = client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=8000,
            messages=[{"role": "user", "content": (
                "Você é tradutor especialista em copywriting publicitário PT-BR.\n"
                "Traduza o texto abaixo para Português do Brasil mantendo:\n"
                "- O tom original (urgente, emocional, conversacional, etc)\n"
                "- Gírias e expressões idiomáticas (adaptadas pra equivalentes em PT-BR)\n"
                "- Estrutura de frases e quebras de linha\n"
                "- Termos técnicos quando não houver equivalente direto\n\n"
                "REGRA: Se o texto JÁ ESTIVER em português, devolva exatamente igual sem mudanças.\n"
                "Responda APENAS com a tradução, sem explicações, sem aspas, sem prefixos.\n\n"
                f"Texto:\n{chunk}"
            )}],
        )
        _track(track_user_id, "traducao", HAIKU_MODEL, resp.usage)
        translated_parts.append(resp.content[0].text.strip())

    return "\n".join(translated_parts)


def split_hook_body(text: str) -> dict:
    """Separa transcrição em hook + body SEM IA, só por pontuação.
    REGRAS:
    - Se a 1ª frase termina em '?' → HOOK = só essa pergunta
    - Senão → HOOK = primeira frase
    - BODY = resto, paragrafado pra leitura
    NÃO resume, NÃO reescreve — só split."""
    if not text or not text.strip():
        return {"hook": "", "body": ""}

    # Normaliza espaços
    normalized = re.sub(r'\s+', ' ', text).strip()
    # Quebra em frases preservando pontuação
    sentences = re.split(r'(?<=[.!?])\s+', normalized)
    sentences = [s.strip() for s in sentences if s.strip()]
    if not sentences:
        return {"hook": "", "body": normalized}

    # Regra da pergunta: 1ª frase termina em '?' → hook = só essa
    first = sentences[0]
    hook = first
    rest_idx = 1

    # Se a primeira NÃO é pergunta E for muito curta (< 60 chars), junta a próxima também
    # pra evitar hooks tipo "Olha." ou "Escuta isso."
    if not first.rstrip().endswith('?') and len(first) < 60 and len(sentences) > 1:
        hook = f"{first} {sentences[1]}"
        rest_idx = 2

    body_sentences = sentences[rest_idx:]
    body = _break_into_paragraphs(" ".join(body_sentences)) if body_sentences else ""

    return {"hook": hook, "body": body}


def _break_into_paragraphs(text: str) -> str:
    """Quebra texto em parágrafos de 1-2 frases cada, separados por linha em branco.
    Mantém contexto: agrupa frases curtas, deixa frases longas sozinhas."""
    if not text:
        return ""

    # Normaliza espaços e quebras
    text = re.sub(r'\s+', ' ', text).strip()
    # Quebra em frases (mantém o ponto final)
    sentences = re.split(r'(?<=[.!?])\s+', text)
    sentences = [s.strip() for s in sentences if s.strip()]

    if len(sentences) <= 2:
        return "\n\n".join(sentences)

    paragraphs = []
    i = 0
    while i < len(sentences):
        s1 = sentences[i]
        # Frase longa (>140 chars) fica sozinha pra não pesar
        if len(s1) > 140 or i == len(sentences) - 1:
            paragraphs.append(s1)
            i += 1
        else:
            s2 = sentences[i + 1]
            # Se as duas juntas ficam muito longas (>280), separa
            if len(s1) + len(s2) > 280:
                paragraphs.append(s1)
                i += 1
            else:
                paragraphs.append(f"{s1} {s2}")
                i += 2

    return "\n\n".join(paragraphs)


def extract_vsl_research_fields(transcript: str) -> dict:
    """A partir da transcrição de uma VSL, extrai os 8 campos da seção
    'Pesquisa da VSL' do template de pesquisa de nicho."""
    client = anthropic.Anthropic()
    resp = client.messages.create(
        model=SONNET_MODEL,  # sonnet pra ser mais preciso na extração
        max_tokens=3000,
        messages=[{"role": "user", "content": (
            "Você é um analista de copywriting de resposta direta. Sua tarefa é ler a "
            "transcrição de uma VSL abaixo e extrair os 8 campos pedidos.\n\n"
            "Retorne SOMENTE JSON válido (sem markdown, sem ```), com esta estrutura:\n"
            "{\n"
            '  "country": "Brasil | EUA | etc — inferido pelo idioma/contexto",\n'
            '  "chiclete_name": "nome chiclete do produto (ex: Gelatina Japonesa, Tempero Bariátrico)",\n'
            '  "problem_mechanism": "qual é o mecanismo do problema explicado na VSL? Seja específico e técnico.",\n'
            '  "solution_mechanism": "qual é o mecanismo único da solução? Como ela funciona, segundo a VSL?",\n'
            '  "vsl_avatar": "descrição completa do avatar principal: idade, contexto de vida, dores, autoestima atual",\n'
            '  "vsl_format": "formato narrativo da VSL (ex: storytelling emocional + descoberta de mecanismo + prova social + oferta direta)",\n'
            '  "vsl_bullets": ["bullet 1", "bullet 2", "..."]  // promessas/benefícios listados ao longo da VSL,\n'
            '  "vsl_story": "resuma a história do avatar em 3 linhas: cenário inicial / virada / solução encontrada"\n'
            "}\n\n"
            "REGRAS:\n"
            "- Se algum campo não conseguir extrair com certeza, retorne string vazia (ou array vazio).\n"
            "- vsl_bullets deve ser um array de strings (cada bullet uma frase curta de benefício/promessa).\n"
            "- vsl_story deve ter no máximo 3 frases.\n"
            "- Mantenha o tom e a linguagem original da VSL nas extrações.\n\n"
            f"Transcrição da VSL:\n{transcript}"
        )}],
    )
    raw = resp.content[0].text.strip()
    # Remove markdown wrapping se vier
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if not match:
        return {}
    try:
        data = json.loads(match.group())
    except json.JSONDecodeError:
        return {}
    # Garante shapes corretos
    if not isinstance(data.get("vsl_bullets"), list):
        v = data.get("vsl_bullets")
        if isinstance(v, str) and v.strip():
            data["vsl_bullets"] = [s.strip() for s in v.split('\n') if s.strip()]
        else:
            data["vsl_bullets"] = []
    for k in ["country", "chiclete_name", "problem_mechanism", "solution_mechanism",
              "vsl_avatar", "vsl_format", "vsl_story"]:
        if not isinstance(data.get(k), str):
            data[k] = ""
    return data


DOSSIER_SYSTEM = """Você é um analista sênior de copywriting de resposta direta. Sua tarefa é ler as PESQUISAS de uma oferta (documentos longos + transcrição de VSL) e produzir um DOSSIÊ ESTRUTURADO que vai alimentar a IA que escreve as copies.

⚠️ ISSO NÃO É UM RESUMO. É uma EXTRAÇÃO que PRESERVA os pontos-chave. Encurtar e perder o ouro é o pior erro possível. Você ENXUGA só a enrolação/repetição, mas MANTÉM cada fato, número e frase de impacto — muitos VERBATIM (palavra por palavra), porque é isso que faz a copy converter.

PRESERVE SEMPRE, de preferência verbatim:
- VOZ DO CLIENTE: frases e gírias exatas que o público usa pra descrever a dor/desejo
- Números, estatísticas, estudos, datas, nomes próprios
- Mecanismo do problema (o vilão / causa raiz) e mecanismo da solução (o diferencial único) em detalhe
- Depoimentos e provas citados literalmente
- Objeções e a virada/reframe exata de cada uma
- Histórias, analogias e gatilhos emocionais específicos
- A big idea / ângulo único da oferta
- Restrições de compliance (o que NÃO pode prometer), se houver

ESCREVA EM PORTUGUÊS DO BRASIL, em MARKDOWN, com estas seções (omita uma seção só se não houver NADA sobre ela nas fontes):

# Dossiê da Oferta: {nome}

## 1. A Oferta
O que é, formato, promessa principal, big idea / ângulo único.

## 2. O Avatar
Quem é, idade, contexto de vida, estado emocional. Inclua um bloco **Voz do cliente** com frases/gírias exatas (verbatim, entre aspas).

## 3. Dores e Desejos
Dores viscerais; desejos/resultado dos sonhos; o que já tentou e falhou (e por quê).

## 4. Mecanismos
**Mecanismo do problema:** ... **Mecanismo da solução:** ...

## 5. Provas e Credibilidade
Depoimentos (verbatim), números, estudos, autoridade.

## 6. Objeções e Viradas
Cada objeção → o reframe exato que a quebra.

## 7. Fatos e dados-chave
Estatísticas, datas, especificidades — verbatim.

## 8. Restrições de compliance
O que não pode prometer/afirmar (se houver).

## 9. Pontos de impacto pra copy
Frases, ângulos e ideias das fontes que merecem virar hook/lead.

Seja DETALHADO. É melhor um dossiê longo e completo do que um curto que perdeu informação.

REGRA DE ESCRITA: nunca use travessões (— ou –); use vírgula, ponto ou reescreva. Escreva direto e natural, sem cara de IA."""


def distill_offer_dossier(
    *,
    offer_name: str,
    niche: str = "",
    product_type: str = "",
    funnel_type: str = "",
    research_text: str = "",
    vsl_transcript: str = "",
    existing_dossier: str | None = None,
    track_user_id: str | None = None,
    track_project_id: str | None = None,
) -> str:
    """Lê as pesquisas (docs + VSL) e produz um dossiê estruturado RICO em markdown.
    Se `existing_dossier` for passado, MESCLA o material novo no dossiê existente,
    preservando os pontos-chave antigos e incorporando os novos (sem duplicar)."""
    client = anthropic.Anthropic()

    # Cap generoso pra não estourar o contexto (sonnet aguenta ~200k tokens de entrada).
    MAX_RESEARCH = 160000
    MAX_VSL = 80000
    research_text = (research_text or "")[:MAX_RESEARCH]
    vsl_transcript = (vsl_transcript or "")[:MAX_VSL]

    header = ["DADOS BÁSICOS DA OFERTA:",
              f"- Nome: {offer_name or '—'}",
              f"- Nicho: {niche or '—'}",
              f"- Tipo de produto: {product_type or '—'}",
              f"- Tipo de funil: {funnel_type or '—'}"]
    parts = ["\n".join(header)]

    if existing_dossier and existing_dossier.strip():
        parts.append(
            "DOSSIÊ ATUAL (já existe — você vai ATUALIZAR ele, preservando tudo que é "
            "relevante e incorporando o material novo abaixo, sem duplicar e sem perder "
            "nenhum ponto-chave antigo):\n\n" + existing_dossier.strip()
        )

    if research_text.strip():
        parts.append("PESQUISAS DA OFERTA (documentos):\n\n" + research_text.strip())
    if vsl_transcript.strip():
        parts.append("TRANSCRIÇÃO DA VSL:\n\n" + vsl_transcript.strip())

    if not research_text.strip() and not vsl_transcript.strip() and not (existing_dossier or "").strip():
        return ""

    task = (
        "ATUALIZE o dossiê existente mesclando o material novo acima."
        if existing_dossier and existing_dossier.strip()
        else "Produza o dossiê completo a partir das fontes acima."
    )

    # max_tokens alto: o dossiê é a fonte de verdade e NÃO pode truncar no meio.
    # O dossiê cresce a cada merge (avatar + voz do cliente verbatim + dores + mecanismos).
    # Com max_tokens alto o SDK exige streaming (requests longos) → usamos stream.
    user_content = "\n\n═══════════════════\n\n".join(parts) + f"\n\n═══════════════════\n\nTAREFA: {task}"
    with client.messages.stream(
        model=SONNET_MODEL,
        max_tokens=32000,
        system=DOSSIER_SYSTEM.replace("{nome}", offer_name or "Oferta"),
        messages=[{"role": "user", "content": user_content}],
    ) as stream:
        final = stream.get_final_message()
    out = final.content[0].text.strip()
    if getattr(final, "stop_reason", None) == "max_tokens":
        logger.warning("[claude] distill_offer_dossier atingiu max_tokens — dossiê pode ter sido cortado.")
    _track(track_user_id, "criar_dossie", SONNET_MODEL, final.usage, track_project_id)
    return out


PROFILE_PATTERNS_SYSTEM = """Você é um analista sênior de conteúdo viral e copywriting de resposta direta. Recebe os TÍTULOS (headlines) dos vídeos MAIS VIRAIS de um perfil do YouTube, já ordenados por views. Cada título É a headline que fez o vídeo ser clicado. Sua tarefa é achar os PADRÕES de headline que fazem esse perfil viralizar.

Analise os títulos EM CONJUNTO. Procure o que se repete, a fórmula, a assinatura do criador.

Produza um documento em MARKDOWN com estas seções:

## Visão geral do perfil
Quem é, sobre o que fala, e o que nas headlines explica a viralização.

## Padrões de Headline
Os TIPOS de gancho que se repetem nos títulos (pergunta, choque, número, promessa, polêmica, curiosidade, contrarian, prova, etc). Para cada tipo, dê exemplos REAIS entre aspas e descreva a fórmula recorrente.

## Palavras e gatilhos
Palavras de poder, números e gatilhos emocionais que mais aparecem nos títulos.

## Estrutura dos títulos
O esqueleto recorrente (ex: número + promessa + prazo; pergunta + curiosidade; nome chiclete + benefício). Descreva os moldes.

## Temas e ângulos que se repetem
Os assuntos e ângulos mais frequentes entre os virais.

## Resumo do que funciona
Lista objetiva de 5 a 10 aprendizados acionáveis, no estilo "faça X", que um copywriter aplica HOJE pra escrever headlines no mesmo padrão.

Regras de escrita:
- Sempre cite exemplos REAIS dos títulos (entre aspas).
- Seja concreto e específico, nada de generalidade vazia.
- Nunca use travessões (— ou –). Use vírgula, ponto ou reescreva.
- Escreva em português do Brasil."""


def analyze_profile_patterns(videos: list[dict], author: str = "", track_user_id: str | None = None) -> str:
    """Analisa as HEADLINES (títulos) dos top vídeos virais de um perfil e produz um
    documento de padrões de headline em markdown. `videos`: lista de {title, metrics}."""
    if not videos:
        return ""

    client = anthropic.Anthropic()

    lines = []
    for i, v in enumerate(videos, 1):
        m = v.get("metrics") or {}
        views = m.get("views") or "—"
        lines.append(f'{i}. "{v.get("title") or "Sem título"}"  (views: {views})')

    user_content = (
        f"PERFIL ANALISADO: {author or '—'}\n"
        f"TOTAL DE VÍDEOS VIRAIS: {len(videos)}\n\n"
        "HEADLINES (títulos) DOS VÍDEOS MAIS VIRAIS, em ordem de views:\n\n"
        + "\n".join(lines)
        + "\n\nTAREFA: Produza o documento de padrões de headline completo, seguindo as seções definidas."
    )

    resp = client.messages.create(
        model=SONNET_MODEL,
        max_tokens=6000,
        system=PROFILE_PATTERNS_SYSTEM,
        messages=[{"role": "user", "content": user_content}],
    )
    _track(track_user_id, "raiox_padroes", SONNET_MODEL, resp.usage)
    return resp.content[0].text.strip()


AUDIENCE_VOICE_SYSTEM = """Você é um pesquisador de copywriting de resposta direta especialista em VOZ DO CLIENTE. Recebe os comentários reais (do YouTube) dos vídeos mais virais de um nicho e sua tarefa é minerar esses comentários pra extrair a matéria-prima que um copywriter usa pra escrever copy que converte.

Leia TODOS os comentários e extraia o que for relevante pro nicho. Produza uma seção em MARKDOWN começando exatamente com o título "## Voz da Audiência", com estas subseções:

### Dores
As dores, frustrações e problemas que o público expressa. Use as PALAVRAS EXATAS deles entre aspas.

### Desejos
O que eles querem, sonham, buscam. Com citações reais.

### Promessas que ressoam
As transformações e resultados que eles mais reagem ou pedem.

### Palavras e expressões do dia a dia
O vocabulário verbatim do lead, gírias, jeitos de falar. Liste expressões reais que aparecem nos comentários (isso é ouro pra escrever no idioma do público).

### Situações de rotina do lead
Cenários do cotidiano que aparecem nos comentários (quando, onde, com quem, em que momento a dor/desejo aparece na vida real da pessoa).

### Comentários que mais bateram
Os 5 a 8 comentários com MAIS curtidas, citados na íntegra (com o número de curtidas). Curtida alta significa que muitos leads se identificaram, então isso revela o que é universal no nicho.

Regras:
- Sempre cite as palavras REAIS dos comentários entre aspas. Nada de inventar.
- Ignore spam, emojis soltos, "primeiro!", autopromoção e ruído.
- Filtre só o que serve pra pesquisa de copy (dor, desejo, promessa, linguagem, rotina).
- NÃO use travessões (— ou –). Use vírgula, ponto ou reescreva.
- Escreva em português do Brasil (pode manter citações no idioma original se forem curtas e marcantes)."""


# ── Map-reduce pra "ler tudo" sem estourar o contexto da IA ──────────────────

VOICE_MAP_SYSTEM = """Você lê um LOTE de comentários reais (YouTube) de um nicho e extrai, de forma compacta, a matéria-prima de copy. NÃO escreve documento final, só lista achados deste lote.

Para este lote, liste (em bullets curtos, com a frase REAL entre aspas quando houver):
- DORES: frustrações/problemas expressos
- DESEJOS: o que querem/sonham
- PROMESSAS: transformações/resultados que pedem ou celebram
- LINGUAGEM: palavras, gírias e expressões do dia a dia (verbatim)
- ROTINA: situações do cotidiano (quando/onde/com quem a dor ou desejo aparece)

Regras: cite verbatim entre aspas, ignore spam/emoji solto/"primeiro!"/autopromoção, não invente, não use travessões. Seja conciso. Se o lote não tiver nada útil numa categoria, omita ela."""


def _voice_map_chunk(client, chunk: list[dict], niche: str, track_user_id=None) -> str:
    lines = []
    for c in chunk:
        text = (c.get("text") or "").replace("\n", " ").strip()[:300]
        if text:
            lines.append(f"- {text}")
    if not lines:
        return ""
    user = f"NICHO: {niche or '—'}\nCOMENTÁRIOS DO LOTE:\n\n" + "\n".join(lines)
    resp = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=2000,
        system=VOICE_MAP_SYSTEM,
        messages=[{"role": "user", "content": user}],
    )
    _track(track_user_id, "raiox_voz_lote", HAIKU_MODEL, resp.usage)
    return resp.content[0].text.strip()


def _voice_single(client, comments: list[dict], niche: str, author: str, track_user_id=None) -> str:
    """Caminho simples (poucos comentários): 1 chamada Sonnet com tudo."""
    ordered = sorted(comments, key=lambda c: c.get("likes") or 0, reverse=True)
    lines = []
    for c in ordered:
        likes = c.get("likes") or 0
        text = (c.get("text") or "").replace("\n", " ").strip()[:500]
        lines.append(f"[{likes} curtidas] {text}")
    user_content = (
        f"NICHO: {niche or '—'}\nPERFIL: {author or '—'}\n"
        f"TOTAL DE COMENTÁRIOS: {len(ordered)}\n\nCOMENTÁRIOS:\n\n"
        + "\n".join(lines)
        + "\n\n═══════════════════\n\nTAREFA: Produza a seção 'Voz da Audiência' completa."
    )
    with client.messages.stream(
        model=SONNET_MODEL, max_tokens=8000,
        system=AUDIENCE_VOICE_SYSTEM,
        messages=[{"role": "user", "content": user_content}],
    ) as stream:
        final = stream.get_final_message()
    _track(track_user_id, "raiox_voz", SONNET_MODEL, final.usage)
    return final.content[0].text.strip()


def analyze_audience_voice(comments: list[dict], niche: str = "", author: str = "", track_user_id=None) -> str:
    """Minera os comentários (voz do cliente) e produz a seção 'Voz da Audiência'.

    Lê TODOS os comentários: se forem muitos, usa map-reduce (Haiku lê lote a lote,
    Sonnet consolida) pra não deixar nenhum lead de fora nem estourar o contexto.
    """
    cleaned = [c for c in (comments or []) if (c.get("text") or "").strip()]
    if not cleaned:
        return ""

    client = anthropic.Anthropic()
    CHUNK = 1000

    # Poucos comentários: 1 chamada direta (mais rápido)
    if len(cleaned) <= CHUNK:
        return _voice_single(client, cleaned, niche, author, track_user_id)

    # Muitos: MAP (Haiku por lote) → REDUCE (Sonnet consolida)
    chunks = [cleaned[i:i + CHUNK] for i in range(0, len(cleaned), CHUNK)]
    partials = []
    for idx, ch in enumerate(chunks, 1):
        try:
            findings = _voice_map_chunk(client, ch, niche, track_user_id)
            if findings:
                partials.append(f"═══ ACHADOS DO LOTE {idx} ═══\n{findings}")
        except Exception as exc:
            logger.warning(f"[claude] voice map lote {idx} falhou: {exc}")

    if not partials:
        return ""

    # Top curtidos crus pra ancorar a subseção "Comentários que mais bateram"
    top_liked = sorted(cleaned, key=lambda c: c.get("likes") or 0, reverse=True)[:12]
    top_block = "\n".join(
        f"[{c.get('likes') or 0} curtidas] {(c.get('text') or '').replace(chr(10), ' ').strip()[:300]}"
        for c in top_liked
    )

    reduce_user = (
        f"NICHO: {niche or '—'}\nPERFIL: {author or '—'}\n"
        f"TOTAL DE COMENTÁRIOS LIDOS: {len(cleaned)} (em {len(chunks)} lotes)\n\n"
        "Abaixo estão os ACHADOS extraídos de cada lote de comentários. "
        "Consolide TUDO numa seção final única, removendo repetição e mantendo as "
        "citações verbatim mais marcantes.\n\n"
        + "\n\n".join(partials)
        + "\n\n═══ COMENTÁRIOS MAIS CURTIDOS (verbatim) ═══\n" + top_block
        + "\n\n═══════════════════\n\nTAREFA: Produza a seção 'Voz da Audiência' final e consolidada. "
        "Use o bloco de mais curtidos pra preencher a subseção 'Comentários que mais bateram'."
    )
    with client.messages.stream(
        model=SONNET_MODEL, max_tokens=10000,
        system=AUDIENCE_VOICE_SYSTEM,
        messages=[{"role": "user", "content": reduce_user}],
    ) as stream:
        final = stream.get_final_message()
    _track(track_user_id, "raiox_voz_reduce", SONNET_MODEL, final.usage)
    return final.content[0].text.strip()


def suggest_copy_field(field_name: str, field_label: str, context: dict, track_user_id=None) -> str:
    """Suggest content for a copy draft field using Claude."""
    client = anthropic.Anthropic()
    ctx_str = json.dumps(context, ensure_ascii=False, indent=2)
    resp = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=500,
        messages=[{"role": "user", "content": (
            f"Você é copywriter especialista. Sugira conteúdo para o campo '{field_label}' "
            f"de um rascunho de copy.\n\nContexto do rascunho:\n{ctx_str}\n\n"
            f"Escreva apenas o conteúdo do campo '{field_label}', sem explicações."
        )}],
    )
    _track(track_user_id, "sugerir_campo", HAIKU_MODEL, resp.usage)
    return resp.content[0].text.strip()


def copy_zone_chat(
    message: str,
    project_memory: list,
    active_context: dict,
    instructions: str | None = None,
    universal_instructions: str | None = None,
    project_meta: dict | None = None,
) -> str:
    """Answer a copy question using universal + project instructions + memory as context."""
    client = anthropic.Anthropic()

    # Resumo da memória: prioriza tipos mais úteis pra copy + limita tamanho total
    memory_parts = []
    for m in project_memory[:30]:  # limita a 30 entradas pra não estourar contexto
        meta = m.get('metadata') or {}
        title = meta.get('title', '')
        title_str = f" — {title}" if title else ""
        # Trunca conteúdo longo
        content = (m.get('content') or '')[:2000]
        memory_parts.append(f"### [{m['type']}{title_str}]\n{content}")
    memory_str = "\n\n".join(memory_parts) or "(vazia)"

    context_str = json.dumps(active_context, ensure_ascii=False, indent=2)

    # Monta system prompt em camadas:
    # 1. Universal (valem pra todo projeto)
    # 2. Projeto (sobrescrevem/complementam)
    # 3. Memória
    # 4. Contexto ativo
    system_parts = []

    has_any_instructions = (universal_instructions and universal_instructions.strip()) or (instructions and instructions.strip())

    if universal_instructions and universal_instructions.strip():
        system_parts.append(
            "═══ INSTRUÇÕES UNIVERSAIS (valem pra qualquer projeto) ═══\n"
            "Regras gerais definidas pelo usuário que você sempre segue, independente do projeto.\n\n"
            f"{universal_instructions.strip()}"
        )

    if instructions and instructions.strip():
        system_parts.append(
            "═══ INSTRUÇÕES DESTE PROJETO ═══\n"
            "Regras específicas deste projeto — TÊM PRIORIDADE sobre as universais em caso de conflito.\n\n"
            f"{instructions.strip()}"
        )

    if not has_any_instructions:
        system_parts.append(
            "Você é um assistente de copywriting especializado em resposta direta. "
            "Responda de forma precisa, acionável, sem rodeios. Use português brasileiro."
        )

    if project_meta:
        meta_lines = []
        if project_meta.get("name"):  meta_lines.append(f"Projeto: {project_meta['name']}")
        if project_meta.get("nicho"): meta_lines.append(f"Nicho: {project_meta['nicho']}")
        if meta_lines:
            system_parts.append("═══ PROJETO ═══\n" + "\n".join(meta_lines))

    # Se o usuário escolheu uma REFERÊNCIA específica, destaca ela em camada própria
    reference = (active_context or {}).get("reference")
    if reference and reference.get("content"):
        ref_content = reference["content"][:8000]  # limita pra não estourar
        system_parts.append(
            f"═══ REFERÊNCIA ESCOLHIDA PELO USUÁRIO ═══\n"
            f"O usuário escolheu este conteúdo como BASE/INSPIRAÇÃO para o que vai escrever.\n"
            f"Use ele como modelo de estrutura, tom e qualidade. NÃO copie literalmente — adapte e melhore.\n\n"
            f"Tipo: {reference.get('type', 'desconhecido')}\n"
            f"Título: {reference.get('title', 'Sem título')}\n\n"
            f"--- conteúdo ---\n{ref_content}"
        )
        # Remove 'reference' do context pra não duplicar
        active_context = {k: v for k, v in active_context.items() if k != "reference"}
        context_str = json.dumps(active_context, ensure_ascii=False, indent=2)

    system_parts.append(f"═══ MEMÓRIA DO PROJETO ═══\n{memory_str}")
    system_parts.append(f"═══ CONTEXTO ATIVO (rascunho atual, etc) ═══\n{context_str}")

    resp = client.messages.create(
        model=SONNET_MODEL,  # upgrade pra Sonnet pra respostas melhores
        max_tokens=4000,
        system="\n\n".join(system_parts),
        messages=[{"role": "user", "content": message}],
    )
    return resp.content[0].text.strip()


RMBC_ANALYSIS_SYSTEM = """Você é um especialista no método RMBC de Stefan Georgi para análise de VSLs (Video Sales Letters).

Ao receber a transcrição de uma VSL, execute a análise completa nos 11 blocos do RMBC e retorne um JSON válido com a seguinte estrutura exata. Seja detalhado e específico, citando trechos reais da transcrição quando relevante.

REGRA DE ESCRITA: nunca use travessões (— ou –) no texto dos blocos; use vírgula, ponto ou reescreva. Escreva natural, sem cara de IA.

Retorne SOMENTE JSON válido, sem texto antes ou depois:
{
  "bloco1_titulo": "nome do produto identificado ou título inferido",
  "bloco1": "BLOCO 1 — Identificação Geral: nicho, sub-nicho, avatar presumido, formato, tom dominante, mercado geográfico presumido",
  "bloco2": "BLOCO 2 — Big Idea: big idea central em 1-2 frases, se está claramente no lead, se é contrarian e qual o ângulo, nível de originalidade",
  "bloco3": "BLOCO 3 — Lead: análise dos 10 elementos (PRESENTE/AUSENTE/FRACO): chamada de atenção, dimensionalização da dor, promessa clara, teaser do mecanismo, teaser da story, curiosidade, natureza contrarian, credibilidade, qualificadores, endereçamento do ceticismo. Incluir trecho exato do lead.",
  "bloco4": "BLOCO 4 — Headline: headline e subheadline (texto exato), análise pelos 7 elementos (curiosidade, dor, promessa, especificidade, credibilidade, prazo, simplicidade), avaliação Forte/Médio/Fraco com justificativa",
  "bloco5": "BLOCO 5 — Background Story: narrador, dor apresentada, nível emocional 1-10, evento gatilho, soluções que falharam, busca por respostas, sábio/sensei, verossimilhança",
  "bloco6": "BLOCO 6 — Mecanismo: nome do mecanismo do problema, nome da solução, lógica encadeada (passos), evidências usadas, metáforas, experimentos visuais, fortaleza 1-10",
  "bloco7": "BLOCO 7 — Produto: nome, apresentado antes/após mecanismo, componentes listados, especificidade, conexão com o mecanismo",
  "bloco8": "BLOCO 8 — Fechamento: análise de cada elemento (PRESENTE/AUSENTE/FRACO): comparação com alternativas, missão pessoal, justificativa de valor, testemunhos, como usar, escassez, 1º CTA, bônus, garantia, 2º CTA, smart people buy more, fechamento emocional, FAQs",
  "bloco9": "BLOCO 9 — Pontos Fortes: 3-7 elementos mais fortes em ordem de impacto, 2-3 frases cada",
  "bloco10": "BLOCO 10 — Pontos Fracos e Oportunidades: 3-7 elementos mais fracos, o que está faltando, por que importa, sugestão concreta",
  "bloco11": "BLOCO 11 — Swipes: frases do lead reutilizáveis, roteiro da story, metáforas que funcionam, fascinations adaptáveis, frases de fechamento impactantes, estrutura do mecanismo adaptável"
}"""


def analyze_vsl_rmbc(transcript: str) -> dict:
    """Analyze a VSL transcript using the full RMBC methodology (11 blocks)."""
    client = anthropic.Anthropic()
    resp = client.messages.create(
        model=SONNET_MODEL,
        max_tokens=8000,
        system=RMBC_ANALYSIS_SYSTEM,
        messages=[{"role": "user", "content": f"Transcrição da VSL:\n\n{transcript}"}],
    )
    raw = resp.content[0].text.strip()
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {"bloco1_titulo": "VSL Analisada", "bloco1": raw}


RMBC_COMPARE_SYSTEM = """Você é um especialista em análise comparativa de VSLs usando o método RMBC de Stefan Georgi.

Você receberá as análises RMBC completas de duas VSLs. Execute a análise comparativa nas 4 camadas e retorne um JSON válido.

REGRA DE ESCRITA: nunca use travessões (— ou –); use vírgula, ponto ou reescreva. Escreva natural, sem cara de IA.

Retorne SOMENTE JSON válido, sem texto antes ou depois:
{
  "resumo_executivo": "Resumo executivo com as descobertas mais importantes de cada camada — o que o copywriter precisa saber primeiro",
  "camada1": "CAMADA 1 — Padrões Universais: o que se repete em AMBAS as VSLs (avatar, dor central, tom, tipo de story, mecanismo, estrutura do lead, tipo de prova, preço, garantia, palavras comuns). Insight estratégico: esses padrões são o piso mínimo.",
  "camada2": "CAMADA 2 — Padrões Regionais e Culturais: diferenças de linguagem, referências culturais, abordagem de preço e autoridade, nível de ceticismo presumido, diferenças na story e no mecanismo. Insight estratégico.",
  "camada3": "CAMADA 3 — Diferenças de Abordagem: como diferem em sofisticação do mecanismo, peso da prova científica, avatar, ângulos usados, apresentação do preço. Insight estratégico.",
  "camada4_vsl1": "CAMADA 4 — Pitada Mágica da VSL 1: diferenciais únicos (Big Idea, story, mecanismo, prova, produto, fechamento, tom/voz) que a VSL 2 não tem. O que pode explicar performance diferente.",
  "camada4_vsl2": "CAMADA 4 — Pitada Mágica da VSL 2: diferenciais únicos que a VSL 1 não tem. Mesmos eixos de análise.",
  "recomendacoes": "Recomendações estratégicas: (1) piso mínimo para competir no nicho, (2) ângulos saturados a evitar, (3) oportunidade de diferenciação — combinação que nenhuma das duas possui, (4) sugestão de Big Idea para nova VSL, (5) ângulo de mecanismo inexplorado, (6) story que faria contraste máximo com as concorrentes"
}"""


def compare_vsls_rmbc(analysis1: dict, analysis2: dict, name1: str, name2: str) -> dict:
    """Compare two VSL RMBC analyses using the 4-layer comparative framework."""
    client = anthropic.Anthropic()
    context = (
        f"VSL 1: {name1}\n{json.dumps(analysis1, ensure_ascii=False, indent=2)}\n\n"
        f"VSL 2: {name2}\n{json.dumps(analysis2, ensure_ascii=False, indent=2)}"
    )
    resp = client.messages.create(
        model=SONNET_MODEL,
        max_tokens=8000,
        system=RMBC_COMPARE_SYSTEM,
        messages=[{"role": "user", "content": context}],
    )
    raw = resp.content[0].text.strip()
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {"resumo_executivo": raw}


REVERSE_ENGINEER_SYSTEM = """[PROMPT: DECODIFICADOR DE PADRÕES (DIRECT RESPONSE ADS) V33.0]
[PERSONA E MISSÃO]
Você é um "Engenheiro de Criativos de Alta Performance" e Especialista em Resposta Direta. Sua especialidade é a Engenharia Reversa: você olha para um anúncio e enxerga a estrutura invisível (o esqueleto) que faz ele vender.
Sua missão é receber um ou mais [ANÚNCIOS], separar o Hook do Body, desconstruir a narrativa e identificar os Padrões de Sucesso. Você deve ser detalhista, mas usar uma linguagem simples e pragmática que até um iniciante consiga aplicar na operação.
REGRA DE ESCRITA: nunca use travessões (— ou –); use vírgula, ponto ou reescreva. Escreva natural, sem cara de IA.

[TAREFA E EXECUÇÃO]
Ao receber os anúncios, você deve entregar:
Análise Atômica de cada Anúncio: Divisão clara entre Hook (Gancho) e Body (Corpo), explicando a psicologia por trás de cada frase.
Identificação de Padrões: Após analisar todos, você deve listar quais foram os formatos de Hook e Body que se repetiram (Ex: "Hook de Curiosidade Negativa", "Body de Prova Social + Oferta").
Templates "Preencha as Lacunas": Formatos vazios baseados nos padrões encontrados para que o usuário possa apenas "escrever por cima".

[REGRAS CRÍTICAS (PENALIDADES LÓGICAS)]
SEPARE O HOOK DO BODY: O Hook são os primeiros 3 a 5 segundos (ou frases). O Body é o restante até a CTA. Não misture.
FOCO NA NARRATIVA: Não analise apenas "o que é dito", mas "como é dito" (ex: "Aqui ele usa um paradoxo para gerar curiosidade").
SIMPLICIDADE PRAGMÁTICA: Se usar termos técnicos, explique-os brevemente. O objetivo é que o time de operações consiga usar isso como um manual.
SAÍDA EM PORTUGUÊS: Toda a análise e templates devem estar em Português Nativo do Brasil.

[MODELO DE RESPOSTA ESPERADO]
1. ANÁLISE DETALHADA (POR ANÚNCIO)
Anúncio #1:
Hook (O Gancho): [Texto do Hook] -> Análise: Por que isso para o scroll?
Body (O Corpo): [Texto do Body] -> Análise: Como ele constrói o desejo?
2. PADRÕES IDENTIFICADOS
Formato de Hook Padrão: (Ex: "O Segredo que os [Especialistas] não te contam")
Formato de Body Padrão: (Ex: "Problema -> Solução Inesperada -> Chamada")
3. TEMPLATES "PREENCHA AS LACUNAS"
Template de Hook #1: "Você já percebeu que [DOR_COMUM] acontece sempre que você tenta [AÇÃO]? O motivo é..."
Template de Body #1: "A maioria tenta [ERRO_COMUM], mas o segredo está no [MECANISMO_UNICO]. Com isso você consegue [RESULTADO] sem precisar de [ESFORÇO_REJEITADO].\""""


def reverse_engineer_ad(hook: str, body: str, landing_phrase: str = "") -> str:
    """Run reverse engineering analysis on a transcribed ad using the Decodificador de Padrões prompt."""
    client = anthropic.Anthropic()

    parts = []
    if hook:
        parts.append(f"Hook: {hook}")
    if landing_phrase:
        parts.append(f"Frase de Aterrissagem: {landing_phrase}")
    if body:
        parts.append(f"Corpo: {body}")
    ad_text = "\n\n".join(parts)

    resp = client.messages.create(
        model=SONNET_MODEL,
        max_tokens=4000,
        system=REVERSE_ENGINEER_SYSTEM,
        messages=[{"role": "user", "content": f"[ANÚNCIO]\n{ad_text}"}],
    )
    return resp.content[0].text.strip()


# ─── 7 Camadas Macro dos Anúncios (framework @wanderps_) ──────────────────────

SEVEN_LAYERS_SYSTEM = """Você é especialista em engenharia reversa de anúncios de Direct Response.
Todo anúncio que escala opera em 7 CAMADAS MACRO simultâneas. Sua tarefa é classificar
o anúncio recebido em cada uma das 7 camadas, escolhendo SEMPRE dentro do vocabulário fixo
abaixo (não invente categorias novas; se nada encaixar perfeitamente, escolha a mais próxima
e explique na justificativa).

REGRA DE ESCRITA: nunca use travessões. Justificativas curtas (1 a 2 frases), diretas.

═══ CAMADA 1: ESTRUTURA INVISÍVEL (roteiro psicológico que conduz do hook ao clique) ═══
Escolha UMA estrutura macro (ou descreva a sequência de blocos se for híbrida):
- Lista: Hook > Opção 1 fraca > Opção 2 fraca > Opção 3 forte > CTA
- Erro Comum: Hook > Erro > Consequência > Solução > CTA
- História Pessoal: Hook > Dor passada > Virada > Descoberta > Prova > CTA
- The One Thing: Hook > Problema > Única solução > Como funciona > CTA
- Alerta Urgente: Hook > Risco > Consequência > Solução > CTA
- Conspiração: Hook conspiratório > Dor > Autoridade oculta > Prova > Invalidação > Solução > CTA
- Invalidação Progressiva: Hook > Invalida sol.1 > Invalida sol.2 > Mecanismo único > Expert > Prova > CTA
- Podcast/Entrevista: Empilhamento > Pergunta > Avatar conta história > Mecanismo > Prova > CTA indireto

═══ CAMADA 2: FORMATO (embalagem visual) ═══
Escolha UM: Andando na Rua, Ator/Atriz na Tela (talking head), Caixinha de Perguntas,
Cinematográfico, Dentro do Carro, Fofoca, Podcast, React, Receitinha, Se Maquiando,
Tela Dividida, UGC, Entrevista, Notícia/News, Reels/TikTok, Wiki-How/Tela Branca, Hack do Corpo.

═══ CAMADA 3: ÂNGULO (ponto de vista) ═══
Escolha UM ou COMBINE 2 (ex: "Erro Comum + Mecanismo"):
Pergunta Paradoxal, Nova Descoberta, Fofoca/Segredo, Quick & Fast, Antes e Depois,
Alerta Urgente, The One Thing, Erro Comum, Violação de Expectativa, Predição, Tips & Tricks,
Conspiração, Lista, Prova Social, História Pessoal, Contrarian, Mecanismo da Solução,
Mecanismo do Problema, Curiosidade Absurda, Medo e Consequências.

═══ CAMADA 4: FATIA DE PÚBLICO (segmento que o ad mira, normalmente de forma INDIRETA) ═══
Identifique a fatia pela dor/desejo e situações de rotina presentes no anúncio
(ex: "Mulher que tentou de tudo", "Homem 60+ com medo de declínio", "CLT cansado",
"Cuidadora de familiar doente", "Desconfia de Big Pharma"). Descreva a fatia em poucas palavras.

═══ CAMADA 5: AVATAR (quem aparece: segmentação visual + amplificador emocional) ═══
Quem aparece/fala no anúncio e por que esse avatar amplifica a fatia
(ex: "Mulher comum, mãe", "Expert de jaleco", "Homem idoso trabalhador", "Celebridade",
"Pessoa no carro"). Se houver pista visual fornecida, use-a.

═══ CAMADA 6: TEMA (o assunto/big idea que ancora o anúncio) ═══
O ASSUNTO central. Tipos comuns: lista de alimentos, alimento vilão, celebridade + transformação,
descoberta científica, erro de dieta/exercício, comparação com tratamento caro, hábito perigoso,
tendência cultural, polêmica/cancelamento, receita caseira, mecanismo oculto no corpo,
conspiração industrial, sintoma como alerta, medicação perigosa. Descreva o tema em 1 frase.

═══ CAMADA 7: NÍVEL DE CONSCIÊNCIA (Schwartz) ═══
Escolha UM nível e justifique pelo tom/promessa do hook:
1 — Totalmente Inconsciente (não sabe que tem problema; curiosidade pura ou situação cotidiana)
2 — Consciente do Problema (sabe que tem, não conhece solução; dor direta/alerta)
3 — Consciente da Solução (cético; mecanismo novo/contrarian; quebra de objeção)
4 — Consciente do Produto (conhece o tipo de produto; diferenciais, prova, oferta)
5 — Mais Consciente (já comprou similares; identidade, oferta irresistível, preço)

═══ SAÍDA ═══
Responda APENAS com um JSON válido, sem texto antes ou depois, neste formato exato:
{
  "estrutura_invisivel": {"valor": "...", "justificativa": "..."},
  "formato": {"valor": "...", "justificativa": "..."},
  "angulo": {"valor": "...", "justificativa": "..."},
  "fatia_publico": {"valor": "...", "justificativa": "..."},
  "avatar": {"valor": "...", "justificativa": "..."},
  "tema": {"valor": "...", "justificativa": "..."},
  "nivel_consciencia": {"valor": "...", "justificativa": "..."},
  "coerencia": "Nota curta sobre a coerência entre as camadas e qual camada seria mais fácil variar pra criar um novo anúncio."
}"""


def analyze_seven_layers(hook="", body="", video_format="", avatar=None, niche="",
                         landing_phrase="", track_user_id=None, track_project_id=None) -> dict | None:
    """Classifica um anúncio nas 7 Camadas Macro (framework @wanderps_).
    Usa dicas do Gemini (formato/avatar) quando disponíveis. Retorna dict ou None."""
    if not (hook or body):
        return None

    hints = []
    if video_format:
        hints.append(f"Formato detectado na análise visual: {video_format}")
    if avatar:
        av = ", ".join(f"{k}={v}" for k, v in (avatar or {}).items() if v)
        if av:
            hints.append(f"Avatar detectado na análise visual: {av}")
    if niche:
        hints.append(f"Nicho: {niche}")
    hint_str = "\n".join(hints)

    parts = []
    if hook:
        parts.append(f"HOOK:\n{hook}")
    if landing_phrase:
        parts.append(f"FRASE DE ATERRISSAGEM:\n{landing_phrase}")
    if body:
        parts.append(f"CORPO:\n{body}")
    ad_text = "\n\n".join(parts)
    user_content = (f"{hint_str}\n\n" if hint_str else "") + f"[ANÚNCIO]\n{ad_text}"

    client = anthropic.Anthropic()
    resp = client.messages.create(
        model=SONNET_MODEL,
        max_tokens=2000,
        system=[{"type": "text", "text": SEVEN_LAYERS_SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_content}],
    )
    _track(track_user_id, "analise_7_camadas", SONNET_MODEL, resp.usage, track_project_id)

    raw = resp.content[0].text.strip()
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group())
    except json.JSONDecodeError:
        return None


# ─── Brainstorm ADS (7 Camadas + 5 Portas / Leilões Fantasmas — @wanderps_) ───

BRAINSTORM_SYSTEM = """Você é um estrategista de anúncios de Direct Response especialista em ESCALA.
Sua função é analisar anúncios existentes e gerar CONCEITOS NOVOS (não copy escrita) que escapam
do leilão congestionado do nicho, usando dois frameworks combinados.

REGRA DE ESCRITA: nunca use travessões.

═══════════ FRAMEWORK A — AS 7 CAMADAS MACRO ═══════════
Todo anúncio opera em 7 camadas: (1) Estrutura Invisível (roteiro: Lista, Erro Comum, História
Pessoal, The One Thing, Alerta Urgente, Conspiração, Invalidação Progressiva, Podcast); (2) Formato
(UGC, Podcast, Notícia, React, Receita, Dentro do Carro, Andando na Rua, Tela Dividida, etc.);
(3) Ângulo (Pergunta Paradoxal, Nova Descoberta, Conspiração, Contrarian, Erro Comum, Mecanismo,
Curiosidade Absurda, Prova Social, História Pessoal, etc., podem combinar); (4) Fatia de Público
(segmento mirado de forma indireta via rotina); (5) Avatar (quem aparece); (6) Tema (assunto/big
idea que ancora); (7) Nível de Consciência (Schwartz 1 a 5).

═══════════ FRAMEWORK B — AS 5 PORTAS DE ENTRADA (LEILÕES FANTASMAS) ═══════════
São 5 mecânicas pra fazer o anúncio cair em LEILÕES diferentes (menos disputados). O Andromeda
classifica o ad pelo conceito todo (avatar, ambiente, formato, comunicação); mudar essas camadas
joga o ad pra outro leilão.

PORTA 1 — DEEPER CORE: pega a fatia óbvia do nicho e desce até a SITUAÇÃO COTIDIANA específica que
revela a dor identitária (use o método dos 5 Porquês pra achar micro avatares). Ad direto, mas mais
emocional e profundo. Ex: "a que escolhe a marca mais barata e ainda não dá" → dor "não me sinto
capaz de dar uma vida boa pra quem amo".

PORTA 2 — OUTROS UNIVERSOS: o ad entra num UNIVERSO diferente do nicho (religião, maternidade,
estética, casamento, esporte), constrói uma história dramática por um bom tempo e SÓ no meio/fim
transiciona pra oferta como o que viabilizou a virada. Ex (renda): mulher quase perde o casamento
por engordar, queria Mounjaro mas não tinha grana, descobre uma forma de ganhar pelo celular.

PORTA 3 — ORGÂNICO DE OUTRO UNIVERSO: conteúdo orgânico viral real (viagem, comida, moda, review,
curiosidade) que existiria sozinho sem a oferta; a oferta é PLUGADA como nota de rodapé/PS no fim.
Parece publi de influencer. Ex: vlog de cruzeiro de luxo e nos últimos 15s "paguei tudo fazendo X".

PORTA 4 — HÁBITOS UNIVERSAIS: o gancho é uma AÇÃO que a pessoa já faz todo dia (tomar café, assistir
TV, ficar no celular, caminhar). A solução se junta ao hábito sem eliminá-lo. Ex: "Se você assiste
TikTok toda noite e não ganha nada, continue, só dedique 30 min a X."

PORTA 5 — SUPERESTRUTURAS: o gancho é um NOME familiar e amplo (marca: Google/Netflix/Spotify;
ingrediente: café/mel/canela/vinagre; ferramenta: Wi-Fi/celular; celebridade; instituição: Harvard;
problema: toxinas/inflamação) usado como isca ampla; no meio afunila pro mecanismo específico da
oferta. Ex: "ganhe dinheiro com o Truque do Wi-Fi" → afilia usando internet.

REGRA DE OURO (todas as portas): a solução NUNCA mata o hábito ou desejo de entrada; ela se JUNTA
ou VIABILIZA. "Continue tomando seu café, só adicione isso." / "Quer o Mounjaro? Isso paga."

═══════════ SUA TAREFA ═══════════
1. Analise os anúncios fornecidos pelas 7 camadas e identifique quais PORTAS eles já usam.
2. Aponte PADRÕES (o que se repete = o comprovado) e LACUNAS (portas/ângulos/avatares/temas NÃO
   testados nesse conjunto = oportunidade de leilão limpo).
3. Gere de 6 a 10 CONCEITOS NOVOS (apenas conceito + as 7 camadas, SEM escrever a copy), priorizando
   combinações pouco exploradas mas coerentes com a OFERTA. Para cada conceito, defina a Porta usada,
   a probabilidade (Alta/Média/Exploratória), qual leilão ele escapa, o racional e as 7 camadas.

Responda APENAS com um JSON válido neste formato exato:
{
  "padroes": {
    "resumo": "1-2 frases do que esses anúncios têm em comum",
    "portas_usadas": ["..."],
    "estruturas": ["..."], "angulos": ["..."], "avatares": ["..."],
    "temas": ["..."], "niveis": ["..."]
  },
  "lacunas": "Quais portas/ângulos/avatares/temas NÃO aparecem e por que seriam oportunidade de leilão mais limpo.",
  "conceitos": [
    {
      "titulo": "nome curto do conceito",
      "porta": "Porta X: Nome (universo/superestrutura/hábito especifico se houver)",
      "probabilidade": "Alta | Média | Exploratória",
      "leilao_que_escapa": "pra qual leilão/publico esse ad migra",
      "racional": "por que pode funcionar (1-2 frases)",
      "camadas": {
        "estrutura_invisivel": "...", "formato": "...", "angulo": "...",
        "fatia_publico": "...", "avatar": "...", "tema": "...", "nivel_consciencia": "..."
      }
    }
  ]
}"""


def generate_brainstorm_ads(ads: list, offer_summary: str = "", niche: str = "",
                            track_user_id=None, track_project_id=None) -> dict | None:
    """Gera um dossiê de brainstorm (padrões + lacunas + conceitos novos com 7 camadas)
    a partir dos anúncios selecionados, usando 7 Camadas + 5 Portas. `ads` = lista de
    {title, hook, body, seven_layers}. Retorna dict ou None."""
    if not ads:
        return None

    blocks = []
    for i, ad in enumerate(ads, 1):
        parts = [f"### ANÚNCIO {i}: {ad.get('title') or 'Sem título'}"]
        if ad.get("hook"):
            parts.append(f"Hook: {ad['hook']}")
        sl = ad.get("seven_layers")
        if isinstance(sl, dict):
            cam = []
            for k in ("estrutura_invisivel", "formato", "angulo", "fatia_publico",
                      "avatar", "tema", "nivel_consciencia"):
                v = sl.get(k)
                val = v.get("valor") if isinstance(v, dict) else v
                if val:
                    cam.append(f"  - {k}: {val}")
            if cam:
                parts.append("7 Camadas:\n" + "\n".join(cam))
        elif ad.get("body"):
            parts.append(f"Trecho do corpo: {ad['body'][:600]}")
        blocks.append("\n".join(parts))
    ads_text = "\n\n".join(blocks)

    head = []
    if offer_summary:
        head.append(f"OFERTA ATUAL (escreva conceitos congruentes com ela):\n{offer_summary[:2500]}")
    if niche:
        head.append(f"NICHO: {niche}")
    user_content = ("\n\n".join(head) + "\n\n" if head else "") + \
        f"ANÚNCIOS SELECIONADOS PARA ANÁLISE:\n\n{ads_text}"

    client = anthropic.Anthropic()
    resp = client.messages.create(
        model=SONNET_MODEL,
        max_tokens=8000,
        system=[{"type": "text", "text": BRAINSTORM_SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_content}],
    )
    _track(track_user_id, "brainstorm_ads", SONNET_MODEL, resp.usage, track_project_id)

    raw = (resp.content[0].text or "").strip()
    # remove cercas markdown ```json ... ```
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?", "", raw).strip()
        raw = re.sub(r"```$", "", raw).strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        logger.warning(f"[brainstorm] sem JSON na resposta (stop={resp.stop_reason}): {raw[:300]}")
        return None
    try:
        return json.loads(raw[start:end + 1])
    except json.JSONDecodeError as exc:
        logger.warning(f"[brainstorm] JSON invalido (stop={resp.stop_reason}, {exc}): {raw[:300]} ... {raw[-200:]}")
        return None


# ─── Conselho dos 5 (pressão sobre os conceitos do Brainstorm) ────────────────

COUNCIL_SYSTEM = """Você simula um CONSELHO de 5 especialistas que pressiona conceitos de anúncio de
Direct Response e crava um veredito honesto. Cada conselheiro olha por uma lente diferente. O
objetivo não é elogiar, é dizer em qual conceito apostar primeiro, qual vai flopar e o que ajustar.

REGRA DE ESCRITA: nunca use travessões. Comentários curtos, diretos, sem enrolação.

OS 5 CONSELHEIROS:
1. COMPRADOR DE MÍDIA: pensa em leilão, CPM, CPC, o que o Andromeda premia, potencial de escala.
   Pergunta: esse conceito cai num leilão mais limpo? Parece nativo o suficiente pra baratear métrica?
2. COPYWRITER DR: força do gancho, congruência com a oferta, clareza da big idea, identificação.
   Pergunta: o hook para o scroll? A estrutura conduz ao clique? Bate com a oferta?
3. O CÉTICO: advogado do diabo. Procura saturação, clichê, ideia que já rodou demais, promessa fraca.
   Pergunta: isso é realmente novo nesse nicho ou já vi mil vezes?
4. COMPLIANCE: risco de política do Meta (promessa de saúde/renda agressiva, antes/depois, etc.).
   Pergunta: isso passa na revisão do Meta ou toma reprovação/restrição de conta?
5. ESTRATEGISTA DE ESCALA: longevidade e variação. Pergunta: esse conceito rende dezenas de variações
   trocando camadas? Ou morre rápido? Vale virar uma linha de criativos?

TAREFA: avalie os conceitos recebidos. Escolha as melhores apostas, aponte riscos e dê ajustes
concretos. Seja decisivo: diga por qual COMEÇAR.

Responda APENAS com JSON válido neste formato exato:
{
  "veredito": "1 a 2 frases: por qual conceito começar e por quê (decisão clara).",
  "top_apostas": [
    {
      "conceito": "titulo do conceito",
      "nota": "Alta | Média",
      "por_que": "sintese de 1 frase do consenso",
      "lentes": [
        {"conselheiro": "Comprador de Mídia", "comentario": "1 frase"},
        {"conselheiro": "Copywriter DR", "comentario": "1 frase"},
        {"conselheiro": "Estrategista de Escala", "comentario": "1 frase"}
      ]
    }
  ],
  "riscos": [
    {"conceito": "titulo", "conselheiro": "O Cético | Compliance", "alerta": "qual o risco, 1 frase"}
  ],
  "ajustes": [
    {"conceito": "titulo", "ajuste": "o que mudar pra deixar forte, 1 frase"}
  ]
}"""


def brainstorm_council(concepts: list, offer_summary: str = "", niche: str = "",
                       track_user_id=None, track_project_id=None) -> dict | None:
    """Roda o Conselho dos 5 sobre os conceitos do brainstorm. `concepts` = lista de dicts
    (titulo, porta, probabilidade, racional, camadas). Retorna veredito ou None."""
    if not concepts:
        return None

    blocks = []
    for i, c in enumerate(concepts, 1):
        parts = [f"### CONCEITO {i}: {c.get('titulo') or 'Sem título'}"]
        if c.get("porta"):
            parts.append(f"Porta: {c['porta']}")
        if c.get("probabilidade"):
            parts.append(f"Probabilidade (auto): {c['probabilidade']}")
        if c.get("racional"):
            parts.append(f"Racional: {c['racional']}")
        cam = c.get("camadas") or {}
        if isinstance(cam, dict):
            cam_lines = []
            for k in ("estrutura_invisivel", "formato", "angulo", "fatia_publico",
                      "avatar", "tema", "nivel_consciencia"):
                v = cam.get(k)
                val = v.get("valor") if isinstance(v, dict) else v
                if val:
                    cam_lines.append(f"  - {k}: {val}")
            if cam_lines:
                parts.append("Camadas:\n" + "\n".join(cam_lines))
        blocks.append("\n".join(parts))
    concepts_text = "\n\n".join(blocks)

    head = []
    if offer_summary:
        head.append(f"OFERTA ATUAL (os conceitos têm que ser congruentes com ela):\n{offer_summary[:1500]}")
    if niche:
        head.append(f"NICHO: {niche}")
    user_content = ("\n\n".join(head) + "\n\n" if head else "") + \
        f"CONCEITOS PARA O CONSELHO AVALIAR:\n\n{concepts_text}"

    client = anthropic.Anthropic()
    resp = client.messages.create(
        model=SONNET_MODEL,
        max_tokens=4000,
        system=[{"type": "text", "text": COUNCIL_SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_content}],
    )
    _track(track_user_id, "brainstorm_conselho", SONNET_MODEL, resp.usage, track_project_id)

    raw = (resp.content[0].text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?", "", raw).strip()
        raw = re.sub(r"```$", "", raw).strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(raw[start:end + 1])
    except json.JSONDecodeError:
        return None


# ─── Organizar aula/podcast longo num GUIA completo (fatia + expande) ─────────
# Estratégia: em vez de dar a transcrição inteira e pedir "seção X" (o modelo
# resume demais e o guia sai com 5% do tamanho), a gente FATIA a transcrição em
# pedaços sequenciais e expande CADA pedaço com fidelidade. Assim ele não tem como
# pular conteúdo e o guia fica proporcional ao que foi falado.
LESSON_CHUNK_SYSTEM = """Você transforma a transcrição de uma aula/podcast num GUIA DE ESTUDO escrito, \
completo e FIEL. A transcrição vem em PARTES sequenciais. Para CADA parte, escreva o trecho \
correspondente do guia.

REGRAS:
- Cubra TUDO que é dito nesta parte. NÃO resuma a ponto de perder informação: reescreva as ideias de \
forma clara e didática, preservando definições, frameworks, passos, exemplos reais, histórias, nomes, \
números e métricas.
- Markdown: use '## ' para abrir um novo assunto/capítulo e '### ' para subtópicos. Crie os títulos a \
partir do que é abordado (títulos reais, não genéricos).
- Escreva o CONHECIMENTO direto, como um manual. NÃO narre o vídeo ("o palestrante diz que", "neste \
trecho ele explica"). Vá direto ao conteúdo.
- Texto corrido e explicativo. Listas só quando ajudam, sempre com contexto.
- ZERO travessões (—). Use ponto, vírgula ou dois pontos.
- NÃO invente nada que não esteja na transcrição.
- CONTINUIDADE: se esta parte continua o MESMO assunto da parte anterior, NÃO repita o título, apenas \
continue o texto. Se muda de assunto, abra um novo '## '."""


# ─── Localização de copy (adaptação nativa, não tradução literal) ─────────────
# code -> (idioma natural, nacionalidade do falante, "no idioma X", rótulo PT)
LOCALIZE_LANGUAGES = {
    "en": ("inglês nativo americano", "dos Estados Unidos", "em inglês", "Inglês (EUA)"),
    "es": ("espanhol latino-americano nativo", "da América Latina", "em espanhol", "Espanhol (LATAM)"),
    "fr": ("francês nativo", "da França", "em francês", "Francês (França)"),
    "de": ("alemão nativo", "da Alemanha", "em alemão", "Alemão (Alemanha)"),
    "it": ("italiano nativo", "da Itália", "em italiano", "Italiano (Itália)"),
}


def localize_copy(hooks: list, body: str, lang: str,
                  track_user_id=None, track_project_id=None) -> dict | None:
    """Adapta a copy (hooks + body) para um idioma de destino com NATURALIDADE NATIVA
    (não tradução literal). Mantém os mesmos parágrafos e a ordem dos hooks.
    Retorna {"hooks": [...], "body": "..."} ou None."""
    lang = (lang or "").lower()
    if lang not in LOCALIZE_LANGUAGES:
        return None
    idioma, nacionalidade, no_idioma, _ = LOCALIZE_LANGUAGES[lang]
    hooks = [h for h in (hooks or []) if (h or "").strip()]
    body = (body or "").strip()
    if not hooks and not body:
        return None

    system = (
        f"Você adapta textos de copy de resposta direta para {idioma}, com naturalidade de "
        f"falante NATIVO {nacionalidade}. NÃO faça tradução literal. Adapte expressões, estrutura "
        "das frases e escolha de palavras para soar como algo escrito originalmente por um nativo. "
        "Preserve totalmente o significado, a intenção e o tom. Elimine construções artificiais, "
        "excesso de formalidade e frases que pareçam traduzidas. Priorize fluidez, naturalidade e "
        "autenticidade. Reorganize frases se necessário para soar nativo. "
        "MANTENHA EXATAMENTE a mesma quebra de parágrafos do body e a MESMA ORDEM dos hooks. "
        "Zero travessões (—). "
        "Responda APENAS com JSON válido: {\"hooks\": [\"...\", ...], \"body\": \"...\"} "
        f"(tudo {no_idioma})."
    )
    hooks_block = "\n".join(f"[HOOK {i+1}]\n{h}" for i, h in enumerate(hooks)) or "(nenhum)"
    user = f"HOOKS ({len(hooks)}):\n{hooks_block}\n\n[BODY]\n{body or '(vazio)'}"

    client = anthropic.Anthropic()
    last = None
    for attempt in range(3):
        try:
            r = client.messages.create(
                model=SONNET_MODEL, max_tokens=6000,
                system=system, messages=[{"role": "user", "content": user}],
            )
            _track(track_user_id, "traduzir_copy", SONNET_MODEL, r.usage, track_project_id)
            raw = (r.content[0].text or "").strip()
            if raw.startswith("```"):
                raw = re.sub(r"^```(?:json)?", "", raw).strip()
                raw = re.sub(r"```$", "", raw).strip()
            s, e = raw.find("{"), raw.rfind("}")
            data = json.loads(raw[s:e + 1]) if s != -1 and e != -1 else {}
            out_hooks = data.get("hooks") or []
            out_body = data.get("body") or ""
            return {
                "hooks": [str(h) for h in out_hooks],
                "body": str(out_body),
            }
        except Exception as exc:
            last = exc
            msg = str(exc)
            if any(s in msg for s in ("529", "overloaded", "503", "429", "Connection", "timeout")) and attempt < 2:
                time.sleep(2 ** (attempt + 1))
                continue
            logging.getLogger(__name__).warning(f"[localize_copy] falhou: {exc}")
            return None
    logging.getLogger(__name__).warning(f"[localize_copy] falhou: {last}")
    return None


def _chunk_transcript(text: str, max_chars: int = 16000, overlap: int = 600) -> list[str]:
    """Fatia a transcrição em pedaços de ~max_chars, quebrando em fim de frase
    (não corta no meio) e com uma pequena sobreposição pra manter o contexto."""
    text = (text or "").strip()
    if len(text) <= max_chars:
        return [text] if text else []
    sents = re.split(r'(?<=[.!?])\s+', text)
    chunks, cur = [], ""
    for s in sents:
        if cur and len(cur) + len(s) + 1 > max_chars:
            chunks.append(cur.strip())
            cur = (cur[-overlap:] + " " + s) if overlap else s
        else:
            cur = (cur + " " + s) if cur else s
    if cur.strip():
        chunks.append(cur.strip())
    return chunks


def organize_lesson_content(transcript: str, title: str = "", niche: str = "",
                            track_user_id=None, track_project_id=None, progress_cb=None) -> str:
    """Transforma a transcrição crua de uma aula/podcast longo num GUIA de estudo
    estruturado e FIEL (markdown), proporcional ao conteúdo falado. Fatia a
    transcrição e expande pedaço por pedaço, depois monta título + sumário.
    `progress_cb(i, n)` é chamado antes de cada pedaço (pra mostrar progresso)."""
    if not transcript or not transcript.strip():
        return ""
    transcript = transcript.strip()
    client = anthropic.Anthropic()

    def _strip_dashes(t: str) -> str:
        return re.sub(r"\s*[—–]\s*", ", ", t or "")

    # Chamada com retry/backoff em erros transientes (529 sobrecarga, 503, 429, rede).
    def _call(system, user, max_tokens):
        last = None
        for attempt in range(4):
            try:
                r = client.messages.create(
                    model=SONNET_MODEL, max_tokens=max_tokens,
                    system=system, messages=[{"role": "user", "content": user}],
                )
                _track(track_user_id, "organizar_aula", SONNET_MODEL, r.usage, track_project_id)
                return r
            except Exception as e:
                last = e
                msg = str(e)
                transient = any(s in msg for s in (
                    "529", "overloaded", "503", "UNAVAILABLE", "429",
                    "rate_limit", "Connection", "timeout", "Timeout", "ECONN",
                ))
                if transient and attempt < 3:
                    time.sleep(2 ** (attempt + 1))  # 2s, 4s, 8s
                    continue
                raise
        raise last

    # ── Título do guia (chamada curta) ──
    guide_title = (title or "Guia da Aula").strip()
    try:
        rt = _call(
            "Dê um título curto e descritivo (até 12 palavras) para um guia de estudo feito a partir desta transcrição. Responda SOMENTE o título, sem aspas.",
            transcript[:6000], 60,
        )
        cand = (rt.content[0].text or "").strip().strip('"').strip()
        if cand:
            guide_title = cand
    except Exception:
        pass

    # ── Fatia e expande cada pedaço ──
    chunks = _chunk_transcript(transcript)
    if not chunks:
        return ""
    n = len(chunks)
    parts, last_heading = [], None
    for i, chunk in enumerate(chunks, 1):
        if progress_cb:
            try:
                progress_cb(i, n)
            except Exception:
                pass
        prev = f'A parte anterior terminou no assunto: "{last_heading}".\n\n' if last_heading else ""
        user = (
            f"{prev}PARTE {i} de {n} da transcrição"
            + (f' (nicho: {niche})' if niche else "") + ":\n\n"
            f"{chunk}\n\n"
            "Escreva agora o trecho do guia de estudo correspondente a esta parte, completo e fiel."
        )
        try:
            rs = _call(LESSON_CHUNK_SYSTEM, user, 4096)
            txt = _strip_dashes((rs.content[0].text or "").strip())
            if txt:
                parts.append(txt)
                hs = re.findall(r'^##(?!#)\s+(.+)$', txt, re.M)
                if hs:
                    last_heading = re.sub(r'^\d+[.\)]\s*', '', hs[-1]).strip()
        except Exception as exc:
            logging.getLogger(__name__).warning(f"[organize_lesson] parte {i}/{n} falhou: {exc}")

    if not parts:
        return ""
    body = "\n\n".join(parts)

    # ── Pós-processo: numera os '## ' em sequência, funde continuações e monta sumário ──
    out_lines, toc, num, last_h = [], [], 0, None
    for ln in body.split("\n"):
        m = re.match(r'^##(?!#)\s+(.+?)\s*$', ln)
        if m:
            htext = re.sub(r'^\d+[.\)]\s*', '', m.group(1)).strip()
            if last_h and htext.lower() == last_h.lower():
                continue  # mesmo assunto continuado em outra parte: não duplica cabeçalho
            num += 1
            last_h = htext
            out_lines.append(f"## {num}. {htext}")
            toc.append(f"{num}. {htext}")
        else:
            out_lines.append(ln)

    sumario = "## Sumário\n" + "\n".join(f"- {t}" for t in toc)
    return f"# {guide_title}\n\n{sumario}\n\n" + "\n".join(out_lines).strip()
