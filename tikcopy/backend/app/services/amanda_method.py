"""
Método Amanda Khayat — base de conhecimento pra geração de ganchos (hooks).
Codifica os 9 Pilares + 2 Hacks do Guia Completo de Ganchos.

Usado pelo endpoint /ai/suggest-field quando o campo é 'hook'.
"""

# Mapa de estado emocional dominante por nicho (Pilar 1).
# Chave = palavra que aparece no nicho (lower, sem acento idealmente).
NICHE_EMOTIONAL_MAP = {
    "diabetes":        "Medo das consequências. Ângulos: problema, dor, urgência, conspiração.",
    "memoria":         "Medo das consequências. Ângulos: problema, dor, urgência, conspiração.",
    "memória":         "Medo das consequências. Ângulos: problema, dor, urgência, conspiração.",
    "alzheimer":       "Medo das consequências. Ângulos: problema, dor, urgência, conspiração.",
    "doença":          "Medo das consequências. Ângulos: problema, dor, urgência, conspiração.",
    "doenca":          "Medo das consequências. Ângulos: problema, dor, urgência, conspiração.",
    "emagrecimento":   "Desejo + esperança. Ângulos: resultado, fofoca, aspiracional, benefício.",
    "emagrecer":       "Desejo + esperança. Ângulos: resultado, fofoca, aspiracional, benefício.",
    "renda":           "Desejo de transformação. Ângulos: possibilidade, simplicidade, resultado.",
    "dinheiro":        "Desejo de transformação. Ângulos: possibilidade, simplicidade, resultado.",
    "financ":          "Desejo de transformação. Ângulos: possibilidade, simplicidade, resultado.",
    "menopausa":       "Desejo + frustração. Ângulos: identificação, solução natural.",
    "rejuvenesc":      "Desejo + frustração. Ângulos: identificação, solução natural.",
    "espirit":         "Fé + dor de vida. Ângulos: guerra espiritual, conspiração, testemunho.",
    "religi":          "Fé + dor de vida. Ângulos: guerra espiritual, conspiração, testemunho.",
    "relacionamento":  "Dor emocional + esperança. Ângulos: identificação, fofoca, revelação, dor.",
    "conteudo":        "Benefício, promessa, estado emocional alto.",
    "conteúdo":        "Benefício, promessa, estado emocional alto.",
    "disfunção":       "Medo + vergonha + desejo. Ângulos: dor, identificação, solução discreta, conspiração.",
    "disfuncao":       "Medo + vergonha + desejo. Ângulos: dor, identificação, solução discreta, conspiração.",
    "erétil":          "Medo + vergonha + desejo. Ângulos: dor, identificação, solução discreta, conspiração.",
    "eretil":          "Medo + vergonha + desejo. Ângulos: dor, identificação, solução discreta, conspiração.",
}


def emotional_state_for_niche(niche: str | None) -> str:
    """Retorna o estado emocional + ângulos dominantes pro nicho (Pilar 1)."""
    if not niche:
        return "Analise o nicho e escolha o ângulo que mais mexe com o público."
    n = niche.strip().lower()
    for key, val in NICHE_EMOTIONAL_MAP.items():
        if key in n:
            return val
    return "Analise o nicho e escolha o ângulo que mais mexe com o público."


# Prompt-mestre com os 9 Pilares condensados em regras acionáveis.
HOOK_METHOD_PROMPT = """\
Você gera GANCHOS (hooks) seguindo o MÉTODO AMANDA KHAYAT de resposta direta.
O gancho é 80-20 do anúncio: se não para o scroll, ninguém chega no body.
NUNCA copie ganchos validados — modele a ESTRUTURA, mude a comunicação.

OS 9 PILARES (todos devem ser respeitados):

1. ÂNGULO CORRETO: defina o ângulo antes de escrever. Opções: Promessa, Conspiracional,
   Dor/Problema, UGC (depoimento), Pergunta direta. Escolha pelo estado emocional do nicho.

2. ENVOLVA O LEAD: 80% dos ganchos falam DIRETAMENTE com o lead (use "você", "seu", "sua").
   Fraco: "A metformina me deixou diabético." Forte: "A metformina pode estar te deixando diabético."
   Exceções (20%): pergunta que já está na cabeça dele, celebridade relevante, ou formato notícia.

3. FRASE/PALAVRA DE PODER: SEMPRE comece com uma frase ou palavra de poder. Categorias:
   - Convicção: "Eu juro pra você", "Não tô brincando", "Eu tentei tudo. Tudo mesmo.", "Anota isso"
   - Aviso: "Atenção", "Para antes de fazer isso", "Mulheres acima dos 40, presta atenção"
   - Contradição: "Parece mentira, mas funciona", "Não é a dieta. Não é a academia. É outra coisa."
   - Revelação: "Ninguém fala sobre isso, mas...", "A verdade que a indústria esconde"
   - Identificação: "Eu sei exatamente o que você tá sentindo", "Eu era você há 6 meses"
   - Escassez: "Esse vídeo pode sair do ar a qualquer momento", "Já tentaram derrubar isso"

4. ESPECIFICIDADE E CERTEZA: números, nomes, prazos, instituições. NUNCA "pode", "talvez", "pode ser".
   Vago: "Emagreci muito." Forte: "Emagreci 8kg em 3 semanas."
   Vago: "Uma universidade descobriu." Forte: "Pesquisadores de Harvard descobriram."

6. CURIOSIDADE: o gancho deve gerar uma PERGUNTA na cabeça do lead que só é respondida se ele
   continuar assistindo. Teste mental: "Eu pararia o scroll nisso?" Se não, está fraco.
   Curiosidade qualificada — atrai o público CERTO, não qualquer um.

7. EMOÇÃO: todo gancho gera uma emoção (curiosidade, raiva/indignação, esperança, tristeza, medo, empolgação).
   Sem emoção = gancho ruim.

8. CORTE A PROLIXIDADE: máximo DUAS linhas, ideal UMA. Uma bala. Sem "bom dia pessoal", sem apresentação.
   Se tem 3 linhas, está ruim.

HACK — VARIE OS ÂNGULOS: quando gerar múltiplos ganchos, cada um deve testar uma VARIÁVEL diferente
(ângulo diferente, formato diferente, emoção diferente). Não faça 3 ganchos iguais com o mesmo ângulo.

REGRAS DE OUTPUT:
- Linguagem natural, brasileiro coloquial, SEM cara de IA, SEM hashtags, SEM emojis (a menos que o nicho peça).
- Cada gancho: 1 a 2 linhas no máximo. Comece com frase/palavra de poder.
- Seja específico (números, nomes, prazos) sempre que possível.
"""


# Estratégias do menu "Sugerir Hook" (mapa mental dos 3 modos de escrita).
HOOK_STRATEGIES = {
    "organico": "Modelar a estrutura invisível do HOOK do orgânico da Comunicação.",
    "swipe_same": "Modelar a estrutura invisível dos hooks do swipe do MESMO nicho.",
    "swipe_other": "Modelar a estrutura invisível de hooks do swipe de OUTRO nicho e adaptar pro nicho atual.",
    "validated_similar": "Gerar hooks semelhantes a um hook validado das suas copys (melhorando).",
}


def _instr_block(instructions: str) -> str:
    if instructions and instructions.strip():
        return f"""
═══════════════════════════════════════
⚠️ INSTRUÇÕES DA INTELIGÊNCIA (regras OBRIGATÓRIAS deste projeto — respeite acima de tudo):
{instructions.strip()}
"""
    return ""


def _research_block(research_snippets: list[dict]) -> str:
    if not research_snippets:
        return ""
    rlines = []
    for r in research_snippets:
        title = (r.get("title") or "Pesquisa").strip()
        content = (r.get("content") or "").strip()
        if content:
            rlines.append(f"### {title}\n{content[:800]}")
    if not rlines:
        return ""
    return f"""
═══════════════════════════════════════
PESQUISA DO NICHO (use a LINGUAGEM REAL do público — dores, desejos, gírias):
{chr(10).join(rlines)}
"""


def _memory_block(memory_snippets: list[dict]) -> str:
    if not memory_snippets:
        return ""
    mlines = []
    for m in memory_snippets:
        title = (m.get("title") or "Transcrição").strip()
        content = (m.get("content") or "").strip()
        if content:
            mlines.append(f"### {title}\n{content[:500]}")
    if not mlines:
        return ""
    return f"""
═══════════════════════════════════════
MEMÓRIA DO PROJETO (transcrições de referência):
{chr(10).join(mlines)}
"""


def _swipe_hooks_block(swipe_hooks: list[dict], *, with_niche: bool = False) -> str:
    lines = []
    for i, h in enumerate(swipe_hooks, 1):
        hook = (h.get("hook") or "").strip()
        if not hook:
            continue
        tipo = h.get("hook_type") or "?"
        emo = h.get("emotion") or "?"
        if with_niche:
            nich = h.get("niche") or "?"
            lines.append(f'{i}. [{nich} · {tipo} · {emo}] "{hook}"')
        else:
            lines.append(f'{i}. [{tipo} · {emo}] "{hook}"')
    return "\n".join(lines) if lines else "(nenhum hook encontrado)"


def build_structure_prompt(*, paragraphs: list[str], niche: str | None = "") -> str:
    """Extrai a ESTRUTURA INVISÍVEL (esqueleto psicológico) de um orgânico validado.

    Recebe o orgânico JÁ QUEBRADO em parágrafos NUMERADOS. A IA devolve apenas
    label+purpose por índice de parágrafo — o TEXTO LITERAL é preenchido no backend
    pelo índice (nunca entra no JSON, evitando erros de escaping/aspas/quebra de linha).

    Saída: formato delimitado por pipe (NÃO é JSON — evita erros de aspas/escaping):
        HOOK: <descrição da estrutura do gancho>
        1 | <label> | <purpose>
        2 | <label> | <purpose>
    onde o número inicial é o índice do parágrafo. O backend mapeia para o texto real.
    """
    numbered = "\n".join(f"[{i}] {p.strip()}" for i, p in enumerate(paragraphs))
    last_idx = len(paragraphs) - 1
    n_body = max(0, len(paragraphs) - 1)
    return f"""Você é especialista no método Amanda Khayat de resposta direta.
Sua tarefa é fazer a ENGENHARIA REVERSA da ESTRUTURA INVISÍVEL de um orgânico validado.

ESTRUTURA INVISÍVEL = o esqueleto psicológico (a SEQUÊNCIA de intenções e gatilhos),
NÃO as palavras. É o "porquê" de cada parágrafo existir e a ordem em que aparecem.

ORGÂNICO VALIDADO (nicho: {niche or '—'}), com cada parágrafo NUMERADO:
\"\"\"
{numbered}
\"\"\"

TAREFA — devolva em TEXTO PURO no formato EXATO abaixo (NÃO use JSON, NÃO use markdown):

Linha 1: começa com "HOOK: " seguida de 1-2 frases descrevendo a estrutura invisível do
GANCHO (o parágrafo [0]) — ângulo, padrão de abertura, gatilho emocional, promessa/curiosidade.
NÃO copie as palavras do gancho.

Depois, UMA LINHA para CADA parágrafo a partir do [1], na MESMA ordem, no formato:
NUMERO | LABEL | PURPOSE

Onde:
- NUMERO = o número do parágrafo (inteiro, igual ao que está entre colchetes).
- LABEL = nome curto do bloco (ex: Identificação da dor, Vilão, Virada, Prova, Oferta/CTA).
- PURPOSE = o que esse parágrafo faz na cabeça do lead (a intenção psicológica), em 1 frase.

REGRAS:
- Você DEVE devolver EXATAMENTE {n_body} linhas de bloco, uma para CADA parágrafo de [1] até [{last_idx}].
  Numere-as de 1 até {last_idx} sem pular nenhum número.
- Se um parágrafo REPETE o conteúdo de um anterior (ex: CTA repetido no fim), AINDA ASSIM devolva
  uma linha pra ele — dê um label como "Reforço do CTA" ou "Repetição da oferta". NUNCA omita.
- Todo bloco PRECISA ter um LABEL e um PURPOSE preenchidos. Nunca deixe label vazio.
- Use o caractere "|" APENAS como separador entre NUMERO, LABEL e PURPOSE (não use "|" no texto).
- NÃO inclua o texto do parágrafo. NÃO adicione comentários, títulos ou linhas extras.

EXEMPLO de saída:
HOOK: Abre validando a dor com autoridade temporal e cria curiosidade sobre um segredo.
1 | Amplificação da dor | Valida que o problema é real e inevitável, intensificando o medo.
2 | Vilão | Nomeia o inimigo e cria urgência."""


def build_hook_prompt(*, strategy: str = "organico", niche: str | None,
                      organic_base: str = "", swipe_hooks: list[dict] = None,
                      other_niche_hooks: list[dict] = None, validated_hooks: list[str] = None,
                      research_snippets: list[dict] = None, instructions: str = "",
                      memory_snippets: list[dict] = None, context_block: str = "",
                      current_value: str = "", instruction: str = "", n: int = 3) -> str:
    """Monta o prompt de geração de ganchos conforme a ESTRATÉGIA escolhida no menu.

    Estratégias (HOOK_STRATEGIES):
      - "organico":          modela a estrutura invisível do HOOK do orgânico da Comunicação.
      - "swipe_same":        modela a estrutura invisível dos hooks do swipe do MESMO nicho.
      - "swipe_other":       modela hooks do swipe de OUTRO nicho e adapta pro nicho atual.
      - "validated_similar": gera hooks semelhantes a um hook validado das copys do usuário.

    Em TODAS as estratégias o contexto alimenta o prompt: pesquisa do nicho, memória,
    instruções (inteligência) e briefing/contexto do anúncio.
    """
    swipe_hooks = swipe_hooks or []
    other_niche_hooks = other_niche_hooks or []
    validated_hooks = validated_hooks or []
    research_snippets = research_snippets or []
    memory_snippets = memory_snippets or []
    emotional = emotional_state_for_niche(niche)

    current_block = f"\nGANCHO ATUAL (que o copy quer melhorar/substituir):\n{current_value}" if current_value else ""
    instruction_block = f"\nINSTRUÇÃO EXTRA DO COPYWRITER: {instruction}" if instruction else ""
    instr_block = _instr_block(instructions)
    research_block = _research_block(research_snippets)
    memory_block = _memory_block(memory_snippets)

    # ── Bloco de REFERÊNCIA + TAREFA, específico por estratégia ──
    if strategy == "swipe_same":
        ref_block = f"""
═══════════════════════════════════════
HOOKS VALIDADOS DO SWIPE — NICHO "{niche or '—'}" (modele a ESTRUTURA INVISÍVEL destes):

{_swipe_hooks_block(swipe_hooks)}

⚠️ Extraia o esqueleto psicológico (ângulo, abertura, gatilho, ritmo) e escreva ganchos NOVOS pra oferta atual."""
        task = f"""Gere {n} ganchos pra a oferta atual.
Cada gancho modela a estrutura invisível de um dos hooks do swipe do MESMO nicho acima — cada um com um ângulo diferente (Hack 2).
NUNCA copie as palavras: modele só a estrutura. Aplique os 9 pilares, use a linguagem real da pesquisa e respeite as instruções."""

    elif strategy == "swipe_other":
        ref_block = f"""
═══════════════════════════════════════
HOOKS VALIDADOS DO SWIPE — OUTROS NICHOS (modele a ESTRUTURA INVISÍVEL e ADAPTE pro nicho "{niche or '—'}"):

{_swipe_hooks_block(other_niche_hooks, with_niche=True)}

⚠️ Esses hooks são de OUTROS nichos. Pegue o esqueleto psicológico que funcionou e TRADUZA pra dor/desejo
do nicho atual usando o briefing, a pesquisa e as instruções. Não fica com cara do nicho original."""
        task = f"""Gere {n} ganchos pra a oferta atual.
Cada gancho ADAPTA a estrutura invisível de um hook validado de OUTRO nicho pro nicho atual ("{niche or '—'}").
Use a pesquisa pra trazer a linguagem/dor real do público novo. Aplique os 9 pilares e respeite as instruções.
Cada um com ângulo diferente. NUNCA copie palavras — só a estrutura."""

    elif strategy == "validated_similar":
        vlines = "\n".join(f'{i}. "{h}"' for i, h in enumerate(validated_hooks, 1)) or "(nenhum hook validado selecionado)"
        ref_block = f"""
═══════════════════════════════════════
HOOK(S) VALIDADO(S) DAS SUAS COPYS (referência pra gerar SEMELHANTES — melhorados):

{vlines}

⚠️ Estes ganchos já performaram. Modele a estrutura e gere variações MELHORES seguindo a instrução do copy."""
        task = f"""Gere {n} ganchos SEMELHANTES ao(s) hook(s) validado(s) acima — mesma estrutura/ângulo que funcionou,
mas melhorados conforme a instrução do copywriter. Aplique os 9 pilares, use a linguagem real da pesquisa
e respeite as instruções. NUNCA entregue cópia idêntica: cada um é uma variação mais forte."""

    else:  # "organico" (default)
        ref_block = f"""
═══════════════════════════════════════
🎯 ORGÂNICO DA COMUNICAÇÃO (modele a estrutura invisível do HOOK deste orgânico):
{organic_base.strip()}

⚠️ Modele a estrutura invisível do HOOK desse orgânico (o "gancho fiel ao orgânico", parece conteúdo nativo).
Extraia o ângulo, padrão de abertura, gatilho emocional e ritmo. NÃO copie as palavras."""
        task = f"""Gere {n} ganchos pra a oferta atual.
TODOS modelam a estrutura invisível do HOOK do orgânico da Comunicação (acima), cada um variando o ângulo/emoção.
Aplicam os 9 pilares, usam a linguagem real da pesquisa, respeitam as instruções, comunicação NOVA (nunca cópia)."""

    # ── A OFERTA vem PRIMEIRO: a IA tem que entender o briefing ANTES de modelar ──
    offer_block = f"""═══════════════════════════════════════
🧭 A OFERTA QUE VOCÊ VAI ESCREVER (LEIA ISSO PRIMEIRO — todo gancho tem que ser sobre ESTA oferta):
Nicho: {niche or '—'}
ESTADO EMOCIONAL DO NICHO (Pilar 1): {emotional}

{context_block}
{current_block}
{instruction_block}"""

    return f"""{HOOK_METHOD_PROMPT}
{instr_block}
{offer_block}
{ref_block}
{research_block}{memory_block}
═══════════════════════════════════════
TAREFA:
PASSO 1 — Internalize a OFERTA do briefing acima: ângulo, avatar, ideia central, promessa, mercado e dores.
PASSO 2 — {task}
⚠️ Cada gancho PRECISA falar especificamente da oferta do briefing. NUNCA devolva gancho genérico ou fora do tema da oferta.
🔗 CONGRUÊNCIA COM A OFERTA: a estrutura vem da referência, mas a CURIOSIDADE e o MECANISMO plantados no
gancho são SEMPRE os da OFERTA (Big Idea, mecanismo da causa/solução do dossiê). Quando soar natural, use os
NOMES CHICLETE/termos proprietários do dossiê. NUNCA plante o mecanismo da referência se ele for diferente
do mecanismo da oferta, pra abrir a porta pra ESTA oferta com congruência total até o funil.
✍️ ZERO TRAVESSÕES: não use travessão (—) nem meia-risca (–) em nenhum gancho. Quebre em frases curtas
com ponto, vírgula ou dois-pontos. Texto que parece nativo, sem cara de IA.

RETORNE APENAS JSON VÁLIDO:
{{"suggestions": ["gancho 1", "gancho 2", "gancho 3"]}}
(no JSON os ganchos vêm LIMPOS, sem rótulos)"""
