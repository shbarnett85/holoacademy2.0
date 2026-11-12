# מדריך המרה לעיצוב החדש ("הספרייה ההולוגרפית") — חלק א': עיצוב

המסמך הזה הוא ההנחיה המחייבת לכל מי שממיר קובץ לשפה החזותית החדשה. מקור הצבעים היחיד: `src/styles/tokens.css`.

## מה לא משנים

- **לוגיקה, נתונים, הרשאות, התנהגות, טקסטים.** רק סגנון. לא משנים מחרוזות שמוצגות למשתמש, לא props, לא state, לא handlers.
- **פריסה** רק כשהעיצוב החדש דורש (למשל מקום לצל קשיח). לא מזיזים אלמנטים, לא משנים גדלי גופן, ריפוד או רוחב בלי סיבה.
- **שמות מחלקות ו-`data-*`**: נשארים בדיוק (בדיקות e2e נשענות עליהם): `.holo-panel`, `.holo-button`, `.holo-stage`, `.holo-text-area`, `.holo-side-panel`, `.holo-answers`, `.holo-text-glow`, `[data-end-screen]`, `[data-gem-counter]`, `[data-lesson-card]` וכו'.
- **גופנים**: לא נוגעים (`--font-display`, `--font-mono`, Heebo, גדלים).
- **קבצים אסורים**: קבצי לוגו ו-favicon ב-`public/`, `public/dr-holo/**`, `public/lab/**`, `src/features/player/lab/**`, `src/features/player/DrHoloHologram.tsx`, `src/features/player/drHoloClips.ts`, `src/features/deck/**`, כל `server/**` (כולל הפרומפטים ו-`{DR_HOLO}`).
- אין סיסמאות, טוקנים או מפתחות בקוד.

## הטוקנים

```
רקע הממשק            var(--color-machine-bg)
פס כותרת / סרגל ניווט var(--color-machine)        טקסט עליו: דיו בלבד
כותרות                var(--color-machine-deep)   רק על machine-bg / surface / machine-tint
אזור שבו ה-AI מציע    var(--color-machine-tint)
דוקטור הולו, קריסטלים var(--color-holo)           לא לטקסט, לא לאלמנט רגיל
כפתור                 var(--color-action)  לחוץ: var(--color-action-pressed)
שם / אווטאר           var(--color-human-soft)     (טקסט עליו: דיו)
התקדמות (מילוי)       var(--color-human)          לא לטקסט על לבן
ממצא על תלמיד/ה       רקע var(--color-human-tint) + טקסט var(--color-human-deep)
טקסט, קו מתאר, צל     var(--color-ink)            אין שחור טהור
משטח                  var(--color-surface)
טקסט משני             var(--color-muted)          לא על machine
נכון / שגוי           var(--color-correct) / var(--color-wrong)   תמיד עם סימן ומילה. כטקסט: רק על משטח לבן
קו מפריד דק           var(--color-line) / var(--color-line-strong)
רקע עדין לשורה/שדה    var(--color-ink-wash)
מסך כהה מאחורי חלון   var(--color-scrim)
רקע משוב עדין         var(--color-correct-tint) / var(--color-wrong-tint)   טקסט צבעוני עליו: var(--color-correct-text) / var(--color-wrong-text)
כפתור מנוטרל          var(--color-disabled) + טקסט muted
מקצוע                 var(--subject-<code>)  רק לתגיות ולפס/מסגרת קטנה (דרך subjectVisual / SubjectTag)
```

קו וצל:

```
תלמיד:  border: var(--border-student)  box-shadow: var(--shadow-student)  radius: var(--radius-student)  (18px)
כפתור:  box-shadow: var(--shadow-button)  radius: var(--radius-button) (12px)
צוות:   border: var(--border-staff)    box-shadow: var(--shadow-staff)    radius: var(--radius-staff)    (12px)
```

ב-TypeScript: `import { tk, alpha, mix, LINE, SHADOW } from '<path>/styles/tokens'` ו-`import { panelStudent, panelStaff, panelAi, panelFinding, nameChip, fieldStyle, progressTrack, progressFill, modalBackdrop } from '<path>/styles/ui'`.
שקיפות: `alpha('color-ink', 12)` (או `color-mix(in srgb, var(--color-ink) 12%, transparent)` ב-CSS). גוון אטום: `mix('color-correct', 15)`.

## הכללים

1. **אין ערך צבע קשיח**: לא hex, לא `rgb()/rgba()/hsl()`, לא שלשת מספרים (`'47,243,255'`), לא שמות צבעים (`white`, `black`...). רק טוקנים.
2. **אין מעברי צבע** (`linear-gradient` / `radial-gradient` / `conic-gradient`). מילוי שטוח. (יוצאים מהכלל, שכבר מטופלים בנפרד: קריסטל מלא, דוקטור הולו בניצחון מושלם.)
3. **אין זוהר**: לא צל מטושטש (`0 0 20px ...`, `0 8px 30px ...`), לא `text-shadow`, לא `drop-shadow`, לא `backdrop-filter`. צל = `var(--shadow-*)` בלבד (קשיח, בדיו) או בלי צל.
4. **אין רקע כהה**. רקע עמוד: `--color-machine-bg`. משטח תוכן: לבן עם קו דיו וצל קשיח (`panelStudent` / `panelStaff`). משטח בתוך משטח: בלי צל, עם `1px solid var(--color-line)` או רקע `--color-ink-wash`.
5. **כל כפתור (כל אלמנט לחיץ שמבצע פעולה או בחירה)**: `className="holo-button"` (במסכי צוות: `"holo-button holo-button--staff"`; קטן: מוסיפים `holo-button--sm`). המחלקה נותנת רקע action, טקסט דיו, קו דיו, צל קשיח, ומצב לחוץ. **מסירים מה-style של הכפתור** את `background`, `color`, `border`, `boxShadow`, `textShadow` (משאירים ריפוד, גודל גופן, רוחב וכו').
   - נבחר: מוסיפים `is-selected` (רקע דיו, טקסט לבן). או `aria-pressed="true"`.
   - נכון: `is-correct` + הסימן ✓ והמילה. שגוי: `is-wrong` + ✗ והמילה. (הסימן והמילה חובה, לא צבע לבד. אם כבר קיימים, משאירים.)
   - מנוטרל: `disabled` (המחלקה מטפלת).
6. **תכלת (action / holo) רק על אלמנט לחיץ**, חוץ מדוקטור הולו, קריסטלים ואיורים. מה שאינו לחיץ (תג, מסגרת, אייקון דקורטיבי, כותרת) לא בתכלת.
7. **ניווט וקישורים**: טקסט בדיו (`className="holo-link"` לקישור טקסט). לשונית פעילה: קו תחתון בדיו.
8. **טקסט**: גוף בדיו, משני ב-muted, כותרות ב-machine-deep (לא על `--color-machine`).
9. **שם ואווטאר של אדם** (תלמיד/ה, מורה): רקע `--color-human-soft`, טקסט דיו, קו דיו (`nameChip`).
10. **התקדמות**: מסילה `--color-ink-wash` עם קו דיו, מילוי `--color-human` (`progressTrack` / `progressFill`).
11. **משוב**: נכון/שגוי תמיד עם סימן ומילה. פאנל משוב: רקע `--color-correct-tint` / `--color-wrong-tint`, טקסט דיו, כותרת ב-correct / wrong.
12. **פוקוס מקלדת**: `outline: 3px solid var(--color-machine-deep); outline-offset: 2px` (המחלקה `holo-button` כבר כוללת).
13. **SVG**: `var()` אסור באטריביוט (`fill="var(...)"` לא עובד). משתמשים ב-`style={{ fill: 'var(--color-ink)' }}`.
14. **canvas / WebGL**: קוראים ערכים בזמן ריצה: `tokenRgb('--color-holo')`, `tokenRgba('--color-ink', .4)` מ-`styles/tokens`. לא מספרים קשיחים.
15. **תנועה**: לא מוסיפים אנימציות. הבזק לא מהיר מפעם בשנייה. מכבדים `prefers-reduced-motion` (יש כלל גלובלי ב-`index.css`).
16. **ניגודיות AA 4.5:1** לטקסט רגיל. צירופים אסורים לטקסט: machine-deep או muted על `--color-machine`; correct או wrong על machine-bg; human או holo כטקסט.

## מיפוי מהיר מהישן

| ישן | חדש |
|---|---|
| רקע כהה, `--holo-bg`, `--holo-bg-deep`, `--holo-surface`, rgba כהה | `--color-machine-bg` (עמוד) או `--color-surface` (משטח) |
| טקסט בהיר, `--holo-text`, `--holo-text-bright`, `#fff` על כהה | `--color-ink` |
| אפור-כחלחל משני | `--color-muted` |
| ציאן (`--holo-cyan`, `--holo-cyan-bright`, `47,243,255`, `0,246,255`) | כפתור → מחלקת `holo-button`; כותרת → `--color-machine-deep`; קו/מסגרת → דיו או `--color-line`; קישוט/זוהר → מוחקים |
| כחול / סגול (`--holo-blue`, `--holo-purple`) | `--color-machine-deep` (טקסט) / `--color-machine` (מילוי) / `--color-machine-tint` (רקע עדין) |
| מג'נטה | אזור מורה → משפחת human; אחרת machine-deep |
| כתום / ענבר / צהוב | `--color-human` (מילוי), `--color-human-deep` על `--color-human-tint` (הודעה / אזהרה) |
| ירוק / אדום-ורוד | `--color-correct` / `--color-wrong` + סימן ומילה |
| `window.HoloTint('r,g,b', a)` ומשתני שלשות | `alpha('<token>', pct)` |
| `--holo-glow*`, קווי סריקה, כדורי זוהר, גליץ' | מוחקים |

## בדיקה לפני סיום

```
npx tsx e2e/redesign/scanColors.ts <הקבצים או התיקיות שלך>     # חייב להסתיים ב-total: 0
npx tsc -b                                                     # בלי שגיאות בקבצים שלך
npx vitest run <בדיקות שנוגעות לקבצים שלך>
```

חריגה מוצדקת באמת (למשל מסכת שקיפות שאינה צבע): הערה באותה שורה `/* redesign-allow: <סיבה> */`, ומדווחים עליה.
