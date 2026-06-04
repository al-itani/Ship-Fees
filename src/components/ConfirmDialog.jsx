import { useTranslation } from 'react-i18next'

export default function ConfirmDialog({ title, message, onConfirm, onCancel, confirmLabel, cancelLabel, danger }) {
  const { t } = useTranslation()
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
    }}>
      <div style={{
        background: 'white', borderRadius: 10, padding: 28, minWidth: 340, maxWidth: 480,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        {title && (
          <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
            {title}
          </h3>
        )}
        <p style={{ margin: '0 0 24px', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '10px 20px', borderRadius: 6, border: '1px solid var(--color-border)',
            background: 'white', cursor: 'pointer', fontSize: 14,
          }}>
            {cancelLabel || t('cancel')}
          </button>
          <button onClick={onConfirm} style={{
            padding: '10px 20px', borderRadius: 6, border: 'none',
            background: danger ? 'var(--color-danger)' : 'var(--color-primary)',
            color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}>
            {confirmLabel || t('confirm_save')}
          </button>
        </div>
      </div>
    </div>
  )
}
