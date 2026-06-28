import { useEffect, useState } from 'react'
import { apiJson } from '../../shared/lib/api'
import { glass, micro } from '../creator/studioStyles'
import DrHoloEmblem from '../../shared/ui/DrHoloEmblem'

/* "סיכום פדגוגי" — ד"ר הולו כשכבת פרשנות. כפתור אחד שמכליל לפי הקשר
   (תלמיד / כיתה / הקצאה). הפלט מסומן כנכתב ע"י AI, נשמר עם timestamp,
   ניתן ליצירה-מחדש, לעריכת מורה (השכבה האחרונה), ולייצוא לוורד.
   מה שמיוצא הוא הפלט *אחרי* עריכת המורה. */
type Scope = 'student' | 'class' | 'assignment'

interface SummaryRow {
  id: string | null
  content: string
  edited_content?: string | null
  model?: string | null
  sample_size?: number | null
  created_at?: string
  updated_at?: string
}

function ts(s?: string): string {
  if (!s) return ''
  return new Date(s).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/* ייצוא לוורד — מסמך HTML עם דיר RTL ש-Word פותח כ-.doc (ללא תלות חיצונית).
   כותרת + שם הישות + תאריך + הטקסט (אחרי עריכת המורה). */
function exportToWord(title: string, body: string) {
  const dateStr = new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
  const paras = body.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br/>')}</p>`).join('')
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8">
<style>body{font-family:Arial,sans-serif;direction:rtl;text-align:right;margin:40px}
h1{font-size:18pt;color:#3a1d6e}.meta{color:#666;font-size:10pt;margin-bottom:18pt}
p{font-size:12pt;line-height:1.7}</style></head><body>
<h1>סיכום פדגוגי — ${esc(title)}</h1>
<p class="meta">נכתב על ידי ד״ר הולו (AI) · ${esc(dateStr)}</p>
${paras}</body></html>`
  const blob = new Blob(['﻿', html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `סיכום-פדגוגי-${title.replace(/[\\/:*?"<>|]/g, '')}.doc`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

export default function PedagogicalSummary({ scope, id, title }: { scope: Scope; id: string; title?: string }) {
  const [summary, setSummary] = useState<SummaryRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setSummary(null); setForbidden(null); setError(null); setEditing(false)
    apiJson<{ summary: SummaryRow | null }>(`/api/analytics/summary?scope=${scope}&id=${id}`)
      .then((b) => { if (!cancelled) { setSummary(b.summary); setLoading(false) } })
      .catch((e: Error) => {
        if (cancelled) return
        if (/גישה|זמין/.test(e.message)) setForbidden(e.message)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [scope, id])

  async function generate(regenerate: boolean) {
    setGenerating(true); setError(null); setEditing(false)
    try {
      const b = await apiJson<{ summary: SummaryRow }>(`/api/analytics/summary`, {
        method: 'POST',
        body: JSON.stringify({ scope, id, regenerate }),
      })
      setSummary(b.summary)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  async function saveEdit() {
    if (!summary) return
    setSaving(true); setError(null)
    try {
      if (summary.id) {
        const b = await apiJson<{ summary: SummaryRow }>(`/api/analytics/summary`, {
          method: 'PATCH',
          body: JSON.stringify({ scope, id, edited_content: draft }),
        })
        setSummary(b.summary)
      } else {
        /* טרם נשמר ב-DB (לפני המיגרציה) — שומרים מקומית לסשן הנוכחי */
        setSummary({ ...summary, edited_content: draft, updated_at: new Date().toISOString() })
      }
      setEditing(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null
  if (forbidden) return (
    <div style={{ ...glass, padding: '12px 16px', fontSize: 12.5, color: '#8aa0b8', display: 'flex', alignItems: 'center', gap: 7 }}><DrHoloEmblem size={16} /> {forbidden}</div>
  )

  const text = summary?.edited_content?.trim() || summary?.content || ''
  const edited = !!summary?.edited_content?.trim()
  const exportTitle = title || 'סיכום'
  const btn = (extra: React.CSSProperties = {}): React.CSSProperties => ({ fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 9, cursor: 'pointer', background: 'rgba(136,85,255,.08)', border: '1px solid rgba(136,85,255,.4)', color: '#cdb6ff', ...extra })

  return (
    <div style={{ ...glass, padding: 20, borderColor: 'rgba(136,85,255,0.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ display: 'inline-flex' }}><DrHoloEmblem size={20} /></span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#cdb6ff' }}>סיכום פדגוגי</div>
            <div style={{ ...micro, fontSize: 8.5, color: 'rgba(180,150,255,.7)' }}>נכתב ע״י ד״ר הולו · AI{edited ? ' · נערך ע״י המורה' : ''}</div>
          </div>
        </div>
        {summary && !editing && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => { setDraft(text); setEditing(true) }} style={btn()}>✏️ ערוך</button>
            <button onClick={() => exportToWord(exportTitle, text)} style={btn()}>⬇ ייצא לוורד</button>
            <button onClick={() => generate(true)} disabled={generating} style={btn(generating ? { color: '#7a6aa8', cursor: 'default' } : {})}>{generating ? '✦ כותב…' : '↻ צור מחדש'}</button>
          </div>
        )}
      </div>

      {error && <p style={{ color: '#ff9bb3', fontSize: 13, marginTop: 12 }}>⚠️ {error}</p>}

      {!summary && !generating && (
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#9fb6cf', marginBottom: 12 }}>ד״ר הולו יקרא את הנתונים ויכתוב סיכום פדגוגי בשפה אנושית — תצפיות מבוססות-נתונים, לא אבחנות.</p>
          <button onClick={() => generate(false)}
            style={{ fontSize: 14, fontWeight: 800, color: '#1a0b2e', padding: '11px 26px', borderRadius: 11, cursor: 'pointer', background: 'linear-gradient(135deg, #b18bff, #8855ff)', border: 'none', boxShadow: '0 0 20px rgba(136,85,255,.45)' }}>
            ✦ צור סיכום פדגוגי
          </button>
        </div>
      )}

      {generating && !summary && (
        <p style={{ marginTop: 14, fontSize: 13, color: '#cdb6ff', textAlign: 'center' }}>✦ ד״ר הולו כותב את הסיכום…</p>
      )}

      {summary && editing && (
        <div style={{ marginTop: 14 }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={9}
            style={{ width: '100%', resize: 'vertical', background: 'rgba(4,9,18,.6)', border: '1px solid rgba(136,85,255,.4)', borderRadius: 10, color: '#e6eefc', fontSize: 14, lineHeight: 1.7, fontFamily: 'var(--font-display)', padding: '12px 14px', outline: 'none' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setEditing(false)} style={btn({ color: '#9fb6cf', background: 'transparent', border: '1px solid rgba(120,200,255,.25)' })}>ביטול</button>
            <button onClick={saveEdit} disabled={saving} style={{ ...btn({ color: '#1a0b2e', background: 'linear-gradient(135deg, #b18bff, #8855ff)', border: 'none' }) }}>{saving ? 'שומר…' : 'שמור עריכה'}</button>
          </div>
        </div>
      )}

      {summary && !editing && (
        <>
          <p style={{ marginTop: 14, fontSize: 14.5, lineHeight: 1.7, color: '#e6eefc', whiteSpace: 'pre-wrap' }}>{text}</p>
          <div style={{ ...micro, fontSize: 8.5, marginTop: 14, color: 'rgba(140,170,200,.55)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>נוצר: {ts(summary.updated_at || summary.created_at)}</span>
            {summary.sample_size != null && <span>· מבוסס על {summary.sample_size} הדמיות</span>}
          </div>
        </>
      )}
    </div>
  )
}
