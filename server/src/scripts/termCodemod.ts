/* ──────────────────────────────────────────────────────────────────────────
   termCodemod — המינוח "שיעור" (CLAUDE.md "מינוח"): מחליף "הדמיה" בטקסט שמשתמש רואה, בקוד המקור.
   · מנתח כל קובץ TS/TSX עם ה-AST של TypeScript ומוצא רק מחרוזות, תבניות וטקסט JSX שמכילים "הדמי"
     (הערות קוד אינן צמתים ולכן לעולם לא נוגעים בהן).
   · זו לא החלפת מחרוזת: "הדמיה" נקבה, "שיעור" זכר — כל קבוצת שורות סמוכה נשלחת ל-Sonnet שמתקן את כולה
     (פעלים, תוארים, מספרים, כינויים) ומחזיר את הקבוצה המלאה.
   · אימות לכל קבוצה: שלד הקובץ (כל הצמתים חוץ מתוכן מחרוזות/JSX) זהה, ההערות זהות, ואין "הדמי" שנשאר
     בצמתי הטקסט של הקבוצה. קבוצה שנכשלה — נשארת כמו שהיא ומופיעה ברשימת "לבדיקה ידנית".
   הרצה:  npx tsx src/scripts/termCodemod.ts --scan | --run [--only <substring>] [--out <report.json>] [--dry]
   ────────────────────────────────────────────────────────────────────────── */
import '../env.js'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { callClaude } from '../lib/claudeCalls.js'
import { extractJson } from '../lib/questSchemas.js'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const DIRS = ['src', 'server/src', 'e2e']
const SKIP_FILES = /(\.d\.ts|termCodemod\.ts)$/
const TERM = 'הדמי'
const CRLF = String.fromCharCode(13, 10)
const LF = String.fromCharCode(10)
const args = process.argv.slice(2)
const flag = (n: string) => args.includes(`--${n}`)
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined }

function walk(dir: string): string[] {
  const out: string[] = []
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'dist' || n.startsWith('.')) continue
    const p = path.join(dir, n)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx)$/.test(n) && !SKIP_FILES.test(n)) out.push(p)
  }
  return out
}

const kindOf = (f: string) => (f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
const parse = (f: string, text: string) => ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, kindOf(f))

interface TextNode { start: number; end: number; line: number; endLine: number; node: ts.Node }

/* צמתי טקסט שמכילים את המונח (בלי הערות) */
function termNodes(sf: ts.SourceFile): TextNode[] {
  const out: TextNode[] = []
  const text = sf.text
  const visit = (n: ts.Node) => {
    let range: [number, number] | null = null
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) range = [n.getStart(sf) + 1, n.getEnd() - 1]
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) range = [n.getStart(sf) + 1, n.getEnd() - (ts.isTemplateTail(n) ? 1 : 2)]
    else if (ts.isJsxText(n)) range = [n.getStart(sf), n.getEnd()]
    if (range && text.slice(range[0], range[1]).includes(TERM)) {
      out.push({ start: range[0], end: range[1], line: sf.getLineAndCharacterOfPosition(range[0]).line, endLine: sf.getLineAndCharacterOfPosition(range[1]).line, node: n })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

/* קבוצות שורות: צמתים סמוכים (≤2 שורות רווח) מתמזגים; מרחיבים בשורה אחת מכל צד להקשר */
function groupsOf(nodes: TextNode[], lineCount: number): { from: number; to: number; nodes: TextNode[] }[] {
  const sorted = [...nodes].sort((a, b) => a.line - b.line)
  const groups: { from: number; to: number; nodes: TextNode[] }[] = []
  for (const n of sorted) {
    const last = groups[groups.length - 1]
    if (last && n.line <= last.to + 2) { last.to = Math.max(last.to, n.endLine); last.nodes.push(n) } else groups.push({ from: n.line, to: n.endLine, nodes: [n] })
  }
  for (const g of groups) { g.from = Math.max(0, g.from - 1); g.to = Math.min(lineCount - 1, g.to + 1) }
  /* מיזוג חפיפות אחרי ההרחבה */
  const merged: typeof groups = []
  for (const g of groups) {
    const last = merged[merged.length - 1]
    if (last && g.from <= last.to + 1) { last.to = Math.max(last.to, g.to); last.nodes.push(...g.nodes) } else merged.push(g)
  }
  return merged
}

/* שלד: רצף סוגי צמתים + שמות/מספרים, עם תוכן טקסט ממוסך. */
function skeleton(sf: ts.SourceFile): string {
  const parts: string[] = []
  const visit = (n: ts.Node) => {
    parts.push(String(n.kind))
    if (ts.isIdentifier(n)) parts.push(n.text)
    else if (ts.isNumericLiteral(n)) parts.push(n.text)
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n)) parts.push('S')
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return parts.join(',')
}

function commentsOf(text: string, f: string): string[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, f.endsWith('.tsx') ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, text)
  const out: string[] = []
  for (let t = scanner.scan(); t !== ts.SyntaxKind.EndOfFileToken; t = scanner.scan()) {
    if (t === ts.SyntaxKind.SingleLineCommentTrivia || t === ts.SyntaxKind.MultiLineCommentTrivia) out.push(scanner.getTokenText())
  }
  return out
}

const INSTRUCTION = `אתה משכתב מחרוזות ממשק בקוד מקור (TypeScript/React) של מערכת לימודית בעברית.
המינוח במערכת עובר מ"הדמיה" ל"שיעור": בכל טקסט שמשתמש רואה, היחידה נקראת "שיעור" ולא "הדמיה".
לכל פריט תקבל מקטע שורות מהקוד (שורה אחת לפני ואחרי הם הקשר). החזר את המקטע המלא, באותו מבנה, כשכל טקסט שמשתמש רואה בו תוקן.
כללים:
• זו לא החלפת מחרוזת: "הדמיה" נקבה, "שיעור" זכר — תקן את כל המשפט: פעלים ("נשלחה"→"נשלח"), תוארים ("חדשה"→"חדש"), מספרים ("שתי הדמיות"→"שני שיעורים", "אחת"→"אחד"), כינויי רמז וגוף ("זו"→"זה", "היא"→"הוא", "שלה"→"שלו", "אותה"→"אותו"), ושאר ההתאמות. "הדמיות" (נקבה רבים) → "שיעורים" (זכר רבים), עם התאמת תוארים/פעלים ("הדמיות חדשות"→"שיעורים חדשים").
• צורות סמיכות/תחיליות: "הדמיית חזרה"→"שיעור חזרה", "הדמיית דמו"→"שיעור דמו", "ספריית ההדמיות"→"ספריית השיעורים", "להדמיה"→"לשיעור", "בהדמיות"→"בשיעורים", "שההדמיה"→"שהשיעור", "וההדמיה"→"והשיעור".
• התאמה חוצת-מחרוזות: אם הפועל/התואר נמצא במחרוזת אחרת באותו מקטע (למשל בענף אחר של טרנארי, או ב-JSX סמוך), תקן גם אותו.
• אל תשנה שום דבר שאינו טקסט משתמש: קוד, שמות משתנים, מפתחות, נתיבים, regex, וכל **הערות** (// ו-/* */) — גם אם יש בהן "הדמיה" — נשארות בדיוק כמו שהן. אל תשנה רווחים, גרשיים, ביטויי \${...}, ושורות שאין בהן שינוי נדרש.
• אל תיגע בטקסט שאינו שייך לטקסט משתמש (למשל ערך קבוע שהקוד משווה אליו). אם משהו נראה כך — השאר והוסף ל-notes.
• "הדמיה" כאמצעי/מושג כללי ("סימולציה" כשם נרדף חיצוני, כמו "מציאות מדומה") — השאר ל-notes אם אינך בטוח.
החזר JSON בלבד: {"items":[{"id":"...","text":"המקטע המלא המתוקן","notes":"אופציונלי"}]} — אותם id-ים.`

interface Group { id: string; file: string; from: number; to: number; text: string }

async function rewriteBatch(batch: Group[]): Promise<Map<string, string>> {
  const payload = batch.map((g) => ({ id: g.id, file: path.relative(ROOT, g.file).replace(/\\/g, '/'), text: g.text }))
  const raw = await callClaude([{ role: 'user', content: `${INSTRUCTION}\n\n${JSON.stringify(payload)}` }])
  const out = extractJson(raw) as { items?: { id: string; text: string }[] }
  return new Map((out.items ?? []).map((i) => [i.id, i.text]))
}

interface Result { file: string; line: number; before: string; after: string; status: 'ok' | 'failed'; reason?: string }

async function main() {
  const only = opt('only')
  const files = DIRS.flatMap((d) => walk(path.join(ROOT, d))).filter((f) => !only || f.includes(only))
  const jobs: { file: string; sf: ts.SourceFile; groups: Group[]; cr: boolean }[] = []
  let nodeCount = 0
  for (const f of files) {
    const raw = readFileSync(f, 'utf8')
    if (!raw.includes(TERM)) continue
    const cr = raw.includes(CRLF)
    const text = raw.split(CRLF).join(LF)
    const sf = parse(f, text)
    const nodes = termNodes(sf)
    if (!nodes.length) continue
    nodeCount += nodes.length
    const lines = text.split('\n')
    const groups = groupsOf(nodes, lines.length).map((g, i) => ({ id: `${path.relative(ROOT, f)}#${i}`, file: f, from: g.from, to: g.to, text: lines.slice(g.from, g.to + 1).join('\n') }))
    jobs.push({ file: f, sf, groups, cr })
  }
  const total = jobs.reduce((n, j) => n + j.groups.length, 0)
  console.log(JSON.stringify({ files: jobs.length, textNodes: nodeCount, groups: total }))
  if (flag('list')) {
    for (const j of jobs) for (const g of j.groups) for (const n of g.text.split(LF).filter((l) => l.includes(TERM))) console.log(path.relative(ROOT, j.file).split(String.fromCharCode(92)).join('/') + ':' + (g.from + 1) + '  ' + n.trim().slice(0, 170))
    process.exit(0)
  }
  if (flag('scan')) { process.exit(0) }

  /* שכתוב ב-LLM (אצוות) */
  const all = jobs.flatMap((j) => j.groups)
  const rewritten = new Map<string, string>()
  const BATCH = 10
  const batches: Group[][] = []
  for (let i = 0; i < all.length; i += BATCH) batches.push(all.slice(i, i + BATCH))
  let next = 0
  const worker = async () => {
    while (next < batches.length) {
      const b = batches[next++]
      for (let attempt = 0; attempt < 2; attempt++) {
        try { for (const [k, v] of await rewriteBatch(b)) rewritten.set(k, v); break } catch (e) { if (attempt) console.log('אצווה נכשלה:', e instanceof Error ? e.message : e) }
      }
      process.stdout.write('.')
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  console.log()

  /* החלה + אימות פר-קובץ */
  const results: Result[] = []
  for (const j of jobs) {
    let text = j.sf.text
    const origComments = commentsOf(text, j.file)
    const lines = text.split('\n')
    /* מהסוף להתחלה כדי לא להזיז אינדקסים */
    for (const g of [...j.groups].sort((a, b) => b.from - a.from)) {
      const nt = rewritten.get(g.id)
      const before = g.text
      if (nt === undefined) { results.push({ file: j.file, line: g.from + 1, before, after: before, status: 'failed', reason: 'אין תשובה מהמודל' }); continue }
      if (nt === before) { results.push({ file: j.file, line: g.from + 1, before, after: nt, status: 'failed', reason: 'לא שונה' }); continue }
      const tryLines = [...lines.slice(0, g.from), ...nt.split('\n'), ...lines.slice(g.to + 1)]
      const tryText = tryLines.join('\n')
      const sfNew = parse(j.file, tryText)
      const parseErrors = (sfNew as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics?.length ?? 0
      const baseErrors = (j.sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics?.length ?? 0
      const remaining = termNodes(sfNew).filter((n) => n.line >= g.from && n.line <= g.from + nt.split('\n').length - 1).length
      const okSkeleton = skeleton(sfNew) === skeleton(parse(j.file, lines.join('\n')))
      const okComments = JSON.stringify(commentsOf(tryText, j.file)) === JSON.stringify(commentsOf(lines.join('\n'), j.file))
      const reasons: string[] = []
      if (parseErrors > baseErrors) reasons.push('שגיאת תחביר')
      if (!okSkeleton) reasons.push('שלד הקובץ השתנה')
      if (!okComments) reasons.push('הערות שונו')
      if (remaining > 0) reasons.push('נשאר "הדמי" בטקסט')
      if (reasons.length) { results.push({ file: j.file, line: g.from + 1, before, after: nt, status: 'failed', reason: reasons.join(', ') }); continue }
      lines.splice(g.from, g.to - g.from + 1, ...nt.split('\n'))
      results.push({ file: j.file, line: g.from + 1, before, after: nt, status: 'ok' })
    }
    text = lines.join('\n')
    void origComments
    if (!flag('dry')) writeFileSync(j.file, j.cr ? text.split(LF).join(CRLF) : text)
  }
  const ok = results.filter((r) => r.status === 'ok'), failed = results.filter((r) => r.status === 'failed')
  console.log(JSON.stringify({ groups: results.length, applied: ok.length, failed: failed.length }))
  for (const r of failed) console.log(`✗ ${path.relative(ROOT, r.file)}:${r.line} — ${r.reason}`)
  const out = opt('out')
  if (out) writeFileSync(out, JSON.stringify(results.map((r) => ({ ...r, file: path.relative(ROOT, r.file).replace(/\\/g, '/') })), null, 1))
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
