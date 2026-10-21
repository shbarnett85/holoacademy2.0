import { useMemo, useState } from 'react'
import { apiFetch } from '../../shared/lib/api'
import { PRIMARY_SCREEN, fitsScreen, gradeBandOfLevel, questionWordBudget, sceneDisplayText, OPTION_WORD_BUDGET, wordCount } from '../../shared/lib/sceneText'
import { useEscToClose } from '../../shared/ui/useModalA11y'
import type { GeneratedQuest } from './creatorStore'

type Scene = GeneratedQuest['game_data']['scenes'][number]

interface Props {
  questId: string
  scene: Scene
  onClose: () => void
  onSaved: (scene: Scene) => void
  /* יצירה מחדש של התמונה — מנוהל ב-QuestPreview (מעדכן את ה-store) */
  onRegenerateImage: (sceneId: string) => void
  regenerating: boolean
  /* יעדי הלמידה של ההדמיה — לבורר תיוג האתגר (רק כשהוגדרו יעדים ביצירה) */
  objectives?: { id: string; text: string }[]
  /* רמת הטקסט של ההדמיה — שכבת הגיל לבדיקת אורך הטקסט */
  readingScale?: number | null
}

interface ShortenSide { narrative: string; drHoloDialog: string; words: number; pages: number }
interface ShortenProposal { needed: boolean; ok: boolean; reasons: string[]; before?: ShortenSide; after?: ShortenSide; checks?: { grammar: string[]; facts: string[] } }

const fieldStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--t207)',
  border: '1px solid var(--t208)',
  borderRadius: '0.6rem',
  color: 'var(--t301)',
  padding: '0.6rem 0.8rem',
  fontSize: '0.95rem',
  resize: 'vertical',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.4rem',
  fontSize: '0.85rem',
  fontWeight: 700,
  color: 'var(--t300)',
}

/* מודאל עריכת סצנה — נרטיב, חידה, ופרומפט תמונה */
export default function SceneEditModal({
  questId,
  scene,
  onClose,
  onSaved,
  onRegenerateImage,
  regenerating,
  objectives = [],
  readingScale = null,
}: Props) {
  const [title, setTitle] = useState(scene.title ?? '')
  const [narrative, setNarrative] = useState(scene.narrative ?? '')
  const [dialog, setDialog] = useState(scene.drHoloDialog ?? '')
  /* כלל "אורך טקסט לתלמיד": האם הטקסט נכנס במסך אחד (fitsScreen מכוילת מול Chrome) + הצעת קיצור לאישור */
  const [shortenState, setShortenState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [proposal, setProposal] = useState<ShortenProposal | null>(null)
  const [shortenMsg, setShortenMsg] = useState('')
  const [imagePrompt, setImagePrompt] = useState(scene.imagePrompt ?? '')

  const hasPuzzle = !!scene.puzzle
  const band = gradeBandOfLevel(readingScale)
  const fit = useMemo(
    () => fitsScreen(sceneDisplayText({ narrative, drHoloDialog: dialog }), band, PRIMARY_SCREEN, { actionRows: Math.max(1, (scene.puzzle ? 1 : 0) + (scene.collectableItem ? 1 : 0)) }),
    [narrative, dialog, band, scene.puzzle, scene.collectableItem],
  )
  async function requestShorten() {
    setShortenState('loading'); setShortenMsg(''); setProposal(null)
    try {
      const res = await apiFetch(`/api/quests/${questId}/scene/${encodeURIComponent(scene.id)}/shorten`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ narrative, drHoloDialog: dialog }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? 'הצעת הקיצור נכשלה')
      const p = body as ShortenProposal
      if (!p.needed) { setShortenState('idle'); setShortenMsg('הטקסט כבר נכנס במסך אחד.'); return }
      if (!p.ok || !p.after) { setShortenState('error'); setShortenMsg(p.reasons.join(' · ') || 'לא הצלחנו לקצר בלי לאבד עובדה שהאתגר נשען עליה. אפשר לקצר ידנית.'); return }
      setProposal(p); setShortenState('ready')
    } catch (e) {
      setShortenState('error'); setShortenMsg(e instanceof Error ? e.message : 'הצעת הקיצור נכשלה')
    }
  }
  function approveShorten() {
    if (!proposal?.after) return
    setNarrative(proposal.after.narrative); setDialog(proposal.after.drHoloDialog)
    setProposal(null); setShortenState('idle'); setShortenMsg('הקיצור הוחל — לא לשכוח לשמור את הסצנה.')
  }
  function cancelShorten() { setProposal(null); setShortenState('idle'); setShortenMsg('') }
  const puzzleType = scene.puzzle?.type
  const [question, setQuestion] = useState(scene.puzzle?.question ?? '')
  const [choices, setChoices] = useState(scene.puzzle?.choices ?? [])
  const [explCorrect, setExplCorrect] = useState(scene.puzzle?.explanationCorrect ?? '')
  const [explIncorrect, setExplIncorrect] = useState(scene.puzzle?.explanationIncorrect ?? '')

  /* שדות ספציפיים-לסוג — כדי שלכל סוג אתגר תהיה דרך עריכה (לא רק בחירה-מרובה) */
  const [words, setWords] = useState(scene.puzzle?.words ?? [])              // wordSearch
  const [pairs, setPairs] = useState(scene.puzzle?.pairs ?? [])              // memory
  const [sentence, setSentence] = useState(scene.puzzle?.sentence ?? '')     // wordCompletion
  const [answers, setAnswers] = useState(scene.puzzle?.answers ?? (scene.puzzle?.answer ? [scene.puzzle.answer] : []))
  const [wordBank, setWordBank] = useState(scene.puzzle?.wordBank ?? [])
  const [items, setItems] = useState(scene.puzzle?.items ?? [])             // sequenceOrder
  const [hangmanAnswer, setHangmanAnswer] = useState(scene.puzzle?.answer ?? '') // hangman
  const [situation, setSituation] = useState(scene.puzzle?.situation ?? '') // moralDilemma
  const [moralChoices, setMoralChoices] = useState(scene.puzzle?.moralChoices ?? [])
  const [quizQuestions, setQuizQuestions] = useState(scene.puzzle?.questions ?? []) // finalQuiz
  const [objectiveId, setObjectiveId] = useState(scene.puzzle?.objectiveId ?? '')   // תיוג יעד למידה

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateChoice(id: string, text: string) {
    setChoices((cs) => cs.map((c) => (c.id === id ? { ...c, text } : c)))
  }
  function updateList(setter: typeof setWords, idx: number, value: string) {
    setter((arr) => arr.map((v, i) => (i === idx ? value : v)))
  }
  function removeFromList(setter: typeof setWords, idx: number) {
    setter((arr) => arr.filter((_, i) => i !== idx))
  }

  /* שמירת הסצנה (PATCH) ועדכון ה-state בהורה — ללא סגירת המודאל. מחזיר אם הצליח. */
  async function persist(): Promise<boolean> {
    /* ולידציית כותרת: לא ריקה, ולא ארוכה משיוצג יפה בכותרת הסצנה במשחק */
    const t = title.trim()
    if (!t) throw new Error('כותרת הסצנה לא יכולה להיות ריקה')
    if (t.length > 80) throw new Error('כותרת הסצנה ארוכה מדי (עד 80 תווים)')
    const payload: Record<string, unknown> = { sceneId: scene.id, title: t, narrative, imagePrompt }
    if (dialog !== (scene.drHoloDialog ?? '')) payload.drHoloDialog = dialog
    if (hasPuzzle) {
      const puzzlePayload: Record<string, unknown> = {
        question,
        explanationCorrect: explCorrect,
        explanationIncorrect: explIncorrect,
      }
      /* שולחים כל שדה ספציפי-לסוג רק אם היה קיים במקור — לא לדרוס חידה עם מבנה ריק */
      if (scene.puzzle?.choices) puzzlePayload.choices = choices
      if (scene.puzzle?.words) puzzlePayload.words = words
      if (scene.puzzle?.pairs) puzzlePayload.pairs = pairs
      if (scene.puzzle?.sentence !== undefined) puzzlePayload.sentence = sentence
      if (scene.puzzle?.answers) puzzlePayload.answers = answers
      else if (scene.puzzle?.answer !== undefined && puzzleType !== 'hangman') puzzlePayload.answer = answers[0] ?? ''
      if (scene.puzzle?.wordBank) puzzlePayload.wordBank = wordBank
      if (scene.puzzle?.items) puzzlePayload.items = items
      if (puzzleType === 'hangman') puzzlePayload.answer = hangmanAnswer
      if (scene.puzzle?.situation !== undefined) puzzlePayload.situation = situation
      if (scene.puzzle?.moralChoices) puzzlePayload.moralChoices = moralChoices
      if (scene.puzzle?.questions) puzzlePayload.questions = quizQuestions
      if (objectives.length > 0) puzzlePayload.objectiveId = objectiveId || null
      payload.puzzle = puzzlePayload
    }
    const res = await apiFetch(`/api/quests/${questId}/scene`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error ?? 'שמירת הסצנה נכשלה')
    }
    const { scene: updated } = await res.json()
    onSaved(updated)
    return true
  }

  async function save() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await persist()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שמירת הסצנה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  /* "צור תמונה" — שומר קודם את הפרומפט הערוך (כדי שהתמונה תיווצר ממנו), ואז מרנדר מחדש */
  async function generateFromPrompt() {
    if (saving || regenerating) return
    setError(null)
    try {
      await persist()
      onRegenerateImage(scene.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שמירת הסצנה נכשלה')
    }
  }

  useEscToClose(onClose)

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: 'var(--t238)', backdropFilter: 'blur(4px)', zIndex: 60 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="עריכת סצנה"
    >
      <div
        className="holo-panel w-full"
        style={{
          maxWidth: '40rem',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: 'var(--holo-glow)',
          borderColor: 'var(--t300)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="holo-text-glow text-xl font-black">✏️ עריכת סצנה — {scene.title}</h2>
          <button
            onClick={onClose}
            className="cursor-pointer text-xl"
            style={{ color: 'var(--t301)', opacity: 0.6 }}
            title="סגור"
          >
            ✕
          </button>
        </div>

        {/* כותרת הסצנה */}
        <div className="mb-4">
          <label style={labelStyle}>כותרת הסצנה</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            style={{ ...fieldStyle, padding: '0.5rem 0.8rem', fontWeight: 700 }}
            placeholder="כותרת הסצנה…"
            dir="rtl"
          />
        </div>

        {/* נרטיב */}
        <div className="mb-4">
          <label style={labelStyle}>טקסט נרטיב</label>
          <textarea
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            rows={6}
            style={fieldStyle}
            placeholder="הטקסט הסיפורי של הסצנה…"
          />
          {/* דברי ד״ר הולו — חלק מטקסט הסצנה שהתלמיד רואה (נספר באורך) */}
          {(scene.drHoloDialog !== undefined || dialog) && (
            <div className="mt-2">
              <label style={labelStyle}>דברי ד״ר הולו (מוצגים בתוך הטקסט)</label>
              <textarea value={dialog} onChange={(e) => setDialog(e.target.value)} rows={2} style={fieldStyle} placeholder="משפט קצר של ד״ר הולו…" />
            </div>
          )}
          {/* כלל "אורך טקסט לתלמיד": תג + קיצור לאישור */}
          <div data-scene-fit={fit.fits ? 'ok' : 'long'} className="mt-2" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {fit.fits ? (
              <span style={{ fontSize: 13, color: 'var(--t300)' }}>{fit.words} מילים · נכנס במסך אחד של התלמיד</span>
            ) : (
              <>
                <span style={{ fontSize: 13, fontWeight: 800, padding: '3px 10px', borderRadius: 20, border: '1.5px solid #ffb84d', color: '#ffb84d' }}>
                  ארוך מדי למסך אחד · {fit.words} מילים · יוצג ב-{fit.pages} עמודים
                </span>
                <button type="button" onClick={requestShorten} disabled={shortenState === 'loading'} style={{ padding: '0.45rem 1rem', minHeight: 40, borderRadius: 10, fontWeight: 700, cursor: 'pointer', border: '1px solid #ffb84d', background: 'transparent', color: '#ffb84d' }}>
                  {shortenState === 'loading' ? 'מקצר…' : 'קצר טקסט'}
                </button>
              </>
            )}
            {shortenMsg && <span role="status" style={{ fontSize: 13, color: shortenState === 'error' ? '#ff9b9b' : 'var(--t300)' }}>{shortenMsg}</span>}
          </div>
          {proposal?.after && proposal.before && (
            <div data-shorten-proposal className="mt-3 rounded-lg p-3" style={{ border: '1px solid var(--t239)', background: 'var(--t221)' }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>הצעת קיצור — השוו ואשרו</div>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                <div>
                  <div style={{ ...labelStyle, marginBottom: 4 }}>לפני ({proposal.before.words} מילים, {proposal.before.pages} עמודים)</div>
                  <div style={{ whiteSpace: 'pre-line', fontSize: 14, lineHeight: 1.6 }}>{sceneDisplayText({ narrative: proposal.before.narrative, drHoloDialog: proposal.before.drHoloDialog })}</div>
                </div>
                <div>
                  <div style={{ ...labelStyle, marginBottom: 4 }}>אחרי ({proposal.after.words} מילים, {proposal.after.pages === 1 ? 'נכנס במסך אחד' : `${proposal.after.pages} עמודים`})</div>
                  <div style={{ whiteSpace: 'pre-line', fontSize: 14, lineHeight: 1.6 }}>{sceneDisplayText({ narrative: proposal.after.narrative, drHoloDialog: proposal.after.drHoloDialog })}</div>
                </div>
              </div>
              {proposal.checks && (proposal.checks.grammar.length > 0 || proposal.checks.facts.length > 0) && (
                <ul style={{ margin: '10px 0 0', paddingInlineStart: 18, fontSize: 13, color: '#ffb84d' }}>
                  {[...proposal.checks.facts, ...proposal.checks.grammar].map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button type="button" onClick={approveShorten} style={{ padding: '0.5rem 1.2rem', minHeight: 40, borderRadius: 10, fontWeight: 800, cursor: 'pointer', border: 'none', background: 'linear-gradient(135deg,#0062cc,#6633cc)', color: '#fff' }}>אשרו את הקיצור</button>
                <button type="button" onClick={cancelShorten} style={{ padding: '0.5rem 1.2rem', minHeight: 40, borderRadius: 10, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--t239)', background: 'transparent', color: 'var(--t301)' }}>ביטול</button>
              </div>
            </div>
          )}
        </div>

        {/* חידה */}
        {hasPuzzle && (
          <div
            className="mb-4 rounded-lg p-3"
            style={{ background: 'var(--t221)', border: '1px solid var(--t239)' }}
          >
            <label style={labelStyle}>🧩 טקסט החידה</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              style={fieldStyle}
              placeholder="שאלת החידה…"
            />
            {(puzzleType === 'multipleChoice' || puzzleType === 'trueFalse') && (wordCount(question) > questionWordBudget(choices.length) || (choices.length > 2 && choices.some((c) => wordCount(c.text) > OPTION_WORD_BUDGET))) && (
              <p data-question-long style={{ margin: '6px 0 0', fontSize: 13, color: '#ffb84d' }}>
                הנוסח ארוך: כדי שהשאלה והתשובות ייכנסו במסך בלי גלילה — שאלה עד {questionWordBudget(choices.length)} מילים וכל תשובה עד {OPTION_WORD_BUDGET} מילים.
              </p>
            )}

            {/* תיוג יעד למידה — מזין את דיווח השליטה באנליטיקה */}
            {objectives.length > 0 && (
              <div className="mt-3">
                <label style={labelStyle}>🎯 יעד הלמידה שהאתגר בוחן</label>
                <select
                  value={objectiveId}
                  onChange={(e) => setObjectiveId(e.target.value)}
                  style={{ ...fieldStyle, padding: '0.5rem 0.7rem', cursor: 'pointer' }}
                  dir="rtl"
                >
                  <option value="">— ללא תיוג —</option>
                  {objectives.map((o) => (
                    <option key={o.id} value={o.id}>{o.text}</option>
                  ))}
                </select>
              </div>
            )}

            {choices.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                <span style={{ ...labelStyle, marginBottom: 0 }}>תשובות</span>
                {choices.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <span
                      title={c.isCorrect ? 'תשובה נכונה' : 'תשובה שגויה'}
                      style={{ fontSize: '1.1rem', width: '1.5rem', textAlign: 'center' }}
                    >
                      {c.isCorrect ? '✅' : '⬜'}
                    </span>
                    <input
                      value={c.text}
                      onChange={(e) => updateChoice(c.id, e.target.value)}
                      style={{ ...fieldStyle, padding: '0.4rem 0.7rem' }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* wordSearch — המילים שמחפשים בתפזורת */}
            {puzzleType === 'wordSearch' && (
              <div className="mt-3 flex flex-col gap-2">
                <span style={{ ...labelStyle, marginBottom: 0 }}>מילים בתפזורת</span>
                {words.map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={w} onChange={(e) => updateList(setWords, i, e.target.value)} style={{ ...fieldStyle, padding: '0.4rem 0.7rem' }} />
                    <button type="button" onClick={() => removeFromList(setWords, i)} style={{ color: 'var(--t5)' }}>✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => setWords((a) => [...a, ''])} className="text-sm" style={{ color: 'var(--t300)', alignSelf: 'flex-start' }}>+ הוסף מילה</button>
              </div>
            )}

            {/* memory — מושג + הגדרה */}
            {puzzleType === 'memory' && (
              <div className="mt-3 flex flex-col gap-2">
                <span style={{ ...labelStyle, marginBottom: 0 }}>זוגות מושג ↔ הגדרה</span>
                {pairs.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={p.a} onChange={(e) => setPairs((arr) => arr.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} placeholder="מושג" style={{ ...fieldStyle, padding: '0.4rem 0.7rem', flex: 1 }} />
                    <input value={p.b} onChange={(e) => setPairs((arr) => arr.map((x, j) => (j === i ? { ...x, b: e.target.value } : x)))} placeholder="הגדרה" style={{ ...fieldStyle, padding: '0.4rem 0.7rem', flex: 1 }} />
                    <button type="button" onClick={() => setPairs((arr) => arr.filter((_, j) => j !== i))} style={{ color: 'var(--t5)' }}>✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => setPairs((a) => [...a, { a: '', b: '' }])} className="text-sm" style={{ color: 'var(--t300)', alignSelf: 'flex-start' }}>+ הוסף זוג</button>
              </div>
            )}

            {/* wordCompletion — משפט + תשובות + בנק מילים */}
            {puzzleType === 'wordCompletion' && (
              <div className="mt-3 flex flex-col gap-2">
                <label style={{ ...labelStyle, marginBottom: 0 }}>משפט (עם ___ לחללים)</label>
                <textarea value={sentence} onChange={(e) => setSentence(e.target.value)} rows={2} style={fieldStyle} />
                <span style={{ ...labelStyle, marginBottom: 0, marginTop: '0.4rem' }}>תשובות (לפי סדר החללים)</span>
                {answers.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={a} onChange={(e) => updateList(setAnswers, i, e.target.value)} style={{ ...fieldStyle, padding: '0.4rem 0.7rem' }} />
                    <button type="button" onClick={() => removeFromList(setAnswers, i)} style={{ color: 'var(--t5)' }}>✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => setAnswers((a) => [...a, ''])} className="text-sm" style={{ color: 'var(--t300)', alignSelf: 'flex-start' }}>+ הוסף תשובה</button>
                {wordBank.length > 0 && (
                  <>
                    <span style={{ ...labelStyle, marginBottom: 0, marginTop: '0.4rem' }}>בנק מילים</span>
                    {wordBank.map((w, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={w} onChange={(e) => updateList(setWordBank, i, e.target.value)} style={{ ...fieldStyle, padding: '0.4rem 0.7rem' }} />
                        <button type="button" onClick={() => removeFromList(setWordBank, i)} style={{ color: 'var(--t5)' }}>✕</button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* sequenceOrder — טקסט כל פריט (הסדר הנכון נשמר) */}
            {puzzleType === 'sequenceOrder' && (
              <div className="mt-3 flex flex-col gap-2">
                <span style={{ ...labelStyle, marginBottom: 0 }}>פריטי הרצף (לפי הסדר הנכון)</span>
                {items.map((it, i) => (
                  <input key={it.id} value={it.text} onChange={(e) => setItems((arr) => arr.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} style={{ ...fieldStyle, padding: '0.4rem 0.7rem' }} />
                ))}
              </div>
            )}

            {/* hangman — המושג לניחוש */}
            {puzzleType === 'hangman' && (
              <div className="mt-3">
                <label style={labelStyle}>המילה/המושג לניחוש</label>
                <input value={hangmanAnswer} onChange={(e) => setHangmanAnswer(e.target.value)} style={{ ...fieldStyle, padding: '0.4rem 0.7rem' }} dir="rtl" />
              </div>
            )}

            {/* moralDilemma — הדילמה + הבחירות והשלכותיהן */}
            {puzzleType === 'moralDilemma' && (
              <div className="mt-3 flex flex-col gap-2">
                <label style={{ ...labelStyle, marginBottom: 0 }}>תיאור הדילמה</label>
                <textarea value={situation} onChange={(e) => setSituation(e.target.value)} rows={2} style={fieldStyle} />
                <span style={{ ...labelStyle, marginBottom: 0, marginTop: '0.4rem' }}>בחירות והשלכות</span>
                {moralChoices.map((mc, i) => (
                  <div key={i} className="flex flex-col gap-1 p-2 rounded" style={{ background: 'var(--t240)' }}>
                    <input value={mc.text} onChange={(e) => setMoralChoices((arr) => arr.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} placeholder="הבחירה" style={{ ...fieldStyle, padding: '0.4rem 0.7rem' }} />
                    <textarea value={mc.consequence} onChange={(e) => setMoralChoices((arr) => arr.map((x, j) => (j === i ? { ...x, consequence: e.target.value } : x)))} placeholder="ההשלכה" rows={2} style={fieldStyle} />
                  </div>
                ))}
              </div>
            )}

            {/* finalQuiz — רצף שאלות הסיכום */}
            {puzzleType === 'finalQuiz' && (
              <div className="mt-3 flex flex-col gap-3">
                <span style={{ ...labelStyle, marginBottom: 0 }}>שאלות מבחן הסיכום</span>
                {quizQuestions.map((q, qi) => (
                  <div key={qi} className="flex flex-col gap-1 p-2 rounded" style={{ background: 'var(--t240)' }}>
                    <input
                      value={q.question}
                      onChange={(e) => setQuizQuestions((arr) => arr.map((x, j) => (j === qi ? { ...x, question: e.target.value } : x)))}
                      placeholder="השאלה"
                      style={{ ...fieldStyle, padding: '0.4rem 0.7rem', fontWeight: 700 }}
                    />
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <span
                          title={oi === q.correctIndex ? 'תשובה נכונה' : 'לחץ לסמן כנכונה'}
                          onClick={() => setQuizQuestions((arr) => arr.map((x, j) => (j === qi ? { ...x, correctIndex: oi } : x)))}
                          style={{ fontSize: '1.1rem', width: '1.5rem', textAlign: 'center', cursor: 'pointer' }}
                        >
                          {oi === q.correctIndex ? '✅' : '⬜'}
                        </span>
                        <input
                          value={opt}
                          onChange={(e) => setQuizQuestions((arr) => arr.map((x, j) => (j === qi ? { ...x, options: x.options.map((o, k) => (k === oi ? e.target.value : o)) } : x)))}
                          style={{ ...fieldStyle, padding: '0.4rem 0.7rem' }}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3">
              <label style={labelStyle}>הסבר לתשובה נכונה</label>
              <textarea
                value={explCorrect}
                onChange={(e) => setExplCorrect(e.target.value)}
                rows={2}
                style={fieldStyle}
                placeholder="explanationCorrect…"
              />
            </div>
            <div className="mt-3">
              <label style={labelStyle}>הסבר לתשובה שגויה</label>
              <textarea
                value={explIncorrect}
                onChange={(e) => setExplIncorrect(e.target.value)}
                rows={2}
                style={fieldStyle}
                placeholder="explanationIncorrect…"
              />
            </div>
          </div>
        )}

        {/* פרומפט תמונה + thumbnail */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <label style={{ ...labelStyle, marginBottom: 0 }}>פרומפט לתמונה (imagePrompt)</label>
            <button
              title="שומר את הפרומפט ויוצר ממנו תמונה"
              disabled={regenerating || saving}
              onClick={generateFromPrompt}
              className="holo-button"
              style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
            >
              {regenerating ? 'יוצר…' : 'צור תמונה 🎨'}
            </button>
          </div>
          <div className="flex gap-3 items-start">
            {scene.imageUrl && (
              <div className="relative shrink-0">
                <img
                  src={scene.imageUrl}
                  alt={scene.title}
                  className="rounded-lg"
                  style={{
                    width: '7rem',
                    height: '4.2rem',
                    objectFit: 'cover',
                    border: '1px solid var(--t219)',
                    opacity: regenerating ? 0.4 : 1,
                  }}
                />
                <button
                  title="צור תמונה מחדש"
                  disabled={regenerating}
                  onClick={() => onRegenerateImage(scene.id)}
                  className="holo-button mt-1 w-full"
                  style={{ padding: '0.25rem', fontSize: '0.75rem' }}
                >
                  {regenerating ? 'יוצר…' : 'צור מחדש 🔄'}
                </button>
              </div>
            )}
            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              rows={4}
              style={fieldStyle}
              placeholder="English image prompt…"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm mb-3" style={{ color: 'var(--t5)' }}>
            ⚠️ {error}
          </p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            className="holo-button"
            style={{ background: 'transparent', border: '1px solid var(--t220)' }}
            onClick={onClose}
            disabled={saving}
          >
            ביטול
          </button>
          <button
            className="holo-button font-bold"
            style={{ opacity: saving ? 0.5 : 1 }}
            onClick={save}
            disabled={saving}
          >
            {saving ? 'שומר…' : 'שמור'}
          </button>
        </div>
      </div>
    </div>
  )
}
