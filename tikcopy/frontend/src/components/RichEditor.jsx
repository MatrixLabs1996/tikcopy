import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'
import { Mark, mergeAttributes } from '@tiptap/core'
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Highlighter, LinkIcon, ImageIcon, MessageSquare, X, Check,
  Sparkles, Loader2, RefreshCw,
} from 'lucide-react'

// ── Custom Comment Mark ───────────────────────────────────────
const CommentMark = Mark.create({
  name: 'comment',
  addAttributes() {
    return { commentId: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'span[data-comment-id]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-comment-id': HTMLAttributes.commentId, class: 'tc-comment-mark' }), 0]
  },
})

// ── Toolbar Button ────────────────────────────────────────────
function TBtn({ onClick, active, title, children, disabled }) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      disabled={disabled}
      title={title}
      style={{
        padding: '4px 7px', borderRadius: '5px', border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: active ? 'var(--bg-active)' : 'transparent',
        color: active ? 'var(--text-primary)' : disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  )
}

const SEP = () => <div style={{ width: '1px', background: 'var(--border-default)', margin: '0 4px', alignSelf: 'stretch' }} />

// ── Highlight Color Picker ────────────────────────────────────
const HIGHLIGHT_COLORS = [
  { color: '#fef08a', label: 'Amarelo' },
  { color: '#bbf7d0', label: 'Verde' },
  { color: '#bfdbfe', label: 'Azul' },
  { color: '#fecdd3', label: 'Rosa' },
  { color: '#e9d5ff', label: 'Roxo' },
]

function HighlightPicker({ editor, onClose }) {
  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: '4px',
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      borderRadius: '8px', padding: '8px', display: 'flex', gap: '6px', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    }}>
      {HIGHLIGHT_COLORS.map(({ color, label }) => (
        <button
          key={color}
          onMouseDown={(e) => {
            e.preventDefault()
            editor.chain().focus().setHighlight({ color }).run()
            onClose()
          }}
          title={label}
          style={{
            width: '22px', height: '22px', borderRadius: '4px', border: '2px solid transparent',
            background: color, cursor: 'pointer',
          }}
        />
      ))}
      <button
        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetHighlight().run(); onClose() }}
        title="Remover marca"
        style={{
          width: '22px', height: '22px', borderRadius: '4px', border: '1px solid var(--border-default)',
          background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <X size={11} color="var(--text-muted)" />
      </button>
    </div>
  )
}

// ── URL Input Popup ───────────────────────────────────────────
function UrlPopup({ placeholder, onConfirm, onClose }) {
  const [val, setVal] = useState('')
  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: '4px',
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      borderRadius: '8px', padding: '10px', display: 'flex', gap: '6px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)', minWidth: '280px',
    }}>
      <input
        autoFocus
        className="tc-input"
        placeholder={placeholder}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(val); if (e.key === 'Escape') onClose() }}
        style={{ flex: 1, fontSize: '12px' }}
      />
      <button onMouseDown={(e) => { e.preventDefault(); onConfirm(val) }} style={{ background: 'var(--accent)', border: 'none', borderRadius: '6px', padding: '0 10px', cursor: 'pointer', color: '#fff' }}>
        <Check size={13} />
      </button>
      <button onMouseDown={(e) => { e.preventDefault(); onClose() }} style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '0 8px', cursor: 'pointer', color: 'var(--text-muted)' }}>
        <X size={13} />
      </button>
    </div>
  )
}

// ── Comment Input Popup ───────────────────────────────────────
function CommentPopup({ onConfirm, onClose }) {
  const [val, setVal] = useState('')
  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: '4px',
      background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
      borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)', minWidth: '260px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Comentário</div>
      <textarea
        autoFocus
        className="tc-input tc-textarea"
        placeholder="Escreva seu comentário..."
        value={val}
        onChange={(e) => setVal(e.target.value)}
        rows={3}
        style={{ fontSize: '12px', resize: 'none' }}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) onConfirm(val) }}
      />
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
        <button onMouseDown={(e) => { e.preventDefault(); onClose() }} style={{ padding: '5px 10px', borderRadius: '6px', background: 'transparent', border: '1px solid var(--border-default)', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font)' }}>Cancelar</button>
        <button onMouseDown={(e) => { e.preventDefault(); onConfirm(val) }} disabled={!val.trim()} style={{ padding: '5px 12px', borderRadius: '6px', background: 'var(--accent)', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#fff', fontFamily: 'var(--font)' }}>Adicionar</button>
      </div>
    </div>
  )
}

// ── Toolbar ───────────────────────────────────────────────────
function Toolbar({ editor, comments, onAddComment, onDeleteComment, sticky }) {
  const [popup, setPopup] = useState(null) // 'highlight' | 'link' | 'image' | 'comment'
  const [, forceTick] = useState(0)
  const fileInputRef = useRef(null)

  // Re-renderiza toolbar sempre que a seleção mudar (pra ativar/desativar botões)
  useEffect(() => {
    if (!editor) return
    const update = () => forceTick((n) => n + 1)
    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
    }
  }, [editor])

  const closePopup = useCallback(() => setPopup(null), [])

  const handleLink = (url) => {
    if (!url) { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().setLink({ href: url, target: '_blank' }).run()
    closePopup()
  }

  const handleImageFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result }).run()
    }
    reader.readAsDataURL(file)
  }

  const handleComment = (text) => {
    if (!text.trim()) return closePopup()
    const id = `c-${Date.now()}`
    editor.chain().focus().setMark('comment', { commentId: id }).run()
    onAddComment({ id, text, createdAt: new Date().toISOString() })
    closePopup()
  }

  const hasSelection = editor?.state.selection && !editor.state.selection.empty

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '2px', padding: '6px 10px',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--bg-surface)', borderRadius: '8px 8px 0 0',
      flexWrap: 'wrap',
      position: sticky ? 'sticky' : 'relative',
      top: sticky ? 0 : undefined,
      zIndex: sticky ? 5 : undefined,
    }}>
      <TBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor?.isActive('bold')} title="Negrito (⌘B)">
        <Bold size={13} />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor?.isActive('italic')} title="Itálico (⌘I)">
        <Italic size={13} />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor?.isActive('underline')} title="Sublinhado (⌘U)">
        <UnderlineIcon size={13} />
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor?.isActive('strike')} title="Tachado">
        <Strikethrough size={13} />
      </TBtn>

      <SEP />

      <div style={{ position: 'relative' }}>
        <TBtn onClick={() => setPopup(popup === 'highlight' ? null : 'highlight')} active={editor?.isActive('highlight')} title="Marca-texto">
          <Highlighter size={13} />
        </TBtn>
        {popup === 'highlight' && <HighlightPicker editor={editor} onClose={closePopup} />}
      </div>

      <SEP />

      <div style={{ position: 'relative' }}>
        <TBtn
          onClick={() => setPopup(popup === 'link' ? null : 'link')}
          active={editor?.isActive('link')}
          disabled={!hasSelection && !editor?.isActive('link')}
          title={hasSelection || editor?.isActive('link') ? 'Inserir link' : 'Selecione o texto primeiro'}
        >
          <LinkIcon size={13} />
        </TBtn>
        {popup === 'link' && <UrlPopup placeholder="https://..." onConfirm={handleLink} onClose={closePopup} />}
      </div>

      <div style={{ position: 'relative' }}>
        <TBtn onClick={() => fileInputRef.current?.click()} title="Inserir imagem do computador">
          <ImageIcon size={13} />
        </TBtn>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageFile}
          style={{ display: 'none' }}
        />
      </div>

      <SEP />

      <div style={{ position: 'relative' }}>
        <TBtn onClick={() => setPopup(popup === 'comment' ? null : 'comment')} disabled={!hasSelection} title="Adicionar comentário (selecione texto primeiro)" active={popup === 'comment'}>
          <MessageSquare size={13} />
        </TBtn>
        {popup === 'comment' && <CommentPopup onConfirm={handleComment} onClose={closePopup} />}
      </div>

      {comments.length > 0 && (
        <div style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>
          {comments.length} comentário{comments.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}

// ── Comments Panel ────────────────────────────────────────────
function CommentsPanel({ comments, onDelete }) {
  if (comments.length === 0) return null
  return (
    <div style={{
      marginTop: '8px', borderRadius: '8px', border: '1px solid var(--border-default)',
      background: 'var(--bg-elevated)', overflow: 'hidden',
    }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Comentários
      </div>
      {comments.map((c) => (
        <div key={c.id} style={{
          padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', gap: '10px', alignItems: 'flex-start',
        }}>
          <div style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: 'var(--accent)', flexShrink: 0, marginTop: '5px',
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: '1.5' }}>{c.text}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {new Date(c.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <button
            onClick={() => onDelete(c.id)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', flexShrink: 0 }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ── (C) Improve Selection Modal ───────────────────────────────
function ImproveModal({ selection, instruction, onInstructionChange, loading, results, onRun, onApply, onClose }) {
  // Versões editáveis: o copy pode ajustar/combinar antes de substituir.
  const [edited, setEdited] = useState([])
  useEffect(() => { setEdited(results || []) }, [results])
  const updateAt = (i, val) => setEdited((prev) => prev.map((t, idx) => (idx === i ? val : t)))

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
          borderRadius: '12px', width: '100%', maxWidth: '620px', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600 }}>
            <Sparkles size={16} style={{ color: 'var(--accent)' }} /> Melhorar trecho com IA
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>

        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Trecho selecionado</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, maxHeight: '90px', overflowY: 'auto', background: 'var(--bg-elevated)', borderRadius: '7px', padding: '8px 10px' }}>
            {selection}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <input
              className="tc-input"
              value={instruction}
              onChange={(e) => onInstructionChange(e.target.value)}
              placeholder='Como melhorar? Ex: "mais emoção", "mais curto", "mais específico"…'
              style={{ flex: 1, fontSize: '12px' }}
              onKeyDown={(e) => { if (e.key === 'Enter') onRun() }}
            />
            <button
              onClick={onRun}
              disabled={loading}
              style={{
                padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                background: 'var(--accent)', border: 'none', color: '#fff',
                cursor: loading ? 'wait' : 'pointer', fontFamily: 'var(--font)',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              {loading
                ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Melhorando…</>
                : results.length ? <><RefreshCw size={12} /> De novo</> : <><Sparkles size={12} /> Melhorar</>}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
          {loading && results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 10px', color: 'var(--accent)' }} />
              Reescrevendo…
            </div>
          ) : results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
              Clique em “Melhorar” pra gerar versões deste trecho.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Edite à vontade: pode pegar partes de uma versão e juntar na outra antes de substituir.
              </div>
              {edited.map((r, i) => (
                <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <textarea
                    value={r}
                    onChange={(e) => updateAt(i, e.target.value)}
                    rows={Math.min(16, Math.max(4, Math.ceil((r || '').length / 70)))}
                    style={{
                      fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5,
                      width: '100%', boxSizing: 'border-box', resize: 'vertical',
                      background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
                      borderRadius: '6px', padding: '8px 10px', fontFamily: 'var(--font)',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => onApply(r)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 500 }}>
                      <Check size={11} /> Substituir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Rich Editor (exported) ────────────────────────────────────
export default function RichEditor({ placeholder = 'Escreva aqui...', onChange, onCommentsChange, minHeight = 120, stickyToolbar = false, initialContent = '', initialComments = [], onImproveSelection }) {
  const [comments, setComments] = useState(initialComments)
  const [hoveredComment, setHoveredComment] = useState(null) // { id, x, y }
  const editorWrapperRef = useRef(null)
  // ── (C) Melhorar seleção com IA ──
  const [selTrigger, setSelTrigger] = useState(null)   // { top, left } botão flutuante
  const [improver, setImprover] = useState(null)       // { from, to, text }
  const [improving, setImproving] = useState(false)
  const [improveResults, setImproveResults] = useState([])
  const [improveInstruction, setImproveInstruction] = useState('')

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false }),
      Image,
      Underline,
      CommentMark,
    ],
    content: initialContent || undefined,
    editorProps: {
      attributes: {
        style: `outline: none; min-height: ${minHeight}px; padding: 12px 14px; font-size: 13px; line-height: 1.7; color: var(--text-primary); font-family: var(--font);`,
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
  })

  // Reset quando initialContent muda significativamente (ex: trocar de draft)
  useEffect(() => {
    if (editor && initialContent !== undefined && editor.getHTML() !== initialContent && initialContent !== '') {
      editor.commands.setContent(initialContent, false)
      setComments(initialComments || [])
    }
  }, [initialContent, editor])

  const addComment = useCallback((comment) => {
    setComments((prev) => [...prev, comment])
    onCommentsChange?.([...comments, comment])
  }, [comments, onCommentsChange])

  const deleteComment = useCallback((id) => {
    // Tira o highlight do texto: percorre o doc e remove a mark com aquele commentId
    if (editor) {
      const { state } = editor
      const tr = state.tr
      state.doc.descendants((node, pos) => {
        if (!node.isText) return
        node.marks.forEach((mark) => {
          if (mark.type.name === 'comment' && mark.attrs.commentId === id) {
            tr.removeMark(pos, pos + node.nodeSize, mark)
          }
        })
      })
      if (tr.docChanged) editor.view.dispatch(tr)
    }
    setComments((prev) => prev.filter((c) => c.id !== id))
  }, [editor])

  // Hover nas spans .tc-comment-mark → mostra tooltip com o texto do comentário
  useEffect(() => {
    const wrap = editorWrapperRef.current
    if (!wrap) return

    const handleOver = (e) => {
      const target = e.target.closest('.tc-comment-mark')
      if (!target) return
      const id = target.getAttribute('data-comment-id')
      if (!id) return
      const rect = target.getBoundingClientRect()
      const wrapRect = wrap.getBoundingClientRect()
      setHoveredComment({
        id,
        x: rect.left - wrapRect.left + rect.width / 2,
        y: rect.bottom - wrapRect.top + 6,
      })
    }
    const handleOut = (e) => {
      const target = e.target.closest('.tc-comment-mark')
      if (!target) return
      // Só esconde se realmente saiu (não foi pra um filho)
      const related = e.relatedTarget
      if (related && target.contains(related)) return
      setHoveredComment(null)
    }

    wrap.addEventListener('mouseover', handleOver)
    wrap.addEventListener('mouseout', handleOut)
    return () => {
      wrap.removeEventListener('mouseover', handleOver)
      wrap.removeEventListener('mouseout', handleOut)
    }
  }, [editor])

  const hoveredCommentObj = hoveredComment ? comments.find((c) => c.id === hoveredComment.id) : null

  // ── (C) Mostra o botão flutuante "Melhorar" quando há seleção ──
  useEffect(() => {
    if (!editor || !onImproveSelection) return
    const update = () => {
      const sel = editor.state.selection
      if (!sel || sel.empty) { setSelTrigger(null); return }
      const text = editor.state.doc.textBetween(sel.from, sel.to, ' ')
      if (!text.trim()) { setSelTrigger(null); return }
      try {
        const wrap = editorWrapperRef.current
        if (!wrap) return
        const coords = editor.view.coordsAtPos(sel.from)
        const wrapRect = wrap.getBoundingClientRect()
        setSelTrigger({
          top: coords.top - wrapRect.top + wrap.scrollTop - 34,
          left: Math.max(4, coords.left - wrapRect.left),
        })
      } catch { setSelTrigger(null) }
    }
    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
    }
  }, [editor, onImproveSelection])

  const openImprover = () => {
    if (!editor) return
    const { from, to } = editor.state.selection
    const text = editor.state.doc.textBetween(from, to, ' ')
    if (!text.trim()) return
    setImprover({ from, to, text })
    setImproveResults([])
    setImproveInstruction('')
    setSelTrigger(null)
  }

  const runImprove = async () => {
    if (!improver || !onImproveSelection) return
    setImproving(true)
    try {
      const out = await onImproveSelection(improver.text, improveInstruction)
      setImproveResults(Array.isArray(out) ? out : (out ? [out] : []))
    } finally {
      setImproving(false)
    }
  }

  const applyImprove = (text) => {
    if (!editor || !improver) return
    editor.chain().focus().insertContentAt({ from: improver.from, to: improver.to }, text).run()
    setImprover(null)
    setImproveResults([])
  }

  return (
    <div>
      <div
        ref={editorWrapperRef}
        style={{
          position: 'relative',
          border: '1px solid var(--border-default)', borderRadius: '8px',
          // overflow visível pra os pop-ups da toolbar (comentário, link, etc.) não
          // serem cortados em editores curtos (ex: hooks). O conteúdo não vaza.
          overflow: 'visible',
          background: 'var(--bg-base)',
        }}
      >
        {editor && (
          <Toolbar editor={editor} comments={comments} onAddComment={addComment} onDeleteComment={deleteComment} sticky={stickyToolbar} />
        )}
        <EditorContent editor={editor} />
        {!editor?.getText() && (
          <div style={{
            position: 'absolute', pointerEvents: 'none',
            fontSize: '13px', color: 'var(--text-muted)',
          }} />
        )}

        {/* Tooltip flutuante no hover do trecho comentado */}
        {hoveredCommentObj && (
          <div
            style={{
              position: 'absolute',
              left: hoveredComment.x, top: hoveredComment.y,
              transform: 'translateX(-50%)',
              zIndex: 100, pointerEvents: 'none',
              background: '#1f2937', color: '#fff',
              padding: '8px 12px', borderRadius: '8px',
              fontSize: '12px', maxWidth: '280px', lineHeight: 1.5,
              boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
              fontFamily: 'var(--font)',
            }}
          >
            <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6, marginBottom: '3px', fontWeight: 600 }}>
              Comentário
            </div>
            {hoveredCommentObj.text}
          </div>
        )}

        {/* (C) Botão flutuante "Melhorar com IA" sobre a seleção */}
        {onImproveSelection && selTrigger && !improver && (
          <button
            onMouseDown={(e) => { e.preventDefault(); openImprover() }}
            style={{
              position: 'absolute', top: selTrigger.top, left: selTrigger.left, zIndex: 60,
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '5px 10px', borderRadius: '7px', fontSize: '11px', fontWeight: 600,
              background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer',
              fontFamily: 'var(--font)', boxShadow: '0 4px 14px rgba(255,62,94,0.45)',
            }}
          >
            <Sparkles size={12} /> Melhorar com IA
          </button>
        )}
      </div>

      {/* (C) Modal de melhoria do trecho selecionado */}
      {improver && (
        <ImproveModal
          selection={improver.text}
          instruction={improveInstruction}
          onInstructionChange={setImproveInstruction}
          loading={improving}
          results={improveResults}
          onRun={runImprove}
          onApply={applyImprove}
          onClose={() => { setImprover(null); setImproveResults([]) }}
        />
      )}

      <CommentsPanel comments={comments} onDelete={deleteComment} />
      <style>{`
        .tc-comment-mark {
          background: rgba(254, 240, 138, 0.4);
          border-bottom: 2px dotted rgba(202, 138, 4, 0.8);
          cursor: pointer;
        }
        .ProseMirror p { margin: 0 0 4px; }
        .ProseMirror p:last-child { margin-bottom: 0; }
        .ProseMirror a { color: var(--accent); text-decoration: underline; }
        .ProseMirror img { max-width: 100%; border-radius: 6px; margin: 8px 0; }
        .ProseMirror:focus { outline: none; }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--text-muted);
          pointer-events: none;
          height: 0;
        }
      `}</style>
    </div>
  )
}
