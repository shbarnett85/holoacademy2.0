import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* מיגרציית ai_summaries: קובץ בלבד (לא מורצת בבדיקות). הבדיקה מוודאת את הנקודות שנסקרו: מחיקת מורה לא נחסמת (CASCADE), חוק 12 (RLS בלי policies בכל הטבלאות),
   מה קורה במחיקת תלמיד/כיתה (מתועד), מדיניות שמירה (מתועדת), ושה-rollback מסיר את כל מה שנוצר. */
const read = (name: string): string => readFileSync(fileURLToPath(new URL(`../../../migrations/${name}`, import.meta.url)), 'utf8')
const up = read('ai_summaries.sql')
const down = read('ai_summaries.rollback.sql')
const code = (sql: string): string => sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

describe('server/migrations/ai_summaries.sql', () => {
  it('viewer_id עם ON DELETE CASCADE בשתי הטבלאות (מחיקת מורה / ניקוי משתמשי בדיקה לא נחסמת)', () => {
    const refs = [...code(up).matchAll(/viewer_id\s+uuid NOT NULL REFERENCES users\(id\)([^,\n]*)/g)].map((m) => m[1])
    expect(refs).toHaveLength(2)
    for (const r of refs) expect(r).toMatch(/ON DELETE CASCADE/)
  })

  it('חוק 12: RLS מופעל על שתי הטבלאות ובלי אף policy', () => {
    expect(code(up)).toMatch(/ALTER TABLE ai_summaries ENABLE ROW LEVEL SECURITY/)
    expect(code(up)).toMatch(/ALTER TABLE ai_summary_usage ENABLE ROW LEVEL SECURITY/)
    expect(code(up)).not.toMatch(/CREATE POLICY/i)
  })

  it('additive בלבד: אין ALTER/DROP על טבלאות קיימות (חוץ מהפעלת RLS על החדשות)', () => {
    const c = code(up)
    expect(c).not.toMatch(/DROP\s+(TABLE|COLUMN)/i)
    for (const m of c.matchAll(/ALTER TABLE (\w+)/g)) expect(['ai_summaries', 'ai_summary_usage']).toContain(m[1])
  })

  it('מתועד: מה קורה במחיקת תלמיד/כיתה (entity_id בלי FK → ניקוי ידני עם השאילתות) ומדיניות שמירה', () => {
    expect(up).toMatch(/entity_id[^\n]*בלי FK/)
    expect(up).toMatch(/DELETE FROM ai_summaries WHERE scope = 'student'/)
    expect(up).toMatch(/scope IN \('class','class_subject'\)/)
    expect(up).toMatch(/scope = 'submission'/)
    expect(up).toMatch(/מדיניות שמירה/)
    expect(up).toMatch(/interval '1 year'/)
  })

  it('יומן השימוש: טבלת insert-only עם אינדקס (viewer_id, created_at) לתקרה היומית', () => {
    expect(code(up)).toMatch(/CREATE TABLE IF NOT EXISTS ai_summary_usage/)
    expect(code(up)).toMatch(/idx_ai_summary_usage_viewer ON ai_summary_usage \(viewer_id, created_at\)/)
  })

  it('rollback מסיר את שתי הטבלאות ואת כל האינדקסים', () => {
    const c = code(down)
    for (const name of ['ai_summaries', 'ai_summary_usage']) expect(c).toMatch(new RegExp(`DROP TABLE IF EXISTS ${name}`))
    for (const idx of ['idx_ai_summaries_entity', 'idx_ai_summaries_viewer', 'idx_ai_summary_usage_viewer']) expect(c).toContain(idx)
  })
})
