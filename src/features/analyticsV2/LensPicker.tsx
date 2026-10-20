/* בורר העדשה של מורה אורח: מחנך/ת | מורה מקצועי/ת | מנהל/ת (+ בחירת מקצוע למורה מקצועי).
   גלוי ובולט בחריץ lensSwitcher של המעטפת, עם משפט הסבר אחד. הנבחר מסומן בוי ומילה, לא בצבע בלבד. */
import { Icon, FONT, MIN_TARGET, ModeToggle, RADIUS, T } from '../teacherUi'
import type { Lens } from '../../shared/types/analyticsV2'
import { useV2Env } from './context'
import { L } from './labels'

const ORDER: Lens[] = ['homeroom', 'subject_teacher', 'admin']

export default function LensPicker() {
  const env = useV2Env()
  const lenses = ORDER.filter((l) => env.cfg.availableLenses.includes(l))
  return (
    <div data-lens-picker style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
      <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, maxWidth: 300, fontSize: 14, lineHeight: 1.45, color: T.textSoft }}>
        <span style={{ color: T.accent, display: 'inline-flex' }}><Icon name="info" size={20} /></span>
        {L.lensSentence}
      </p>
      <ModeToggle ariaLabel={L.lensLabel} value={env.lens} onChange={(id) => env.goLens(id as Lens, id === 'subject_teacher' ? env.subject ?? env.cfg.subjects[0]?.code : undefined)}
        options={lenses.map((l) => ({ id: l, label: L.lensNames[l] }))} />
      {env.lens === 'subject_teacher' && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: T.text }}>
          {L.subjectPicker}:
          <select value={env.subject ?? ''} onChange={(e) => env.goLens('subject_teacher', e.target.value)}
            style={{ minHeight: MIN_TARGET + 4, padding: '0 12px', borderRadius: RADIUS.md, border: `2px solid ${T.controlBorder}`, background: T.surface, color: T.text, fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
            {env.cfg.subjects.map((s) => <option key={s.code} value={s.code}>{s.nameHe}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}
