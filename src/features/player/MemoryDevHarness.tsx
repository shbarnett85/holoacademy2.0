import { useState } from 'react'
import MemoryChallenge from './challenges/MemoryChallenge'
import type { Puzzle } from './useGameEngine'

/* ── עמוד הרצה למשחק הזיכרון (DEV בלבד, ‎/dev/memory) ──
   פריסות שונות (6/12/20 קלפים) וטקסטים קצרים/ארוכים, לבדיקת מידות קבועות
   והתאמת פונט. לא נטען בפרודקשן (route תחת import.meta.env.DEV). */

const SHORT = [
  { a: 'שמש', b: 'כוכב' }, { a: 'ירח', b: 'לוויין' }, { a: 'מאדים', b: 'אדום' },
]
const LONG = [
  { a: 'הלקח נשמר בזיכרון טוב יותר', b: 'חזרה מרווחת לאורך זמן' },
  { a: 'הפוטוסינתזה מייצרת חמצן', b: 'תהליך שמתרחש בעלים הירוקים' },
  { a: 'מערכת העיכול מפרקת מזון', b: 'חומרי הזנה נספגים במעי הדק' },
  { a: 'הלב שואב דם לכל הגוף', b: 'שריר שפועל בלי הפסקה' },
  { a: 'הריאות קולטות חמצן מהאוויר', b: 'חילוף גזים בנאדיות הריאה' },
  { a: 'המוח מעבד את כל המידע', b: 'מרכז הבקרה של מערכת העצבים' },
]
const MIXED = [
  ...LONG.slice(0, 7),
  { a: 'עצם', b: 'שלד' }, { a: 'דם', b: 'ורידים' }, { a: 'עור', b: 'מגן' }, { a: 'תא', b: 'יחידה' },
]

const PRESETS: { key: string; label: string; pairs: { a: string; b: string }[] }[] = [
  { key: 's6', label: '6 קלפים · קצר', pairs: SHORT },
  { key: 'l12', label: '12 קלפים · ארוך', pairs: LONG },
  { key: 'm20', label: '20 קלפים · מעורב', pairs: [...LONG, ...MIXED.slice(6)].slice(0, 10) },
]

export default function MemoryDevHarness() {
  const [preset, setPreset] = useState(PRESETS[0])
  const [runId, setRunId] = useState(0)
  const puzzle = {
    type: 'memory', question: 'התאימו כל מושג להסבר שלו',
    pairs: preset.pairs, difficulty: 5,
  } as unknown as Puzzle

  return (
    <div dir="rtl" style={{ minHeight: '100dvh', background: 'var(--holo-bg-deep, #050a14)', color: 'var(--holo-text, #d5f6ff)', padding: 12, fontFamily: 'var(--font-display)' }}>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 4 }}>
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => { setPreset(p); setRunId((i) => i + 1) }}
            style={{ padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, background: p.key === preset.key ? 'rgba(0,213,255,.25)' : 'rgba(255,255,255,.06)', border: '1px solid rgba(0,213,255,.4)', color: 'inherit' }}>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <MemoryChallenge key={`${preset.key}-${runId}`} puzzle={puzzle} onResult={() => setRunId((i) => i + 1)} />
      </div>
    </div>
  )
}
