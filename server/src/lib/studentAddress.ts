/* ──────────────────────────────────────────────────────────────────────────
   studentAddress — כלל "פנייה לתלמיד בלשון רבים אחידה" (CLAUDE.md, "פנייה לתלמיד").
   · listTextSlots(gd): כל שדות הטקסט שמוצגים לתלמיד, כ-slots עם get/set (מקור אחד לבדיקה, לתיקון ולהמרת הספרייה)
   · scanStudentText(text, voice): בדיקה דטרמיניסטית (regex + רשימות סגורות) להפרות: פנייה ביחיד (אתה/את, ציווי,
     עבר ב"ת", כינויי-קניין "לך/שלך"), לוכסן מגדרי (בחר/י, מוכן/ה, מוותר/ת) וגוף ראשון ממוגדר בקול התלמיד.
   · "את" נספרת כפנייה רק בהקשר ודאי (אחריה פועל/תואר בנקבה יחידה מהרשימה, או בסוף משפט) — "את הספר" לעולם לא.
   · כל הרשימות בקובץ הזה בלבד וניתנות להרחבה (שורה חדשה + מקרה בבדיקות).
   · fixStudentAddress: בקשת תיקון אחת (LLM) לטקסטים המסומנים, ואז בדיקה חוזרת.
   ────────────────────────────────────────────────────────────────────────── */
import type { GameData } from './questSchemas.js'
import { extractJson } from './questSchemas.js'
import { STUDENT_ADDRESS_RULE } from '../prompts/questPrompt.js'
import { callHaiku } from './claudeCalls.js'
import { callGeminiText } from './gemini.js'
import { engineFor } from './modelRouter.js'
import { error as logError } from './log.js'

/* ── slots ── */

export interface TextSlot {
  key: string
  sceneId: string
  field: string
  /* קול התלמיד: טקסט שהתלמיד "אומר" (כפתורי בחירה, אפשרויות דילמה) — גוף ראשון ממוגדר אסור */
  voice: boolean
  get(): string
  set(v: string): void
}

type Obj = Record<string, unknown>

export function listTextSlots(gd: GameData): TextSlot[] {
  const slots: TextSlot[] = []
  const add = (o: Obj, prop: string, key: string, sceneId: string, field: string, voice = false) => {
    if (typeof o[prop] === 'string' && (o[prop] as string).trim()) {
      slots.push({ key, sceneId, field, voice, get: () => String(o[prop]), set: (v) => { o[prop] = v } })
    }
  }
  for (const sc of gd.scenes as unknown as Obj[]) {
    const id = String(sc.id)
    add(sc, 'title', `s:${id}:title`, id, 'title')
    add(sc, 'narrative', `s:${id}:narrative`, id, 'narrative')
    add(sc, 'drHoloDialog', `s:${id}:dlg`, id, 'dialog')
    for (const c of (sc.choices as Obj[] | undefined) ?? []) {
      add(c, 'text', `s:${id}:ch:${String(c.id)}`, id, 'choice', true)
      add(c, 'unlockText', `s:${id}:ch:${String(c.id)}:unlock`, id, 'unlockText')
    }
    const p = sc.puzzle as Obj | undefined
    if (p) {
      add(p, 'question', `s:${id}:q`, id, 'question')
      add(p, 'explanationCorrect', `s:${id}:ec`, id, 'explanation')
      add(p, 'explanationIncorrect', `s:${id}:ei`, id, 'explanation')
      add(p, 'sentence', `s:${id}:sentence`, id, 'sentence')
      add(p, 'situation', `s:${id}:situation`, id, 'situation')
      ;((p.choices as Obj[] | undefined) ?? []).forEach((c) => add(c, 'text', `s:${id}:opt:${String(c.id)}`, id, 'option'))
      ;((p.moralChoices as Obj[] | undefined) ?? []).forEach((c, i) => {
        add(c, 'text', `s:${id}:mc${i}:text`, id, 'moralChoice', true)
        add(c, 'consequence', `s:${id}:mc${i}:con`, id, 'consequence')
      })
      ;((p.questions as Obj[] | undefined) ?? []).forEach((q, i) => {
        add(q, 'question', `s:${id}:fq${i}:q`, id, 'quiz')
        add(q, 'explanationCorrect', `s:${id}:fq${i}:ec`, id, 'explanation')
        add(q, 'explanationIncorrect', `s:${id}:fq${i}:ei`, id, 'explanation')
        ;((q.options as unknown[] | undefined) ?? []).forEach((_o, j) => {
          const opts = q.options as string[]
          if (typeof opts[j] === 'string' && opts[j].trim()) slots.push({ key: `s:${id}:fq${i}:o${j}`, sceneId: id, field: 'option', voice: false, get: () => opts[j], set: (v) => { opts[j] = v } })
        })
      })
    }
  }
  for (const [name, sid] of [['endingGood', '__endingGood__'], ['endingBad', '__endingBad__']] as const) {
    const e = (gd as unknown as Obj)[name] as Obj | undefined
    if (!e) continue
    add(e, 'title', `end:${name}:title`, sid, 'title')
    add(e, 'narrative', `end:${name}:narrative`, sid, 'narrative')
    add(e, 'drHoloDialog', `end:${name}:dlg`, sid, 'dialog')
  }
  return slots
}

/* ── הבדיקה הדטרמיניסטית ── */

export type ViolationKind = 'slash' | 'pronoun' | 'imperative' | 'past' | 'suffix' | 'first-person'
export interface AddressViolation { kind: ViolationKind; match: string; context: string }

const NIQ = /[֑-ׇ]/g
const HEB = 'א-ת'
const B = `(?<![${HEB}])` /* תחילת מילה עברית */
const E = `(?![${HEB}])` /* סוף מילה עברית */

/* לוכסן מגדרי: בחר/י, מוכן/ה, מוותר/ת, תלמיד/ה, חכם/ה, (ה) — לפחות שתי אותיות לפני הלוכסן ("ו/או" לא נתפס) */
const SLASH = new RegExp(`[${HEB}]{2,}/(?:ה|ת|י|ית|ים|ות|ת/ה|ה/ת)${E}|[${HEB}]{2,}\\((?:ה|ת|י)\\)(?![${HEB}])`)

/* פנייה ביחיד — "אתה" תמיד; "את" רק בהקשר ודאי (ראו FEM_AFTER_AT) */
const PRONOUN_ATAH = new RegExp(`${B}אתה${E}`)
const FEM_AFTER_AT = [
  'מגיעה', 'יודעת', 'רואה', 'שומעת', 'מרגישה', 'חושבת', 'מוצאת', 'בוחרת', 'רוצה', 'צריכה', 'יכולה', 'מוכנה', 'מבינה', 'עומדת',
  'נמצאת', 'הולכת', 'לוקחת', 'פותחת', 'קוראת', 'פוגשת', 'חוקרת', 'מסתכלת', 'אומרת', 'שואלת', 'עונה', 'פותרת', 'חכמה', 'אמיצה',
  'מתקדמת', 'מנסה', 'ממשיכה', 'חוזרת', 'מצליחה', 'מחפשת', 'מזהה', 'מחליטה', 'בטוחה', 'מתחילה', 'יוצאת', 'נכנסת', 'לומדת',
  'עוזרת', 'מתכוננת', 'מגלה', 'מקבלת', 'מסוגלת', 'אחראית', 'מוכנה', 'חייבת', 'תגלי', 'תמצאי', 'תבחרי',
  'תצטרכי', 'תוכלי', 'בחרת', 'גילית', 'מצאת', 'ראית', 'שמעת', 'פתרת', ]
const PRONOUN_AT_VERB = new RegExp(`${B}את\\s+(?:${FEM_AFTER_AT.join('|')})${E}`)
/* "את" בסוף משפט/פסקה ("מה את?") — אי אפשר שתהיה מילת יחס */
const PRONOUN_AT_END = new RegExp(`${B}את(?=[?!,.:;)"״']|\\s+[?!,.:;)]|\\s*$)`) /* מירכאה רק צמודה (סוגרת); "את 'כותרת'" = מילת יחס לפני מירכאה פותחת */

/* עבר ביחיד "-ת" (רשימה סגורה) */
const PAST_2SG = [
  'בחרת', 'גילית', 'מצאת', 'ראית', 'שמעת', 'פתרת', 'ענית', 'התקדמת', 'למדת', 'חשבת', 'זכית', 'הראית', 'קיבלת', 'פתחת', 'הספקת', 'טעית', 'סיימת', 'שמרת', 'יצרת', 'תפסת', 'חיפשת', 'החלטת', 'ניסית', 'הסכמת', 'אמרת', 'עשית', 'היית', 'הצטרפת', 'שיחקת', 'קראת', 'סידרת', 'זיהית', 'גילית', 'חיברת', 'שלחת', 'סימנת',
]
const PAST = new RegExp(`${B}(?:ו|ש|כש)?(?:${PAST_2SG.join('|')})${E}`)

/* ציווי ביחיד (זכר/נקבה) — רק בתחילת משפט, כדי לא לתפוס עבר בגוף שלישי ("הוא קרא", "מצא") */
const IMPERATIVE_2SG = [
  'בחר', 'מצא', 'השלם', 'גרור', 'עזור', 'דמיין', 'זכור', 'תן', 'בוא', 'קח', 'הסתכל', 'נסה', 'שים', 'ענה', 'התאם', 'פתור', 'הקלד', 'כתוב', 'היכנס', 'צא', 'ראה', 'שמע', 'הבט', 'גלה', 'חפש',
  'אסוף', 'שלח', 'הוכח', 'גש', 'ארגן', 'בדוק', 'התבונן', 'הצטרף', 'בחרי', 'קראי', 'מצאי', 'השלימי', 'גררי', 'לחצי', 'עזרי', 'חשבי', 'דמייני', 'זכרי', 'תני', 'בואי', 'קחי', 'הסתכלי', 'המשיכי', 'נסי', 'שימי', 'ענִי', 'התאימי', 'נחשי', 'פתרי', 'הקלידי', 'כתבי', 'היכנסי', 'צאי', 'ראי', 'שמעי', 'סמני', 'אספי', 'שלחי', 'הוכיחי', 'פתחי', 'סגרי', 'גשי', 'צייני', 'זהי', 'בדקי', 'התבוננו־',
].filter((w) => !w.endsWith('־'))
/* תחילת משפט, עם מירכאה פותחת צמודה אופציונלית — מירכאה סוגרת + תג-דיבור ("…,' קרא עומר") אינה תחילת משפט */
const IMPERATIVE = new RegExp(`(?:^|[.!?:\\n(]\\s*)["״']?(${IMPERATIVE_2SG.join('|')})${E}`)

/* כינויי-קניין/יחס ביחיד (רשימה סגורה) */
const SUFFIX_2SG = [
  'לך', 'אותך', 'שלך', 'איתך', 'אתך', 'בך', 'ממך', 'עליך', 'אליך', 'לפניך', 'אחריך', 'בשבילך', 'בעבורך', 'עבורך', 'מולך', 'סביבך',
  'לידך', 'ידך', 'עיניך', 'ראשך', 'תוכך', 'מתוכך', 'בפניך', 'מעליך', 'מתחתיך', 'מאחוריך', 'אלייך', 'בעקבותיך',
]
const SUFFIX = new RegExp(`${B}(?:ו|ש|כש)?(?:${SUFFIX_2SG.join('|')})${E}`)

/* גוף ראשון ממוגדר — רק בקול התלמיד (כפתורי בחירה/אפשרויות דילמה): "אני מוותר", "הייתי מספר" */
const FIRST_PERSON = new RegExp(`${B}(?:אני|הייתי|אהיה|אבחר|אספר|אוותר|אבחר|ארצה)${E}`)

const RULES: { kind: ViolationKind; re: RegExp; voiceOnly?: boolean }[] = [
  { kind: 'slash', re: SLASH },
  { kind: 'pronoun', re: PRONOUN_ATAH },
  { kind: 'pronoun', re: PRONOUN_AT_VERB },
  { kind: 'pronoun', re: PRONOUN_AT_END },
  { kind: 'past', re: PAST },
  { kind: 'imperative', re: IMPERATIVE },
  { kind: 'suffix', re: SUFFIX },
  { kind: 'first-person', re: FIRST_PERSON, voiceOnly: true },
]

export function scanStudentText(text: string, voice = false): AddressViolation[] {
  const plain = text.replace(NIQ, '')
  const out: AddressViolation[] = []
  for (const r of RULES) {
    if (r.voiceOnly && !voice) continue
    const m = r.re.exec(plain)
    if (!m) continue
    const matched = (m[1] ?? m[0]).trim()
    out.push({ kind: r.kind, match: matched, context: plain.slice(Math.max(0, m.index - 20), m.index + m[0].length + 14).replace(/\s+/g, ' ') })
  }
  return out
}

/* מספר המופעים הכולל (לא רק הראשון בכל כלל) — להשוואת לפני/אחרי של תיקון */
export function countStudentViolations(text: string, voice = false): number {
  const plain = text.replace(NIQ, '')
  let n = 0
  for (const r of RULES) {
    if (r.voiceOnly && !voice) continue
    n += [...plain.matchAll(new RegExp(r.re.source, 'g'))].length
  }
  return n
}

/* כל המילים שסומנו בטקסט (לרמז למודל המתקן) */
export function scanStudentTextAll(text: string, voice = false): string[] {
  const plain = text.replace(NIQ, '')
  const out = new Set<string>()
  for (const r of RULES) {
    if (r.voiceOnly && !voice) continue
    for (const m of plain.matchAll(new RegExp(r.re.source, 'g'))) out.add((m[1] ?? m[0]).trim())
  }
  return [...out]
}

export interface SlotViolation extends AddressViolation { sceneId: string; field: string; key: string }

export function findAddressViolations(gd: GameData): SlotViolation[] {
  const out: SlotViolation[] = []
  for (const s of listTextSlots(gd)) for (const v of scanStudentText(s.get(), s.voice)) out.push({ ...v, sceneId: s.sceneId, field: s.field, key: s.key })
  return out
}

/* בפורמט הלינטים הקיימים (sceneId + problem + correction) */
export function lintStudentAddress(gd: GameData): { sceneId: string; problem: string; correction?: string }[] {
  return findAddressViolations(gd).map((v) => ({
    sceneId: v.sceneId,
    problem: `פנייה לתלמיד שאינה בלשון רבים (${v.kind === 'slash' ? 'צורה עם לוכסן מגדרי' : v.kind === 'first-person' ? 'גוף ראשון ממוגדר' : 'פנייה ביחיד'}): "…${v.context}…"`,
    correction: 'לשון רבים ("אתם/בחרו/שלכם"), או שם פעולה/שם עצם כשהתלמיד מדבר על עצמו',
  }))
}

/* ── בקשת תיקון אחת ── */

/* kept = מקטעים שהמודל קבע שהפנייה שנשארה בהם היא של דמות לדמות אחרת (לא אל התלמיד) — מותרת ולכן אינה נספרת כנותרת */
export interface AddressFixResult { found: number; fixed: number; remaining: SlotViolation[]; kept: string[]; failed: boolean }

/* מתקן את כל הטקסטים המסומנים בבקשה אחת (LLM), ומחיל רק ערכים שעברו את הבדיקה הדטרמיניסטית.
   best-effort: כשל בקריאה לא מפיל — remaining מחזיר מה שנותר. */
const sameText = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim()
const FIX_CHUNK = 8 /* מקטעים לבקשה — הבקשה הלוגית אחת, אך הדמיה גדולה מתחלקת: פלט ארוך נחתך, ותשומת הלב של המודל יורדת */

export async function fixStudentAddress(gd: GameData, opts: { call?: (instruction: string) => Promise<string> } = {}): Promise<AddressFixResult> {
  const viol = findAddressViolations(gd)
  if (viol.length === 0) return { found: 0, fixed: 0, remaining: [], kept: [], failed: false }
  const slots = new Map(listTextSlots(gd).map((s) => [s.key, s]))
  const keys = [...new Set(viol.map((v) => v.key))]
  let fixed = 0
  let failed = false
  const kept = new Set<string>()
  for (let at = 0; at < keys.length; at += FIX_CHUNK) {
    const chunk = keys.slice(at, at + FIX_CHUNK)
    const payload: Record<string, { text: string; voice: boolean }> = {}
    for (const k of chunk) { const s = slots.get(k); if (s) payload[k] = { text: s.get(), voice: s.voice, found: scanStudentTextAll(s.get(), s.voice) } as { text: string; voice: boolean } }
    const instruction = `${STUDENT_ADDRESS_RULE}

לפניך מקטעי טקסט (JSON: key → {"text": ..., "voice": ..., "found": [המילים שסומנו]}; טפל בכל המילים שב-found ובכל מופע נוסף כמותן) מתוך הדמיה חינוכית בעברית, שבהם נמצאה פנייה בגוף שני ביחיד/לוכסן מגדרי. שכתב כל מקטע כך שכל פנייה **אל התלמיד** תהיה בלשון רבים אחידה.
• שנה רק את הפנייה (וההתאמה הדקדוקית שנגזרת ממנה: פועל/תואר/כינוי). אל תשנה עובדות, שמות, משמעות, אורך (לא להאריך), או ניקוד קיים.
• voice=true — זה טקסט ש"אומר" התלמיד (כפתור/אפשרות בחירה): נסח בשם פעולה או שם עצם ("ויתור על האתגר", "לספר את האמת"), לא בגוף ראשון ממוגדר.
• דמות שמדברת אל דמות אחרת/בעל חיים (לא אל התלמיד) — **השאר כמות שהוא** (למשל ילד שמדבר אל כלב: \"אתה אבוד?\"). דמות שפונה אל התלמיד/השחקן (גם דמות היסטורית) — לשון רבים. אם נשארה בטקסט פנייה של דמות לדמות — החזר characterSpeechLeft=true.
• מילת היחס "את" ("את הספר") אינה פנייה — אל תשנה אותה.
החזר JSON תקין עם **אותם keys בדיוק**; כל ערך הוא אובייקט {"text": "הטקסט המתוקן (מחרוזת)", "characterSpeechLeft": true|false}. ללא טקסט נוסף.

${JSON.stringify(payload, null, 0)}`
    try {
      const out = opts.call
        ? await opts.call(instruction)
        : engineFor('phrasing') === 'gemini' ? await callGeminiText(instruction, 8000, true) : await callHaiku([{ role: 'user', content: instruction }], 8000)
      const rew = extractJson(out) as Record<string, unknown>
      if (rew && typeof rew === 'object') {
        for (const k of chunk) {
          const s = slots.get(k)
          const raw = rew[k]
          const v = typeof raw === 'string' ? raw : (raw && typeof raw === 'object' ? (raw as { text?: unknown }).text : undefined)
          const charLeft = !!(raw && typeof raw === 'object' && (raw as { characterSpeechLeft?: unknown }).characterSpeechLeft === true)
          if (!s) continue
          const orig = s.get()
          const origCount = countStudentViolations(orig, s.voice)
          if (typeof v !== 'string' || !v.trim()) { if (charLeft && origCount > 0) kept.add(k); continue }
          if (sameText(v, orig)) { if (charLeft && origCount > 0) kept.add(k); continue }
          const newCount = countStudentViolations(v, s.voice)
          /* מקבלים תיקון רק אם הוא נקי, או שיפור שנשארה בו (לפי המודל) רק פנייה של דמות לדמות */
          if (newCount === 0 || (charLeft && newCount <= origCount)) {
            s.set(v.trim())
            if (newCount < origCount) fixed++
            if (newCount > 0) kept.add(k)
          }
        }
      }
    } catch (err) {
      failed = true
      logError('[address] בקשת תיקון הפנייה נכשלה:', err instanceof Error ? err.message : err)
    }
  }
  return { found: keys.length, fixed, remaining: findAddressViolations(gd).filter((v) => !kept.has(v.key)), kept: [...kept], failed }
}
