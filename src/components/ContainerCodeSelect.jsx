import { useState, useRef, useEffect, forwardRef } from 'react'
import { useTranslation } from 'react-i18next'

const ContainerCodeSelect = forwardRef(function ContainerCodeSelect({ codes = [], value, onChange }, ref) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const containerRef = useRef(null)

  const filtered = codes.filter(c =>
    c.code.toLowerCase().includes(query.toLowerCase()) ||
    c.description.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    if (!value) setQuery('')
    else setQuery(codeLabel(value))
  }, [value])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setQuery(value ? codeLabel(value) : '')
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [value])

  function codeLabel(c) {
    return c.description && c.description !== c.code
      ? `${c.code} — ${c.description}`
      : c.code
  }

  function handleSelect(c) {
    onChange(c)
    setQuery(codeLabel(c))
    setOpen(false)
    setActiveIdx(-1)
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      setOpen(false)
      onChange(null)
      setQuery('')
      return
    }
    if (!open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0 && filtered[activeIdx]) handleSelect(filtered[activeIdx])
      else if (filtered.length === 1) handleSelect(filtered[0])
      else setOpen(false)
    } else if (e.key === 'Tab') {
      const exact = filtered.find(c => c.code.toLowerCase() === query.toLowerCase())
      if (exact) {
        handleSelect(exact)
      } else if (activeIdx >= 0 && filtered[activeIdx]) {
        handleSelect(filtered[activeIdx])
      } else if (filtered.length === 1 && query) {
        handleSelect(filtered[0])
      }
      setOpen(false)
      // Don't preventDefault — Tab moves focus to next field naturally
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={ref}
        type="text"
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          setOpen(true)
          setActiveIdx(-1)
          if (!e.target.value) onChange(null)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={t('type_to_search')}
        style={{
          width: '100%', height: 44, padding: '0 12px',
          border: '1px solid var(--color-border)',
          borderRadius: 6, fontSize: 14, outline: 'none',
          background: 'white', boxSizing: 'border-box',
        }}
      />
      {open && filtered.length > 0 && (
        <div className="searchable-select-dropdown" style={{ width: '100%' }}>
          {filtered.map((c, i) => (
            <div
              key={c.code}
              className={`searchable-select-option${i === activeIdx ? ' active' : ''}`}
              onMouseDown={() => handleSelect(c)}
            >
              <strong style={{ color: 'var(--color-primary)' }}>{c.code}</strong>
              {c.description && c.description !== c.code && <>{' — '}{c.description}</>}
            </div>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && query && (
        <div className="searchable-select-dropdown" style={{ width: '100%' }}>
          <div className="searchable-select-option" style={{ color: 'var(--color-text-muted)' }}>
            {t('no_options')}
          </div>
        </div>
      )}
    </div>
  )
})

export default ContainerCodeSelect
