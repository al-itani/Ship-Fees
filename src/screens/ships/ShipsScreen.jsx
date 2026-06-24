import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../context/SessionContext.jsx'

export default function ShipsScreen() {
  const { t } = useTranslation()
  const { session } = useSession()
  const [ships, setShips]       = useState([])
  const [editId, setEditId]     = useState(null)
  const [form, setForm]         = useState({ name: '', loa: '' })
  const [saving, setSaving]     = useState(false)
  const [toast, setToast]       = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const res = await window.api.shipsGetAll()
    if (res.success) setShips(res.data)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function startEdit(ship) {
    setEditId(ship.id)
    setForm({ name: ship.name, loa: ship.loa != null ? String(ship.loa) : '' })
  }

  function cancelEdit() {
    setEditId(null)
    setForm({ name: '', loa: '' })
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    const loa = form.loa ? parseFloat(form.loa) : null
    const res = editId
      ? await window.api.shipsUpdate(editId, form.name, loa, session?.id)
      : await window.api.shipsCreate(form.name, loa, session?.id)
    setSaving(false)
    if (res.success) {
      showToast(editId ? t('record_updated') : t('record_saved'))
      cancelEdit()
      load()
    } else {
      showToast(res.error || 'Error', 'error')
    }
  }

  async function handleDelete(id) {
    const ok = await window.api.dialogConfirm({ title: t('confirm_delete'), message: t('confirm_delete') })
    if (!ok) return
    const res = await window.api.shipsDelete(id, session?.id)
    if (res.success) { showToast(t('record_deleted')); load() }
    else showToast(res.error || 'Error', 'error')
  }

  const fieldStyle = {
    height: 38, padding: '0 10px', borderRadius: 6,
    border: '1px solid var(--color-border)', fontSize: 14,
  }

  return (
    <div className="app-screen" style={{ padding: 28, maxWidth: 700 }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 99999,
          background: toast.type === 'success' ? 'var(--color-success)' : 'var(--color-danger)',
          color: 'white', borderRadius: 8, padding: '12px 20px', fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {toast.msg}
        </div>
      )}

      <h2 style={{ margin: '0 0 24px', fontSize: 20, fontWeight: 700, color: 'var(--color-text)' }}>
        🚢 {t('ships')}
      </h2>

      {/* Add / Edit form */}
      <div style={{ background: 'white', borderRadius: 8, padding: '20px 24px', border: '1px solid var(--color-border)', marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: 'var(--color-text)' }}>
          {editId ? t('edit') : t('add_ship')}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            style={{ ...fieldStyle, flex: '2 1 200px' }}
            placeholder={t('vessel_name')}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <input
            style={{ ...fieldStyle, flex: '1 1 100px', width: 120 }}
            type="number" min="0" step="0.01"
            placeholder={t('loa')}
            value={form.loa}
            onChange={e => setForm(f => ({ ...f, loa: e.target.value }))}
          />
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            style={{
              height: 38, padding: '0 20px', borderRadius: 6, border: 'none',
              background: saving || !form.name.trim() ? '#B0BEC5' : 'var(--color-primary)',
              color: 'white', fontSize: 14, fontWeight: 600,
              cursor: saving || !form.name.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? '...' : (editId ? t('edit') : t('add_ship'))}
          </button>
          {editId && (
            <button
              onClick={cancelEdit}
              style={{ height: 38, padding: '0 16px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'white', fontSize: 14, cursor: 'pointer' }}
            >
              {t('cancel')}
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div style={{ background: 'white', borderRadius: 8, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
        {ships.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 14 }}>
            {t('no_records')}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F0F4FF' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#1B2A4A', borderBottom: '2px solid #D0D8EC' }}>
                  {t('vessel_name')}
                </th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: '#1B2A4A', borderBottom: '2px solid #D0D8EC', width: 120 }}>
                  {t('loa')} (m)
                </th>
                <th style={{ padding: '10px 16px', borderBottom: '2px solid #D0D8EC', width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {ships.map(s => (
                <tr key={s.id}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFF'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 16px', fontSize: 14, borderBottom: '1px solid #EEF0F6' }}>{s.name}</td>
                  <td style={{ padding: '10px 16px', fontSize: 14, textAlign: 'right', borderBottom: '1px solid #EEF0F6' }}>
                    <span className="num-ltr">{s.loa != null ? s.loa : '—'}</span>
                  </td>
                  <td style={{ padding: '10px 16px', borderBottom: '1px solid #EEF0F6', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => startEdit(s)}
                        style={{ padding: '4px 12px', borderRadius: 5, border: '1px solid var(--color-border)', background: 'white', fontSize: 12, cursor: 'pointer' }}>
                        {t('edit')}
                      </button>
                      <button onClick={() => handleDelete(s.id)}
                        style={{ padding: '4px 12px', borderRadius: 5, border: 'none', background: 'var(--color-danger)', color: 'white', fontSize: 12, cursor: 'pointer' }}>
                        {t('delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
