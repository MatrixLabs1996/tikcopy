// ─── TXT ────────────────────────────────────────────────────────

export function downloadTxt(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── PDF ────────────────────────────────────────────────────────

export async function downloadPdf(filename, content) {
  const { jsPDF } = await import('jspdf')
  const { LOGO_BASE64 } = await import('./logoBase64')
  // jsPDF não tem Arial embutida — Helvetica é o equivalente moderno (mesma família sans-serif)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 18
  const maxLineW = pageW - margin * 2
  const lineH = 5.5

  // Marca d'água da logo (central, bem translúcida)
  const drawWatermark = () => {
    try {
      const wmW = 110            // mm
      const wmH = wmW * (129 / 427)   // proporção do PNG cortado (~30mm)
      const wmX = (pageW - wmW) / 2
      const wmY = (pageH - wmH) / 2
      // GState com opacidade baixa pra ficar de fundo
      const gs = doc.GState({ opacity: 0.08 })
      doc.setGState(gs)
      doc.addImage(LOGO_BASE64, 'PNG', wmX, wmY, wmW, wmH)
      doc.setGState(doc.GState({ opacity: 1 }))
    } catch (e) { /* fallback silencioso se addImage falhar */ }
  }

  drawWatermark()

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)

  let y = margin

  // Renderiza uma linha aplicando bold inline (**texto**) e hyperlinks
  const renderInline = (line) => {
    const parts = parseInline(line)
    // Renderiza palavra por palavra com word-wrap manual
    let x = margin
    for (const p of parts) {
      const text = p.text
      if (!text) continue
      // Marker do comentário sempre em negrito
      doc.setFont('helvetica', (p.bold || p.marker) ? 'bold' : 'normal')
      // Quebra por espaço pra word-wrap
      const tokens = text.split(/(\s+)/)
      for (const tok of tokens) {
        if (!tok) continue
        const w = doc.getTextWidth(tok)
        if (x + w > pageW - margin) {
          y += lineH
          x = margin
          if (y > pageH - margin) { doc.addPage(); drawWatermark(); y = margin }
        }
        if (p.link) {
          doc.setTextColor(17, 85, 204)
          doc.textWithLink(tok, x, y, { url: p.link })
          doc.setDrawColor(17, 85, 204)
          doc.line(x, y + 0.7, x + w, y + 0.7)
          doc.setTextColor(30, 30, 30)
        } else if (p.marker) {
          doc.setTextColor(30, 136, 229)  // azul pra marcador de comentário
          doc.text(tok, x, y)
          doc.setTextColor(30, 30, 30)
        } else {
          doc.text(tok, x, y)
        }
        x += w
      }
    }
    y += lineH
    if (y > pageH - margin) { doc.addPage(); drawWatermark(); y = margin }
  }

  const lines = content.split('\n')
  for (const raw of lines) {
    if (raw.startsWith('==') || raw.startsWith('--')) continue
    if (raw.startsWith('──')) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(30, 30, 30)
      const heading = raw.replace(/^──\s*/, '')
      const wrapped = doc.splitTextToSize(heading, maxLineW)
      for (const w of wrapped) {
        if (y + lineH + 2 > pageH - margin) { doc.addPage(); drawWatermark(); y = margin }
        doc.text(w, margin, y)
        y += lineH + 1.5
      }
      doc.setFontSize(10)
      continue
    }
    if (!raw.trim()) { y += lineH * 0.6; continue }
    renderInline(raw)
  }

  doc.save(`${filename}.pdf`)
}

// ─── DOCX ───────────────────────────────────────────────────────

const URL_PATTERN = /https?:\/\/[^\s\]\)<>]+/
const COMMENT_MARKER = /\[#\d+\]/g

// Parser: transforma "texto **bold** com http://link e ⟦#1⟧marca⟦#1⟧"
// em [{ text, bold?, link?, marker? }]
function parseInline(text) {
  if (!text) return [{ text: '' }]
  const parts = []
  // 1ª passada: separa por **bold**
  const segments = text.split(/(\*\*[^*]+\*\*)/g)
  for (const seg of segments) {
    if (!seg) continue
    const bold = seg.startsWith('**') && seg.endsWith('**')
    const inner = bold ? seg.slice(2, -2) : seg
    // 2ª passada: separa URLs (com grupo de captura pra preservar a URL no split)
    const subParts = inner.split(/(https?:\/\/[^\s\]\)<>]+)/g)
    for (const sub of subParts) {
      if (!sub) continue
      if (URL_PATTERN.test(sub) && sub.match(/^https?:\/\//)) {
        parts.push({ text: sub, link: sub, bold })
        continue
      }
      // 3ª passada: separa marcadores de comentário [#N]
      const markerParts = sub.split(/(\[#\d+\])/g)
      for (const mp of markerParts) {
        if (!mp) continue
        if (/^\[#\d+\]$/.test(mp)) {
          parts.push({ text: mp, marker: true, bold })
        } else {
          parts.push({ text: mp, bold })
        }
      }
    }
  }
  return parts.length ? parts : [{ text: '' }]
}

export async function downloadDocx(filename, content) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, ImageRun, Header, AlignmentType } = await import('docx')
  const { LOGO_BASE64 } = await import('./logoBase64')

  const ARIAL = 'Arial'

  // Converte data:image/png;base64,xxxx → Uint8Array pro ImageRun
  const logoBytes = (() => {
    try {
      const b64 = LOGO_BASE64.split(',')[1] || ''
      const bin = atob(b64)
      const arr = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
      return arr
    } catch { return null }
  })()

  const makeRuns = (text, opts = {}) => {
    const inline = parseInline(text)
    return inline.map((p) => {
      if (p.link) {
        return new ExternalHyperlink({
          link: p.link,
          children: [new TextRun({
            text: p.text,
            font: ARIAL,
            size: opts.size || 22,
            bold: p.bold || opts.bold,
            color: '1155CC',
            underline: { type: 'single', color: '1155CC' },
          })],
        })
      }
      if (p.marker) {
        return new TextRun({
          text: p.text,
          font: ARIAL,
          size: opts.size || 22,
          bold: true,
          color: '1E88E5',  // azul pra destacar marca de comentário
        })
      }
      return new TextRun({
        text: p.text,
        font: ARIAL,
        size: opts.size || 22,
        bold: p.bold || opts.bold,
        color: opts.color,
      })
    })
  }

  const children = []
  const lines = content.split('\n')

  for (const line of lines) {
    if (line.startsWith('──')) {
      const headingText = line.replace(/^──\s*/, '')
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: headingText, bold: true, font: ARIAL, size: 26 })],
        spacing: { before: 240, after: 80 },
      }))
    } else if (line.startsWith('===') || line.startsWith('---')) {
      // separador — pula
    } else if (line.trim() === '') {
      children.push(new Paragraph({ children: [new TextRun({ text: '', font: ARIAL })] }))
    } else {
      children.push(new Paragraph({
        children: makeRuns(line),
        spacing: { after: 40 },
      }))
    }
  }

  // Cabeçalho com logo (se conseguiu decodificar)
  const header = logoBytes
    ? new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new ImageRun({
                type: 'png',
                data: logoBytes,
                transformation: { width: 80, height: 24 },   // ~80x24px, mantém proporção
                altText: { title: 'CopyX', description: 'CopyX', name: 'CopyX' },
              }),
            ],
          }),
        ],
      })
    : undefined

  const doc = new Document({
    styles: {
      default: { document: { run: { font: ARIAL, size: 22 } } },
    },
    sections: [{
      properties: {
        page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } },
      },
      headers: header ? { default: header } : undefined,
      children,
    }],
  })

  const buffer = await Packer.toBlob(doc)
  const url = URL.createObjectURL(buffer)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.docx`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Dispatcher ─────────────────────────────────────────────────

export async function downloadAs(format, filename, content) {
  if (format === 'pdf') return downloadPdf(filename, content)
  if (format === 'docx') return downloadDocx(filename, content)
  return downloadTxt(filename, content)
}

// ─── Content builders ────────────────────────────────────────────

export function buildVSLAnalysisTxt({ filename, transcript, analysis }) {
  const title = analysis?.bloco1_titulo || filename || 'VSL'
  const lines = []
  lines.push(`VSL ANALYSIS — MÉTODO RMBC`)
  lines.push(`Arquivo: ${filename || '—'}`)
  lines.push(`Título identificado: ${title}`)
  lines.push(`Palavras transcritas: ${transcript?.split(' ').length?.toLocaleString() || '—'}`)
  lines.push('='.repeat(60))
  lines.push('')
  const blocks = [
    ['BLOCO 1 — Identificação Geral', analysis?.bloco1],
    ['BLOCO 2 — Big Idea', analysis?.bloco2],
    ['BLOCO 3 — Lead (10 elementos)', analysis?.bloco3],
    ['BLOCO 4 — Headline', analysis?.bloco4],
    ['BLOCO 5 — Background Story', analysis?.bloco5],
    ['BLOCO 6 — Mecanismo', analysis?.bloco6],
    ['BLOCO 7 — Apresentação do Produto', analysis?.bloco7],
    ['BLOCO 8 — Fechamento', analysis?.bloco8],
    ['BLOCO 9 — Pontos Fortes', analysis?.bloco9],
    ['BLOCO 10 — Pontos Fracos e Oportunidades', analysis?.bloco10],
    ['BLOCO 11 — Extração de Swipes', analysis?.bloco11],
  ]
  for (const [label, content] of blocks) {
    if (!content) continue
    lines.push(`── ${label}`)
    lines.push('-'.repeat(40))
    lines.push(content)
    lines.push('')
  }
  lines.push('='.repeat(60))
  lines.push('── TRANSCRIÇÃO COMPLETA')
  lines.push('-'.repeat(40))
  lines.push(transcript || '')
  return lines.join('\n')
}

export function buildVSLTranscriptTxt({ filename, transcript }) {
  const lines = []
  lines.push(`TRANSCRIÇÃO — ${filename || 'VSL'}`)
  lines.push('='.repeat(60))
  lines.push('')
  lines.push(transcript || '')
  return lines.join('\n')
}

const SEVEN_LAYER_LABELS = [
  ['estrutura_invisivel', '1. Estrutura Invisível'],
  ['formato', '2. Formato'],
  ['angulo', '3. Ângulo'],
  ['fatia_publico', '4. Fatia de Público'],
  ['avatar', '5. Avatar'],
  ['tema', '6. Tema'],
  ['nivel_consciencia', '7. Nível de Consciência'],
]

export function buildAdTxt(result) {
  const { title, hook_written, body, reverse_engineering, seven_layers } = result
  const lines = []
  lines.push(`── ANÚNCIO — ${title || 'Sem título'}`)
  lines.push('='.repeat(60))
  lines.push('')

  // 1. HOOK
  lines.push('── HOOK')
  lines.push('-'.repeat(40))
  lines.push(hook_written || '')
  lines.push('')

  // 2. BODY (já vem formatado em parágrafos do backend)
  lines.push('── BODY')
  lines.push('-'.repeat(40))
  lines.push(body || '')

  // 4. ENGENHARIA REVERSA (só se houver)
  if (reverse_engineering) {
    lines.push('')
    lines.push('='.repeat(60))
    lines.push('── ENGENHARIA REVERSA')
    lines.push('-'.repeat(40))
    lines.push(reverse_engineering)
  }

  // 5. 7 CAMADAS MACRO (só se houver)
  if (seven_layers) {
    lines.push('')
    lines.push('='.repeat(60))
    lines.push('── 7 CAMADAS MACRO')
    lines.push('-'.repeat(40))
    for (const [key, label] of SEVEN_LAYER_LABELS) {
      const layer = seven_layers[key]
      if (!layer) continue
      const valor = typeof layer === 'string' ? layer : layer.valor
      const just = typeof layer === 'object' ? layer.justificativa : ''
      if (!valor) continue
      lines.push(`${label}: ${valor}`)
      if (just) lines.push(`   ${just}`)
    }
    if (seven_layers.coerencia) {
      lines.push('')
      lines.push(`Coerência & Variação: ${seven_layers.coerencia}`)
    }
  }
  return lines.join('\n')
}

// ─── Builder pro draft de copy (Escrever) ────────────────────────
// `comments` = array de { id, text, createdAt } da RichEditor do body

function stripHtml(html) {
  if (!html) return ''
  // Cria um div temporário pra deixar o browser limpar o HTML
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}

function htmlToTextPreservingComments(html, shared) {
  // Converte HTML do tiptap em texto preservando spans com data-comment-id.
  // Coloca marcadores ⟦#N⟧ no INÍCIO e no FIM do trecho comentado.
  // `shared` = { seen: Map(id->num), order: [ids] } pra numeração CONTÍNUA entre
  // vários campos (hooks + body). Se não passar, usa numeração local.
  const seen = shared?.seen || new Map()
  const order = shared?.order || []
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  div.querySelectorAll('span[data-comment-id]').forEach((span) => {
    const id = span.getAttribute('data-comment-id')
    if (!seen.has(id)) {
      seen.set(id, order.length + 1)
      order.push(id)
    }
    const num = seen.get(id)
    span.textContent = `[#${num}]${span.textContent}[#${num}]`
  })
  div.querySelectorAll('p, br, div').forEach((el) => {
    el.insertAdjacentText('beforebegin', '\n')
  })
  return (div.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}

// Código do ADS pra ser usado nos hooks: ex "01" → "ADS 01H1", "ADS 01H2"
function adsCode(meta) {
  const raw = (meta?.ads_number || '').toString().trim()
  if (!raw) return 'ADS'
  // Aceita "01", "#42", "ADS-001" — extrai só o identificador
  const cleaned = raw.replace(/^(ads[\s\-_]*|#)/i, '').trim() || raw
  return `ADS ${cleaned}`
}

export function buildCopyTxt(draft) {
  const { meta = {}, hooks = [], body = '', comments = [] } = draft || {}
  const lines = []
  const code = adsCode(meta)
  const title = meta.ads_number ? code : (meta.angle || 'Anúncio')

  lines.push(`── ${title}`)
  lines.push('='.repeat(60))
  lines.push('')

  // Metadados — chave em **negrito** (marcador para o exportador docx/pdf)
  const metaLines = [
    ['Nº do ADS',    meta.ads_number],
    ['Ângulo',       meta.angle],
    ['Formato',      meta.format],
    ['Avatar',       meta.avatar],
    ['Instruções',   meta.editing_notes],
    ['Vídeo Ref.',   meta.video_ref],
  ].filter(([, v]) => v && String(v).trim())
  if (metaLines.length) {
    lines.push('── INFORMAÇÕES')
    lines.push('-'.repeat(40))
    metaLines.forEach(([k, v]) => lines.push(`**${k}:** ${v}`))
    lines.push('')
  }

  // Numeração CONTÍNUA dos comentários entre hooks e body
  const shared = { seen: new Map(), order: [] }
  // Comentários (OBS) de um HTML específico, já com o número atribuído
  const obsFor = (html) => {
    const ids = [...String(html || '').matchAll(/data-comment-id="([^"]+)"/g)].map(m => m[1])
    const uniq = [...new Set(ids)]
    return uniq
      .map(id => ({ num: shared.seen.get(id), text: (comments.find(c => c.id === id) || {}).text }))
      .filter(x => x.num && x.text)
      .sort((a, b) => a.num - b.num)
  }

  // Hooks — cada hook vira variante: ADS 01H1, ADS 01H2… com as OBS logo abaixo
  const hookList = hooks.filter(h => stripHtml(h.html || h).trim())
  if (hookList.length) {
    lines.push('── HOOKS')
    lines.push('-'.repeat(40))
    hookList.forEach((h, i) => {
      const text = htmlToTextPreservingComments(h.html || h, shared).replace(/\n+/g, ' ').trim()
      lines.push(`**${code}H${i + 1}:** ${text}`)
      obsFor(h.html || h).forEach(o => lines.push(`OBS ${o.num}°: ${o.text}`))
      lines.push('')
    })
  }

  // Body com marcadores de comentário ([#N] abre e fecha) + OBS no final
  const bodyText = htmlToTextPreservingComments(body, shared)
  lines.push('── BODY')
  lines.push('-'.repeat(40))
  lines.push(bodyText)
  lines.push('')
  const bodyObs = obsFor(body)
  if (bodyObs.length) {
    bodyObs.forEach(o => lines.push(`OBS ${o.num}°: ${o.text}`))
    lines.push('')
  }

  return lines.join('\n')
}

export function buildOrganicTxt(result) {
  const { title, hook, body, transcript_full } = result
  const lines = []
  lines.push(`── ORGÂNICO — ${title || 'Sem título'}`)
  lines.push('='.repeat(60))
  lines.push('')
  lines.push('── HOOK')
  lines.push('-'.repeat(40))
  lines.push(hook || '')
  lines.push('')
  lines.push('── CORPO')
  lines.push('-'.repeat(40))
  lines.push(body || '')
  if (transcript_full) {
    lines.push('')
    lines.push('='.repeat(60))
    lines.push('── TRANSCRIÇÃO COMPLETA')
    lines.push('-'.repeat(40))
    lines.push(transcript_full)
  }
  return lines.join('\n')
}
