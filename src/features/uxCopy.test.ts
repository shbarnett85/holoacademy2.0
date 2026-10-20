import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/* ──────────────────────────────────────────────────────────────────────────
   מילים אסורות בטקסט שמוצג למורה — סריקה סטטית של הקוד (ללא דפדפן, ללא שרת).
   עיקרון 5 ב-CLAUDE.md ("עקרונות ממשק למסכי מורה"): בממשק אין וקטור / p / מובהק / BH / אינדקס / קורלציה /
   גודל אפקט / הסתברות. פרטים סטטיסטיים מותרים רק מאחורי "איך חישבנו?".

   מה נסרק: כל מחרוזת-ליטרל (גם תבנית), וכל טקסט JSX, בקבצי .ts/.tsx של
     src/features/{results, analyticsV2, teacherUi}  (בלי קבצי בדיקה)  +  src/shared/lib/findingsNarrative.ts.
   מה לא נסרק: הערות, שמות משתנים/מאפיינים, וטיפוסי-מחרוזת (type X = 'a' | 'b') — אינם מוצגים למשתמש.
   משלים את e2e/lib/forbidden.ts (שסורק את ה-DOM בפועל, ב-npm run e2e:ux) ואת forbiddenWords.test.ts בשרת (תגובות הספק).

   רשימת החריגים (ALLOW) מכוונת-קטנה: מה שבתוך "איך חישבנו?" מותר, ושום דבר אחר.
   ────────────────────────────────────────────────────────────────────────── */

/* ── הרשימה (אותה רשימה כמו e2e/lib/forbidden.ts; מבחן ה-drift למטה מוודא שהן זהות) ── */
interface Rule { word: string; re: RegExp }
const RULES: readonly Rule[] = [
  { word: 'וקטור', re: /וקטור/ },
  { word: 'p-value', re: /\bp[\s\-–]?value\b/i },
  { word: 'p מתוקן', re: /\bp[\s\-–]*מתוקן/i },
  { word: 'מובהק', re: /מובהק/ },
  { word: 'BH', re: /\bBH\b/ },
  { word: 'Benjamini', re: /benjamini/i },
  { word: 'אינדקס', re: /אינדקס/ },
  { word: 'קורלציה', re: /קורלצי/ },
  { word: 'גודל אפקט', re: /גודל[י]?\s+ה?אפקט/ },
  { word: 'הסתברות', re: /הסתברו/ },
]

/* ── החריגים: המקום היחיד שבו מותר פירוט חישובי ── */
const ALLOW = {
  /* תת-עץ JSX שהאלמנט שלו הוא <HowWeCalc> או נושא את האטריביוט data-how-we-calc (כולל אטריביוטים וילדים) */
  jsxTags: ['HowWeCalc'],
  jsxAttributes: ['data-how-we-calc'],
  /* הצהרות ברמה העליונה שהן "הקבוצה HOW_WE_CALC": האובייקט, והפונקציה הטכנית שהוא מחבר ל-evidenceLines */
  declarations: {
    'src/shared/lib/findingsNarrative.ts': ['HOW_WE_CALC', 'evidenceLinesTechnical'],
  } as Record<string, string[]>,
}

/* ── הקבצים הנסרקים ── */
const RAW = import.meta.glob(
  [
    '/src/features/results/**/*.{ts,tsx}',
    '/src/features/analyticsV2/**/*.{ts,tsx}',
    '/src/features/teacherUi/**/*.{ts,tsx}',
    '/src/shared/lib/findingsNarrative.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

const E2E_FORBIDDEN_RAW = import.meta.glob('/e2e/lib/forbidden.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const isTest = (f: string): boolean => /\.(test|spec)\.(ts|tsx)$/.test(f) || f.endsWith('.d.ts')
const SOURCES: [string, string][] = Object.entries(RAW)
  .map(([k, v]): [string, string] => [k.replace(/^\//, ''), v])
  .filter(([f]) => !isTest(f))
  .sort(([a], [b]) => a.localeCompare(b))

/* ── הסורק ── */
interface Hit { file: string; line: number; word: string; text: string }

const snippet = (text: string, index: number, len: number): string => {
  const flat = text.replace(/\s+/g, ' ')
  const start = Math.max(0, index - 24)
  return `${start > 0 ? '…' : ''}${flat.slice(start, index + len + 24).trim()}${index + len + 24 < flat.length ? '…' : ''}`
}

/* ספירה לבדיקת-כיסוי: כמה טקסטים נסרקו בפועל (לא כולל מה שבתוך החריגים) */
interface Stats { strings: number; hebrew: number }

function scanSource(file: string, source: string, stats?: Stats): Hit[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const hits: Hit[] = []
  const allowedDecls = ALLOW.declarations[file] ?? []

  const check = (node: ts.Node, text: string): void => {
    if (!text.trim()) return
    if (stats) {
      stats.strings++
      if (/[֐-׿]/.test(text)) stats.hebrew++
    }
    for (const { word, re } of RULES) {
      const m = re.exec(text)
      if (!m) continue
      hits.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, word, text: snippet(text, m.index, m[0].length) })
    }
  }

  const jsxTagName = (n: ts.JsxElement | ts.JsxSelfClosingElement): string => (ts.isJsxElement(n) ? n.openingElement.tagName : n.tagName).getText(sf)
  const jsxAttrs = (n: ts.JsxElement | ts.JsxSelfClosingElement): ts.JsxAttributes => (ts.isJsxElement(n) ? n.openingElement.attributes : n.attributes)
  const isHowWeCalcJsx = (n: ts.Node): boolean => {
    if (!ts.isJsxElement(n) && !ts.isJsxSelfClosingElement(n)) return false
    if (ALLOW.jsxTags.includes(jsxTagName(n))) return true
    return jsxAttrs(n).properties.some((p) => ts.isJsxAttribute(p) && ALLOW.jsxAttributes.includes(p.name.getText(sf)))
  }
  const declaredNames = (n: ts.Node): string[] => {
    if (ts.isVariableStatement(n)) return n.declarationList.declarations.map((d) => d.name.getText(sf))
    if (ts.isFunctionDeclaration(n) && n.name) return [n.name.getText(sf)]
    return []
  }
  /* מחרוזות שאינן טקסט מוצג: מפרטי מודולים וליטרלי-טיפוס */
  const notDisplayed = (n: ts.Node): boolean =>
    ts.isImportDeclaration(n.parent) || ts.isExportDeclaration(n.parent) || ts.isExternalModuleReference(n.parent) || ts.isLiteralTypeNode(n.parent) || ts.isImportTypeNode(n.parent) || ts.isModuleDeclaration(n.parent)

  const visit = (node: ts.Node, exempt: boolean): void => {
    let ex = exempt
    if (!ex && node.parent === sf && declaredNames(node).some((n) => allowedDecls.includes(n))) ex = true
    if (!ex && isHowWeCalcJsx(node)) ex = true
    if (!ex) {
      if (ts.isStringLiteral(node)) { if (!notDisplayed(node)) check(node, node.text) }
      else if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) check(node, node.text)
      else if (ts.isJsxText(node)) check(node, node.text)
    }
    ts.forEachChild(node, (c) => visit(c, ex))
  }
  visit(sf, false)
  return hits
}

const fmt = (h: Hit): string => `${h.file}:${h.line}  «${h.word}»  ${h.text}`

/* ══════════════════════════════════════════════════════════════════════════ */
describe('uxCopy — מילים אסורות בקוד שמוצג למורה', () => {
  it('הסורק באמת תופס מחרוזת אסורה שהושתלה (בדיקה עצמית)', () => {
    const P = 'src/features/results/Planted.tsx'
    const words = (src: string, file = P): string[] => scanSource(file, src).map((h) => h.word)

    /* נתפס: מחרוזת רגילה, טקסט JSX (גם בהטיה), תבנית, אטריביוט, שם לטיני */
    expect(words(`export const A = 'הממצא מובהק סטטיסטית'`)).toEqual(['מובהק'])
    expect(words(`export const A = () => <p>הוקטורים של הכיתה</p>`)).toEqual(['וקטור'])
    expect(words('export const A = (n: number) => `${n} p-value נמוך`')).toEqual(['p-value'])
    expect(words(`export const A = () => <Foo aria-label="קורלציה חזקה" />`)).toEqual(['קורלציה'])
    expect(words(`export const A = 'BH'`)).toEqual(['BH'])
    expect(words(`export const A = 'גודל אפקט גדול'`)).toEqual(['גודל אפקט'])
    expect(words(`export const A = 'p מתוקן'`)).toEqual(['p מתוקן'])
    expect(words(`export const A = ['אינדקס', 'הסתברותי', 'Benjamini–Hochberg']`).sort()).toEqual(['Benjamini', 'הסתברות', 'אינדקס'].sort())
    const [hit] = scanSource(P, `\n\nexport const A = 'מובהק'`)
    expect(hit).toMatchObject({ file: P, line: 3, word: 'מובהק' })

    /* לא נתפס: טקסט נקי, מילה לטינית שאינה BH, הערות, שמות משתנים, טיפוסי-מחרוזת, מפרטי מודולים */
    expect(words(`export const A = '11 מתוך 24 תלמידים סיימו'`)).toEqual([])
    expect(words(`export const A = 'bhajan ABHA'`)).toEqual([])
    expect(words(`// מובהק וקטור\n/* BH */\nexport const מובהק = 1\nexport type T = 'מובהק'`)).toEqual([])
    expect(words(`import x from './מובהק'\nexport { y } from './וקטור'`)).toEqual([])

    /* מותר: בתוך <HowWeCalc> ובתוך אלמנט עם data-how-we-calc — אבל רק בתוכם */
    expect(words(`export const A = () => <HowWeCalc lines={['p מתוקן (BH)']}>גודל אפקט והסתברות</HowWeCalc>`)).toEqual([])
    expect(words(`export const A = () => <details data-how-we-calc><p>וקטור</p><b>{'Benjamini'}</b></details>`)).toEqual([])
    expect(words(`export const A = () => <section><HowWeCalc lines={[]} />אינדקס</section>`)).toEqual(['אינדקס'])
    expect(words(`export const A = () => <div><p>אינדקס</p><details data-how-we-calc>קורלציה</details></div>`)).toEqual(['אינדקס'])

    /* הקבוצה HOW_WE_CALC: מותרת רק בקובץ ובהצהרות שברשימה */
    const N = 'src/shared/lib/findingsNarrative.ts'
    expect(words(`export const HOW_WE_CALC = { a: 'Benjamini', b: ['גודל אפקט'] }\nfunction evidenceLinesTechnical() { return ['p מתוקן (BH)'] }`, N)).toEqual([])
    expect(words(`export const OTHER = 'Benjamini'`, N)).toEqual(['Benjamini'])
    expect(words(`export const HOW_WE_CALC = { a: 'Benjamini' }`, 'src/features/results/x.ts')).toEqual(['Benjamini'])
    expect(words(`export const HOW_WE_CALC = {}\nexport const OTHER = 'מובהק'`, N)).toEqual(['מובהק'])
  })

  it('רשימת המילים זהה לזו של ביקורת ה-DOM (e2e/lib/forbidden.ts)', () => {
    const raw = Object.values(E2E_FORBIDDEN_RAW)[0]
    expect(raw, 'e2e/lib/forbidden.ts לא נמצא').toBeTruthy()
    const e2eWords = [...raw.matchAll(/\{\s*word:\s*'([^']+)'/g)].map((m) => m[1])
    expect(e2eWords.sort()).toEqual(RULES.map((r) => r.word).sort())
  })

  it('הסריקה אכן מכסה את הקבצים הרלוונטיים (לא עוברת סתם כי ה-glob ריק)', () => {
    const files = SOURCES.map(([f]) => f)
    expect(files.length).toBeGreaterThanOrEqual(15)
    expect(files).toContain('src/shared/lib/findingsNarrative.ts')
    expect(files).toContain('src/features/teacherUi/HowWeCalc.tsx')
    expect(files.some((f) => f.startsWith('src/features/results/'))).toBe(true)
    expect(files.some((f) => f.startsWith('src/features/analyticsV2/'))).toBe(true)
    expect(files.some((f) => f.startsWith('src/features/teacherUi/'))).toBe(true)
    expect(files.some((f) => isTest(f))).toBe(false)
    /* ושהסורק מוצא טקסט עברי אמיתי בתוכם */
    const nar = SOURCES.find(([f]) => f === 'src/shared/lib/findingsNarrative.ts')![1]
    expect(scanSource('src/shared/lib/findingsNarrative.ts', `${nar}\nexport const PLANTED = 'מובהק'`).map((h) => h.word)).toContain('מובהק')
    const stats: Stats = { strings: 0, hebrew: 0 }
    for (const [file, src] of SOURCES) scanSource(file, src, stats)
    expect(stats.hebrew, 'הסורק אמור להגיע לפחות ל-150 מחרוזות/טקסטי JSX בעברית').toBeGreaterThanOrEqual(150)
  })

  it('אין מילים אסורות בטקסט שמוצג, מלבד בתוך "איך חישבנו?"', () => {
    const hits = SOURCES.flatMap(([file, src]) => scanSource(file, src))
    expect(hits.map(fmt)).toEqual([])
  })
})
