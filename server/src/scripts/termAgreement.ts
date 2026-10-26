/* ──────────────────────────────────────────────────────────────────────────
   termAgreement — מעבר שני אחרי termCodemod: התאמת מין ומספר **רחוקה** מהמונח.
   termCodemod מתקן קבוצת שורות סביב כל מופע של "הדמיה". אבל מילות התאמה שמתייחסות לשיעור יושבות לפעמים
   במחרוזת אחרת, רחוקה מהמונח ("מהן"/"בכולן"/"אחת" בפונקציה שבה רק מחרוזת אחת הכילה "הדמיות").
   כאן: לכל שורה ששונתה (git diff) לוקחים את היחידה הסמוכה (פונקציה/מאפיין/משפט, עד 70 שורות), ו-Sonnet בודק
   *רק* התאמה לשיעור/שיעורים ומחזיר את היחידה. אימות זהה (שלד + הערות זהים).
   הרצה:  npx tsx src/scripts/termAgreement.ts [--dry] [--out report.json]
   ────────────────────────────────────────────────────────────────────────── */
import '../env.js'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { callClaude } from '../lib/claudeCalls.js'
import { extractJson } from '../lib/questSchemas.js'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const CRLF = String.fromCharCode(13, 10)
const LF = String.fromCharCode(10)
const args = process.argv.slice(2)
const flag = (n: string) => args.includes(`--${n}`)
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined }

const kindOf = (f: string) => (f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
const parse = (f: string, text: string) => ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, kindOf(f))

function skeleton(sf: ts.SourceFile): string {
  const parts: string[] = []
  const visit = (n: ts.Node) => {
    parts.push(String(n.kind))
    if (ts.isIdentifier(n) || ts.isNumericLiteral(n)) parts.push(n.text)
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) || ts.isJsxText(n)) parts.push('S')
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return parts.join(',')
}
function commentsOf(text: string, f: string): string[] {
  const sc = ts.createScanner(ts.ScriptTarget.Latest, false, f.endsWith('.tsx') ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, text)
  const out: string[] = []
  for (let t = sc.scan(); t !== ts.SyntaxKind.EndOfFileToken; t = sc.scan()) if (t === ts.SyntaxKind.SingleLineCommentTrivia || t === ts.SyntaxKind.MultiLineCommentTrivia) out.push(sc.getTokenText())
  return out
}

/* שורות ששונו בקובץ (מספרי שורה בגרסה החדשה) */
function changedLines(file: string): number[] {
  const out = execSync(`git diff -U0 -- "${file}"`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const lines: number[] = []
  for (const m of out.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]), n = m[2] === undefined ? 1 : Number(m[2])
    for (let i = 0; i < n; i++) lines.push(start - 1 + i)
  }
  return lines
}

const UNIT_KINDS = new Set([ts.SyntaxKind.ArrowFunction, ts.SyntaxKind.FunctionDeclaration, ts.SyntaxKind.FunctionExpression, ts.SyntaxKind.MethodDeclaration, ts.SyntaxKind.PropertyAssignment, ts.SyntaxKind.VariableStatement, ts.SyntaxKind.ExpressionStatement, ts.SyntaxKind.ReturnStatement, ts.SyntaxKind.JsxElement, ts.SyntaxKind.JsxSelfClosingElement, ts.SyntaxKind.CallExpression])

/* היחידה הצרה ביותר מעל השורה, עד 70 שורות; אחרת ±12 שורות */
function unitFor(sf: ts.SourceFile, line: number, lineCount: number): [number, number] {
  const pos = sf.getPositionOfLineAndCharacter(line, 0)
  let best: [number, number] | null = null
  const visit = (n: ts.Node) => {
    if (n.getStart(sf) > pos + 400 || n.getEnd() < pos) return
    if (UNIT_KINDS.has(n.kind)) {
      const a = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line, b = sf.getLineAndCharacterOfPosition(n.getEnd()).line
      if (a <= line && b >= line && b - a <= 70 && (!best || b - a < best[1] - best[0] || true)) { if (!best || (b - a) >= (best[1] - best[0]) || best[1] - best[0] < 3) best = [a, b] }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  /* מעדיפים יחידה גדולה מספיק (≥4 שורות) כדי שההקשר יכלול את ההתאמות */
  if (best && (best as [number, number])[1] - (best as [number, number])[0] >= 3) return best
  return [Math.max(0, line - 12), Math.min(lineCount - 1, line + 12)]
}

const INSTRUCTION = `אתה בודק התאמת מין ומספר בטקסטי ממשק בעברית בקוד מקור (TypeScript/React).
בקוד הזה המינוח הוחלף מ"הדמיה/הדמיות" (נקבה) ל"שיעור/שיעורים" (זכר). ההחלפה נעשתה במחרוזות שהכילו את המונח, אבל מילות התאמה שמתייחסות אליו
(פעלים, תוארים, מספרים, כינויי רמז וגוף, כינויי קניין וחסד: "מהן"→"מהם", "בכולן"→"בכולם", "אחת"→"אחד", "הזו/הזאת"→"הזה", "היא"→"הוא", "שלה"→"שלו", "נשלחה"→"נשלח",
"חדשה"→"חדש", "הראשונה"→"הראשון", "שתי"→"שני") נשארו אצל מחרוזות אחרות באותה יחידה.
לכל יחידה: בדוק *רק* מילות התאמה שמתייחסות לשיעור/שיעורים (או למספר/ספירה שלהם). אל תיגע במילים שמתייחסות לדברים אחרים (תלמידים, אתגרים, סצנות, כיתות, משחקים, מקצועות).
אם נדרש תיקון — החזר את היחידה המלאה המתוקנת. אם הכול תקין — החזר אותה בדיוק כמו שהיא.
אל תשנה קוד, שמות, מפתחות, הערות (// ו-/* */), רווחים, גרשיים או ביטויי \${...}. אל תשנה טקסט שאינו קשור לשיעור.
החזר JSON בלבד: {"items":[{"id":"...","text":"היחידה המלאה","changed":true|false}]}.`

interface Unit { id: string; file: string; from: number; to: number; text: string }

async function main() {
  const files = execSync('git diff --name-only', { cwd: ROOT, encoding: 'utf8' }).split(LF).map((s) => s.trim()).filter((f) => /\.(ts|tsx)$/.test(f) && !/termCodemod|termAgreement/.test(f))
  const jobs: { file: string; abs: string; sf: ts.SourceFile; cr: boolean; units: Unit[] }[] = []
  for (const f of files) {
    const abs = path.join(ROOT, f)
    const raw = readFileSync(abs, 'utf8')
    const cr = raw.includes(CRLF)
    const text = raw.split(CRLF).join(LF)
    const sf = parse(abs, text)
    const lc = text.split(LF).length
    const lines = [...new Set(changedLines(f))]
    const ranges: [number, number][] = []
    for (const l of lines) {
      const r = unitFor(sf, l, lc)
      const last = ranges[ranges.length - 1]
      if (last && r[0] <= last[1] + 1) { last[0] = Math.min(last[0], r[0]); last[1] = Math.max(last[1], r[1]) } else ranges.push([r[0], r[1]])
    }
    ranges.sort((a, b) => a[0] - b[0])
    const merged: [number, number][] = []
    for (const r of ranges) { const last = merged[merged.length - 1]; if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]); else merged.push([...r]) }
    const tl = text.split(LF)
    jobs.push({ file: f, abs, sf, cr, units: merged.map(([a, b], i) => ({ id: `${f}#${i}`, file: f, from: a, to: b, text: tl.slice(a, b + 1).join(LF) })) })
  }
  const all = jobs.flatMap((j) => j.units)
  console.log(JSON.stringify({ files: jobs.length, units: all.length, lines: all.reduce((n, u) => n + (u.to - u.from + 1), 0) }))

  const answers = new Map<string, string>()
  const batches: Unit[][] = []
  let cur: Unit[] = [], size = 0
  for (const u of all) { if (cur.length && (cur.length >= 8 || size + u.text.length > 14000)) { batches.push(cur); cur = []; size = 0 } cur.push(u); size += u.text.length }
  if (cur.length) batches.push(cur)
  let next = 0
  const worker = async () => {
    while (next < batches.length) {
      const b = batches[next++]
      const ask = async (units: Unit[]): Promise<boolean> => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const raw = await callClaude([{ role: 'user', content: `${INSTRUCTION}\n\n${JSON.stringify(units.map((u) => ({ id: u.id, file: u.file, text: u.text })))}` }])
            const out = extractJson(raw) as { items?: { id: string; text: string }[] }
            for (const i of out.items ?? []) answers.set(i.id, i.text)
            return true
          } catch { /* ניסיון נוסף */ }
        }
        return false
      }
      /* אצווה שנכשלה בפענוח JSON — כל יחידה בנפרד */
      if (!(await ask(b)) && b.length > 1) for (const u of b) if (!(await ask([u]))) console.log('יחידה נכשלה:', u.id)
      process.stdout.write('.')
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  console.log()

  const report: { file: string; line: number; before: string; after: string; status: string; reason?: string }[] = []
  for (const j of jobs) {
    const lines = j.sf.text.split(LF)
    const baseText = lines.join(LF)
    const baseSkel = skeleton(parse(j.abs, baseText))
    const baseComments = JSON.stringify(commentsOf(baseText, j.abs))
    for (const u of [...j.units].sort((a, b) => b.from - a.from)) {
      const nt = answers.get(u.id)
      if (nt === undefined || nt === u.text) continue
      const trial = [...lines.slice(0, u.from), ...nt.split(LF), ...lines.slice(u.to + 1)]
      const tt = trial.join(LF)
      const ok = skeleton(parse(j.abs, tt)) === baseSkel && JSON.stringify(commentsOf(tt, j.abs)) === baseComments
      if (!ok) { report.push({ file: j.file, line: u.from + 1, before: u.text, after: nt, status: 'failed', reason: 'שלד/הערות שונו' }); continue }
      lines.splice(u.from, u.to - u.from + 1, ...nt.split(LF))
      report.push({ file: j.file, line: u.from + 1, before: u.text, after: nt, status: 'ok' })
    }
    if (!flag('dry')) writeFileSync(j.abs, j.cr ? lines.join(LF).split(LF).join(CRLF) : lines.join(LF))
  }
  console.log(JSON.stringify({ changedUnits: report.filter((r) => r.status === 'ok').length, failed: report.filter((r) => r.status === 'failed').length }))
  for (const r of report.filter((x) => x.status === 'failed')) console.log('✗', r.file, r.line, r.reason)
  const out = opt('out')
  if (out) writeFileSync(out, JSON.stringify(report, null, 1))
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
