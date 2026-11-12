/* טקסט של תשובה שעשוי להכיל שבר: השבר מוצג כמונה מעל קו ומכנה מתחתיו, ולא כ-"5/6".
   pure בתצוגה בלבד: הטקסט עצמו (הנתונים, ההשוואות, הטלמטריה) לא משתנה.
   מזהה `מספר/מספר` (גם עם שלם לפניו: "1 1/2") ואת תווי השבר של יוניקוד (½ ⅓ ⅖ ...).
   לא נוגע בתאריכים ובביטויים עם שני לוכסנים ("12/5/2024"), ולא בלוכסן בין מילים ("נכון/לא נכון"). */
import type { CSSProperties, ReactNode } from 'react'
import { splitFractions } from '../lib/fractions'

const WRAP: CSSProperties = {
  display: 'inline-flex', flexDirection: 'column', alignItems: 'center', verticalAlign: 'middle',
  lineHeight: 1.05, margin: '0 .18em', direction: 'ltr', fontVariantNumeric: 'lining-nums',
}
const NUM: CSSProperties = { padding: '0 .22em', fontSize: '.86em' }
const DEN: CSSProperties = { padding: '0 .22em', fontSize: '.86em', borderTop: '.09em solid currentColor', marginTop: '.06em', paddingTop: '.04em' }

export function Fraction({ num, den, label }: { num: string; den: string; label?: string }): ReactNode {
  return (
    <span data-fraction role="math" aria-label={label ?? `${num} חלקי ${den}`} style={WRAP}>
      <span aria-hidden="true" style={NUM}>{num}</span>
      <span aria-hidden="true" style={DEN}>{den}</span>
    </span>
  )
}

/* טקסט עם שברים מוצגים כשבר אמיתי. טקסט בלי שבר מוחזר כמו שהוא */
export function MathText({ text }: { text: string }): ReactNode {
  const parts = splitFractions(text)
  if (parts.length === 1 && parts[0].kind === 'text') return text
  return <>{parts.map((p, i) => (p.kind === 'fraction' ? <Fraction key={i} num={p.num!} den={p.den!} /> : <span key={i}>{p.text}</span>))}</>
}
