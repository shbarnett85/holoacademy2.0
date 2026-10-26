/* ──────────────────────────────────────────────────────────────────────────
   terminology — אכיפת המינוח "שיעור" (CLAUDE.md "מינוח").
   סורק את כל מחרוזות הקוד (ליטרלים של מחרוזת/תבנית/JSX) בקליינט ובשרת, ואת קבצי ה-HTML/JSON/manifest שמגיעים
   למשתמש, ונכשל על "הדמי…" — חוץ מהמשפט השיווקי היחיד "שיעורים אינטראקטיביים בהדמיה".
   מחוץ לסריקה: בדיקות, הערות קוד (AST — הערות אינן ליטרלים), כלי פיתוח (server/src/scripts, e2e, design-reference),
   ומילים אחרות שמתחילות באותן אותיות: "הדמיון" (דמיון), "הדמים" (דם), "הדמיונית" (imaginary).
   ────────────────────────────────────────────────────────────────────────── */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(import.meta.dirname, '../../..')
/* הדמיה / הדמיות / הדמיית (וגם הכתיב עם שתי יודים) — כולל תחיליות (בהדמיה, ההדמיות…). לא "הדמיון" ולא "הדמים" */
const TERM = /הדמי(?:ה|ות|ית|יה|יות|יית)/g
export const MARKETING_PHRASE = 'שיעורים אינטראקטיביים בהדמיה'

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.claude', 'coverage', 'reports', 'experiments', 'scripts', 'e2e', 'design-reference', 'docs', 'migrations'])
const isTest = (f: string) => /\.(test|spec)\.(ts|tsx)$/.test(f) || /\.golden\.ts$/.test(f) || /[\\/]test-utils[\\/]/.test(f)

function walk(dir: string, exts: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, exts, out)
    else if (exts.test(name) && !isTest(full)) out.push(full)
  }
  return out
}

const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join('/')

/* המונח אחרי הסרת המשפט השיווקי המותר */
const stripAllowed = (s: string) => s.split(MARKETING_PHRASE).join('')
const hasTerm = (s: string) => (stripAllowed(s).match(TERM) ?? []).length > 0

/* הוראות למודל (לא טקסט למשתמש) שחייבות לנקוב במילה האסורה כדי לאסור אותה — לפי שם הקבוע. כל הוספה לכאן היא החלטה מפורשת */
const MODEL_ONLY_CONSTANTS = new Set(['LESSON_TERM_RULE'])
const isModelOnly = (n: ts.Node): boolean => {
  for (let p: ts.Node | undefined = n; p; p = p.parent) if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && MODEL_ONLY_CONSTANTS.has(p.name.text)) return true
  return false
}

function codeHits(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const hits: string[] = []
  const visit = (n: ts.Node) => {
    let literal: string | null = null
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) literal = n.text
    else if (ts.isJsxText(n)) literal = n.text
    /* ליטרלים של import/export ושל תכונות דרך מפתח (למשל 'quests') אינם "הדמי" — אם יופיע, נתפוס גם אותם: הכלל חל על כל מחרוזת */
    if (literal !== null && hasTerm(literal) && !isModelOnly(n)) {
      const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf))
      hits.push(`${rel(file)}:${line + 1}  ${literal.trim().slice(0, 90)}`)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return hits
}

describe('מינוח: "שיעור" ולא "הדמיה" בכל טקסט שמשתמש רואה', () => {
  it('אין "הדמי…" במחרוזות הקליינט והשרת (חוץ מהמשפט השיווקי)', () => {
    const files = [...walk(path.join(ROOT, 'src'), /\.(ts|tsx)$/), ...walk(path.join(ROOT, 'server/src'), /\.(ts|tsx)$/)]
    expect(files.length).toBeGreaterThan(100) /* הגנה: הסריקה באמת רצה על הקוד */
    const hits = files.flatMap(codeHits)
    expect(hits, `נמצאו מופעי "הדמי" בטקסט משתמש:\n${hits.join('\n')}`).toEqual([])
  })

  it('אין "הדמי…" בקבצי HTML / manifest / JSON שמגיעים למשתמש', () => {
    const roots = [path.join(ROOT, 'index.html'), ...walk(path.join(ROOT, 'public'), /\.(html|json|webmanifest|txt|xml)$/), ...walk(path.join(ROOT, 'server/seed'), /\.json$/)]
    const hits: string[] = []
    for (const f of roots) {
      try { statSync(f) } catch { continue }
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (hasTerm(line)) hits.push(`${rel(f)}:${i + 1}  ${line.trim().slice(0, 90)}`) })
    }
    expect(hits, `נמצאו מופעי "הדמי":\n${hits.join('\n')}`).toEqual([])
  })

  it('הסורק עצמו עובד: תופס "הדמיה" ו"בהדמיות", ומתיר את המשפט השיווקי ואת "הדמיונית"', () => {
    expect(hasTerm('ההדמיה נשלחה')).toBe(true)
    expect(hasTerm('שתי הדמיות')).toBe(true)
    expect(hasTerm('מבוסס על 5 הדמיות')).toBe(true)
    expect(hasTerm(`${MARKETING_PHRASE}, ואחר כך שיעורים`)).toBe(false)
    expect(hasTerm('ההגדרה הדמיונית')).toBe(false)
    expect(hasTerm('הדמיון בין השברים')).toBe(false)
    expect(hasTerm('מרי הדמים')).toBe(false)
    for (const form of ['בהדמיה', 'ההדמיות', 'הדמיית חזרה', 'שהדמייה', 'להדמיות', 'וההדמיה']) expect(hasTerm(form), form).toBe(true)
    expect(hasTerm('שיעור חדש')).toBe(false)
    /* ההוראה למודל היא החריג היחיד בקוד: ההחרגה לפי שם הקבוע, לא לפי קובץ */
    expect(MODEL_ONLY_CONSTANTS.size).toBe(1)
    /* המשפט השיווקי מותר, אבל "הדמיה" לבדה לא */
    expect(hasTerm(`${MARKETING_PHRASE} ובנוסף הדמיה`)).toBe(true)
  })
})
