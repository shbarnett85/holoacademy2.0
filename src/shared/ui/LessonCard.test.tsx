import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SUBJECTS, subjectTagColors, subjectVisual } from '../lib/subjects'
import LessonCard from './LessonCard'
import LessonThumb from './LessonThumb'

/* רינדור בצד שרת (בלי חלון). פלטה אחת לכל המסכים: צבעי המקצוע הם הפניות לטוקנים (הניגודיות נבדקת ב-subjects.test.ts) */
const card = (props: Partial<React.ComponentProps<typeof LessonCard>> = {}): string =>
  renderToStaticMarkup(<LessonCard mode="dark" title="מסע טיפת המים" subjectCode="science" thumbUrl="https://img.example/t.jpg" gradeMin={5} gradeMax={6} {...props} />)

describe('כרטיס שיעור משותף', () => {
  it('תמונה (lazy), כותרת, תגית מקצוע עם שם, תגית שכבות — ואין סמל מקצוע', () => {
    const html = card()
    expect(html).toMatch(/<img[^>]*loading="lazy"[^>]*decoding="async"/)
    expect(html).toContain('מסע טיפת המים')
    expect(html).toMatch(/data-subject-tag="science"[^>]*>[\s\S]*?מדעים/)
    expect(html).toMatch(/data-grade-tag[^>]*>שכבות ה׳–ו׳</)
    for (const s of SUBJECTS) expect(html).not.toContain(subjectVisual(s.code).glyph)
  })

  it('מסגרת בצבע המקצוע, ותגית המקצוע באותו צבע עם טקסט בניגודיות AA', () => {
    const html = card()
    const t = subjectTagColors('science', 'dark')
    expect(html).toContain('border:3px solid var(--color-ink)')
    expect(html).toMatch(/data-subject-stripe[^>]*background:var\(--subject-science\)/)
    expect(html).toContain(`background:${t.bg};color:${t.fg}`)
  })

  it('"לא סווג": מסגרת אפורה ותגית "לא סווג"', () => {
    const html = card({ subjectCode: null })
    expect(html).toContain('border:3px dashed var(--color-ink)')
    expect(html).toMatch(/data-subject-tag="unclassified"[^>]*>[\s\S]*?לא סווג/)
  })

  it('בלי תמונה: משטח בצבע המקצוע ועליו שם המקצוע, בלי <img> ובלי תגית כפולה', () => {
    const html = card({ thumbUrl: null })
    expect(html).not.toContain('<img')
    expect(html).toContain(`background:${subjectVisual('science').color}`)
    expect(html).toMatch(/data-thumb-name[^>]*>מדעים</)
    expect(html).not.toContain('data-subject-tag')
    /* "לא סווג" בלי תמונה: משטח אפור עם "לא סווג" */
    expect(card({ thumbUrl: null, subjectCode: null })).toMatch(/data-thumb-name[^>]*>לא סווג</)
  })

  it('פעולות ותגיות מצב נשלחות מבחוץ: הכרטיס לא ממציא כפתורים', () => {
    expect(card()).not.toContain('<button')
    const html = card({ actions: <button type="button">שחקו</button>, badges: <span>חדש</span>, onClick: () => {} })
    expect(html).toContain('שחקו')
    expect(html).toContain('חדש')
    expect(html).toContain('role="link"')
    expect(html).toContain('tabindex="0"')
  })

  it('בלי טווח שכבות אין תגית שכבות; כותרת ארוכה נחתכת לשתי שורות (לא נשברת מחוץ לכרטיס)', () => {
    expect(card({ gradeMin: null, gradeMax: null })).not.toContain('data-grade-tag')
    expect(card()).toContain('-webkit-line-clamp:2')
  })
})

describe('תמונה ממוזערת קטנה ברשימות', () => {
  it('tag="overlay" מציג את שם המקצוע על התמונה; tag="none" לא (השם כתוב ליד)', () => {
    const withTag = renderToStaticMarkup(<LessonThumb url="https://img.example/t.jpg" subjectCode="history" mode="dark" width={104} height={78} />)
    expect(withTag).toMatch(/data-subject-tag="history"[^>]*>[\s\S]*?היסטוריה/)
    const noTag = renderToStaticMarkup(<LessonThumb url="https://img.example/t.jpg" subjectCode="history" mode="dark" width={72} height={48} tag="none" />)
    expect(noTag).not.toContain('data-subject-tag')
  })
})
