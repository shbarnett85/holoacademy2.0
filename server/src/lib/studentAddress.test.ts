import { describe, expect, it } from 'vitest'
import type { GameData } from './questSchemas.js'
import { findAddressViolations, fixStudentAddress, lintStudentAddress, listTextSlots, scanStudentText } from './studentAddress.js'

const kinds = (t: string, voice = false) => scanStudentText(t, voice).map((v) => v.kind)
const clean = (t: string, voice = false) => expect(scanStudentText(t, voice), t).toEqual([])
const flagged = (t: string, voice = false) => expect(scanStudentText(t, voice).length, t).toBeGreaterThan(0)

describe('בדיקת הפנייה לתלמיד — הפרות', () => {
  it('"אתה" ו"את" בפנייה', () => {
    flagged('אתה יוצא מהפורטל אל האגורה.')
    flagged('את מגיעה אל השער.')
    flagged('מה את חושבת?')
    flagged('ומה את?')
    expect(kinds('אתה יוצא')).toContain('pronoun')
  })
  it('ציווי ביחיד בתחילת משפט (זכר ונקבה)', () => {
    flagged('בחר את התשובה הנכונה.')
    flagged('בחרי את התשובה הנכונה.')
    flagged('קרא היטב. דמיין שאתם שם.')
    flagged('שימו לב. גש אל השער בזהירות.')
    flagged('"המשך!" אמר ד"ר הולו.'.replace('המשך', 'המשיכי'))
  })
  it('עבר ביחיד וכינויי "לך/שלך"', () => {
    flagged('גילית את הסוד.')
    flagged('הצבת את הכוח בידיים של העם — מה בחרת?')
    flagged('הדוקטור שלח לקרוא לך.')
    flagged('זו המשימה שלך.')
    flagged('הסוחר ממתין לך ולחבריך'.replace('ולחבריך', 'ואיתך'))
  })
  it('לוכסן מגדרי בכל צורה', () => {
    flagged('בחר/י את התשובה')
    flagged('אתה/את מוכן/ה?')
    flagged('אני מוותר/ת על האתגר')
    flagged('כל תלמיד/ה יכול/ה לנסות')
    flagged('מוכן(ה) להמשיך?')
  })
  it('גוף ראשון ממוגדר — רק בקול התלמיד', () => {
    expect(kinds('אני מוותר על האתגר', true)).toContain('first-person')
    expect(kinds('הייתי מספר את האמת', true)).toContain('first-person')
    clean('"אני מוכן לשלם," אמר הסוחר.', false) /* דמות מדברת על עצמה */
  })
  it('גם עם ניקוד', () => {
    flagged('אַתָּה יוֹצֵא מֵהַפּוֹרְטָל')
    flagged('בְּחַר אֶת הַתְּשׁוּבָה'.replace('אֶת', 'אֶת'))
  })
})

describe('בדיקת הפנייה לתלמיד — אסור לסמן (אפס false-positive)', () => {
  it('"את" כמילת יחס', () => {
    clean('קראו את הספר ובחרו את התשובה הנכונה.')
    clean('בדקו את מערכת השמש ואת הכוכבים.')
    clean('מצאו את שם הנהר ואת הגבעה.')
    clean('הם לקחו את מה שנשאר ואת כל הציוד.')
    clean('חשבו על כך: את זה לא ידעתם.')
    clean('הסוחר שאל את הילדה מגיעה מאיפה', false)
    clean("הוא כבר סיים את 'לידת ונוס' — ציור מפורסם.") /* "את" לפני מירכאה פותחת */
    clean("'ביסקוויט,' קרא עומר בקול רך. 'חכו!' קרא הסוחר.") /* תג-דיבור אחרי מירכאה סוגרת */
  })
  it('לשון רבים תקינה', () => {
    clean('אתם יוצאים מהפורטל. בחרו את התשובה. מה אתם חושבים? גיליתם את הסוד.')
    clean('המשיכו אל השער, דמיינו את הכיכר וזכרו את מה שלמדתם. הדוקטור שלח לקרוא לכם.')
    clean('ויתור על האתגר', true)
    clean('לספר את האמת', true)
  })
  it('מילים דומות שאינן פנייה', () => {
    clean('המלך הכריז על המלחמה, וגלי הים הכו בחוף.') /* "מלך", "גלי" */
    clean('המשך הדרך היה קשה. שאלת המפתח נשארה פתוחה. הצלחת המשימה הייתה בטוחה.')
    clean('הבנת הנקרא חשובה. התאמת הזוגות נבדקת. הוא קרא את המכתב.')
    clean('הוא מצא חרס עתיק. סדר הפעולות נקבע. ספר הלימוד פתוח.')
    clean('לחץ חברתי הוא גורם חזק. הצלת הגילוי המדעי הייתה מרגשת. אספת האזרחים התכנסה. בניית התבה ארכה שנים. כתבת הטלוויזיה הגיעה.')
    clean('ו/או כל אחד מהם; 1/2 מהעוגה; ק"מ/ש')
  })
  it('דמות בגוף שלישי — לא נתפסת', () => {
    clean('היא נכנסת לחדר, הולכת אל השולחן ופותחת את הספר.')
    clean('הכוהנת קוראת לילדים והם עונים לה.')
  })
})

describe('מבנה השיעור — כל שדות הטקסט', () => {
  const gd = (): GameData => ({
    entrySceneId: 'a',
    scenes: [
      { id: 'a', title: 'בחר את הדרך', narrative: 'אתה נכנס לחדר.', drHoloDialog: 'מה היית עושה?', choices: [{ id: 'c1', text: 'אני מוותר/ת', nextSceneId: 'b' }], nextSceneId: 'b' },
      {
        id: 'b', title: 'שער', narrative: 'השער סגור.',
        puzzle: { type: 'multipleChoice', question: 'מה גילית?', explanationCorrect: 'נכון! ראית נכון.', explanationIncorrect: 'לא.', choices: [{ id: 'x', text: 'הנילוס', isCorrect: true }, { id: 'y', text: 'הים', isCorrect: false }] },
      },
    ],
    endingGood: { title: 'ניצחון', narrative: 'הצלחתם.', drHoloDialog: 'כל הכבוד לך' },
  } as unknown as GameData)

  it('מוצא הפרות בכל סוגי השדות ומציין את הסצנה', () => {
    const v = findAddressViolations(gd())
    const fields = new Set(v.map((x) => `${x.sceneId}:${x.field}`))
    expect(fields.has('a:title')).toBe(true)
    expect(fields.has('a:narrative')).toBe(true)
    expect(fields.has('a:dialog')).toBe(true)
    expect(fields.has('a:choice')).toBe(true)
    expect(fields.has('b:question')).toBe(true)
    expect(fields.has('b:explanation')).toBe(true)
    expect(fields.has('__endingGood__:dialog')).toBe(true)
    expect(lintStudentAddress(gd()).length).toBe(v.length)
    expect(listTextSlots(gd()).some((s) => s.key === 's:a:ch:c1' && s.voice)).toBe(true)
  })

  it('בקשת תיקון אחת: מחילה רק תיקון נקי, ומחזירה מה שנשאר', async () => {
    const g = gd()
    const calls: string[] = []
    const res = await fixStudentAddress(g, {
      call: async (instr) => {
        calls.push(instr)
        return JSON.stringify({
          's:a:title': 'בחרו את הדרך', 's:a:narrative': 'אתם נכנסים לחדר.', 's:a:dlg': 'מה אתם הייתם עושים?', 's:a:ch:c1': 'ויתור על האתגר',
          's:b:q': 'מה גיליתם?', 's:b:ec': 'נכון! ראיתם נכון.', /* ה-ei לא הוחזר */ 'end:endingGood:dlg': 'כל הכבוד לכם',
        })
      },
    })
    expect(calls).toHaveLength(1)
    expect(res.fixed).toBeGreaterThanOrEqual(7)
    expect(res.remaining).toEqual([])
    const sc = g.scenes[0] as unknown as { narrative: string; choices: { text: string }[] }
    expect(sc.narrative).toBe('אתם נכנסים לחדר.')
    expect(sc.choices[0].text).toBe('ויתור על האתגר')
  })

  it('תיקון שעדיין מפר לא מוחל; כשל בקריאה לא מפיל', async () => {
    const g = gd()
    const bad = await fixStudentAddress(g, { call: async () => JSON.stringify({ 's:a:narrative': 'את נכנסת לחדר.' }) })
    expect((g.scenes[0] as unknown as { narrative: string }).narrative).toBe('אתה נכנס לחדר.')
    expect(bad.remaining.length).toBeGreaterThan(0)
    const boom = await fixStudentAddress(gd(), { call: async () => { throw new Error('boom') } })
    expect(boom.failed).toBe(true)
    expect(boom.fixed).toBe(0)
  })

  it('דמות שמדברת לדמות אחרת: המודל משאיר ומדווח characterSpeechLeft — לא נספר כנותר; פלט אובייקט {text} נתמך', async () => {
    const g = {
      entrySceneId: 'a',
      scenes: [{ id: 'a', title: 'ברחוב', narrative: "אתה יוצא לרחוב. עומר שואל את הכלב: 'אתה אבוד?'" }, { id: 'b', title: 'עוד', narrative: "'ראה כאן,' אומר הנפח." }],
    } as unknown as GameData
    const r = await fixStudentAddress(g, {
      call: async () => JSON.stringify({
        's:a:narrative': { text: "אתם יוצאים לרחוב. עומר שואל את הכלב: 'אתה אבוד?'", characterSpeechLeft: true },
        's:b:narrative': { text: "'ראו כאן,' אומר הנפח.", characterSpeechLeft: false },
      }),
    })
    expect(r.fixed).toBe(2)
    expect(r.kept).toEqual(['s:a:narrative'])
    expect(r.remaining).toEqual([])
    expect((g.scenes[0] as unknown as { narrative: string }).narrative).toContain('אתם יוצאים')
    expect((g.scenes[0] as unknown as { narrative: string }).narrative).toContain('אתה אבוד')
    /* מקטע שהמודל לא שינה ולא דיווח על דמות — נשאר נותר */
    const g2 = { entrySceneId: 'a', scenes: [{ id: 'a', title: 't', narrative: 'אתה נכנס.' }] } as unknown as GameData
    const r2 = await fixStudentAddress(g2, { call: async () => JSON.stringify({ 's:a:narrative': { text: 'אתה נכנס.', characterSpeechLeft: false } }) })
    expect(r2.remaining.length).toBe(1)
  })

  it('שיעור נקי: אין קריאת מודל', async () => {
    const clean = { entrySceneId: 'a', scenes: [{ id: 'a', title: 'השער', narrative: 'אתם נכנסים.' }] } as unknown as GameData
    let called = false
    const r = await fixStudentAddress(clean, { call: async () => { called = true; return '{}' } })
    expect(called).toBe(false)
    expect(r.found).toBe(0)
  })
})
