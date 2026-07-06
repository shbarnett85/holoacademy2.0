import { describe, it, expect } from 'vitest'
import { escapeHtml, injectPlayMeta, questToPlayMeta } from './playMeta.js'

const BASE_HTML = `<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <title>HoloAcademy — ממד חדש של למידה</title>
    <meta name="description" content="ברירת מחדל" />
    <meta property="og:title" content="HoloAcademy — ממד חדש של למידה" />
    <meta property="og:image" content="https://default.example/img.png" />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body><div id="root"></div></body>
</html>`

describe('escapeHtml', () => {
  it('מנטרל תווי HTML', () => {
    expect(escapeHtml(`<x> & "y" 'z'`)).toBe('&lt;x&gt; &amp; &quot;y&quot; &#39;z&#39;')
  })
})

describe('injectPlayMeta', () => {
  const meta = { title: 'מסע טיפת המים', description: 'הרפתקה במחזור המים', imageUrl: 'https://img.example/scene.png', url: 'https://holoacademy.ai/play/abc' }

  it('מחליף title ומזריק og:title/og:image/og:url של ההדמיה', () => {
    const out = injectPlayMeta(BASE_HTML, meta)
    expect(out).toContain('<title>מסע טיפת המים · HoloAcademy</title>')
    expect(out).toContain('og:title" content="מסע טיפת המים · HoloAcademy"')
    expect(out).toContain('og:image" content="https://img.example/scene.png"')
    expect(out).toContain('og:url" content="https://holoacademy.ai/play/abc"')
  })
  it('מסיר את תגי ברירת-המחדל — אין og:title/og:image כפולים (ה-crawler בוחר שרירותית)', () => {
    const out = injectPlayMeta(BASE_HTML, meta)
    expect(out.match(/og:title/g)).toHaveLength(1)
    expect(out.match(/og:image/g)).toHaveLength(1)
    expect(out).not.toContain('https://default.example/img.png')
    expect(out.match(/name="description"/g)).toHaveLength(1)
  })
  it('כותרת עם תווי HTML לא שוברת את העמוד (escape)', () => {
    const out = injectPlayMeta(BASE_HTML, { ...meta, title: 'א<script>"ב"' })
    expect(out).not.toContain('<script>')
    expect(out).toContain('א&lt;script&gt;&quot;ב&quot;')
  })
  it('ללא תמונה — אין תג og:image כלל', () => {
    const out = injectPlayMeta(BASE_HTML, { title: 'בלי תמונה', url: 'https://x/play/1' })
    expect(out).not.toContain('og:image')
  })
})

describe('questToPlayMeta', () => {
  it('שולף את תמונת סצנת הפתיחה ואת תחילת הנרטיב (ללא ניקוד)', () => {
    const quest = {
      title: 'הדמיה',
      game_data: {
        entrySceneId: 's1',
        scenes: [
          { id: 's0', imageUrl: 'https://img/other.png', narrative: 'אחר' },
          { id: 's1', imageUrl: 'https://img/entry.png', narrative: 'בְּרוּכִים הַבָּאִים למעבדה!' },
        ],
      },
    }
    const m = questToPlayMeta(quest, 'https://x/play/1')
    expect(m.imageUrl).toBe('https://img/entry.png')
    expect(m.description).toBe('ברוכים הבאים למעבדה!')
  })
  it('נרטיב ארוך נחתך ל-150 תווים עם אליפסה', () => {
    const long = 'א'.repeat(200)
    const m = questToPlayMeta({ title: 'x', game_data: { entrySceneId: 's1', scenes: [{ id: 's1', narrative: long }] } }, 'u')
    expect(m.description!.length).toBe(151)
    expect(m.description!.endsWith('…')).toBe(true)
  })
  it('game_data ריק/חסר — לא קורס', () => {
    const m = questToPlayMeta({ title: 'ריק', game_data: null }, 'u')
    expect(m.title).toBe('ריק')
    expect(m.imageUrl).toBeUndefined()
  })
})
