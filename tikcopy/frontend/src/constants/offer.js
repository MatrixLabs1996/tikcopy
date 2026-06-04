// Tipos de produto e funil de uma oferta.
// Cada projeto É uma oferta (1:1).

export const PRODUCT_TYPES = [
  { id: 'nutra', label: 'Nutra (suplemento/saúde)' },
  { id: 'info', label: 'Infoproduto (curso/ebook)' },
  { id: 'app', label: 'App / SaaS' },
  { id: 'mentoria', label: 'Mentoria / Consultoria' },
  { id: 'ecom', label: 'E-commerce / Físico' },
  { id: 'servico', label: 'Serviço' },
  { id: 'outro', label: 'Outro' },
]

// hasVsl = funil normalmente tem uma VSL pra transcrever.
export const FUNNEL_TYPES = [
  { id: 'vsl', label: 'VSL (Video Sales Letter)', hasVsl: true },
  { id: 'tsl', label: 'TSL (Text Sales Letter)', hasVsl: false },
  { id: 'quiz', label: 'Quiz', hasVsl: false },
  { id: 'quiz_minivsl', label: 'Quiz + Mini VSL', hasVsl: true },
  { id: 'advertorial', label: 'Advertorial', hasVsl: false },
  { id: 'wpp', label: 'WhatsApp (WPP)', hasVsl: false },
  { id: 'lead', label: 'Captura de Lead', hasVsl: false },
  { id: 'outro', label: 'Outro', hasVsl: false },
]

export const funnelHasVSL = (funnelId) =>
  FUNNEL_TYPES.find((f) => f.id === funnelId)?.hasVsl ?? false

export const productTypeLabel = (id) =>
  PRODUCT_TYPES.find((p) => p.id === id)?.label || id || ''

export const funnelTypeLabel = (id) =>
  FUNNEL_TYPES.find((f) => f.id === id)?.label || id || ''
