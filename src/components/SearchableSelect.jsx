import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export default function SearchableSelect({ options = [], value, onChange, placeholder, disabled }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const filtered = options.filter(o =>
    o.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  useEffect(() => {
    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setQuery(value || '')
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [value])

  function handleInputChange(e) {
    setQuery(e.target.value)
    setOpen(true)
    setActiveIdx(-1)
    if (e.target.value === '') onChange('')
  }

  function handleSelect(opt) {
    onChange(opt)
    setQuery(opt)
    setOpen(false)
    setActiveIdx(-1)
  }

  function handleKeyDown(e) {
    if (!open) { if (e.key === 'ArrowDown') setOpen(true); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0 && filtered[activeIdx]) handleSelect(filtered[activeIdx])
      else setOpen(false)
    } else if (e.key === 'Tab') {
      if (activeIdx >= 0 && filtered[activeIdx]) {
        handleSelect(filtered[activeIdx])
      } else if (filtered.length === 1 && query) {
        handleSelect(filtered[0])
      }
      setOpen(false)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery(value || '')
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || t('type_to_search')}
        disabled={disabled}
        style={{
          width: '100%',
          height: 44,
          padding: '0 12px',
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          fontSize: 14,
          outline: 'none',
          background: disabled ? '#f5f5f5' : 'white',
        }}
      />
      {open && filtered.length > 0 && (
        <div className="searchable-select-dropdown" style={{ width: '100%' }}>
          {filtered.map((opt, i) => (
            <div
              key={opt}
              className={`searchable-select-option${i === activeIdx ? ' active' : ''}`}
              onMouseDown={() => handleSelect(opt)}
            >
              {opt}
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
}
