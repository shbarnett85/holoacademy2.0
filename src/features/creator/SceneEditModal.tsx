import { useState } from 'react'
import { apiFetch } from '../../shared/lib/api'
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
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(5,10,25,0.6)',
  border: '1px solid rgba(0,246,255,0.25)',
  borderRadius: '0.6rem',
  color: 'var(--holo-text)',
  padding: '0.6rem 0.8rem',
  fontSize: '0.95rem',
  resize: 'vertical',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.4rem',
  fontSize: '0.85rem',
  fontWeight: 700,
  color: 'var(--holo-cyan)',
}

/* מודאל עריכת סצנה — נרטיב, חידה, ופרומפט תמונה */
export default function SceneEditModal({
  questId,
  scene,
  onClose,
  onSaved,
  onRegenerateImage,
  regenerating,
}: Props) {
  const [narrative, setNarrative] = useState(scene.narrative ?? '')
  const [imagePrompt, setImagePrompt] = useState(scene.imagePrompt ?? '')

  const hasPuzzle = !!scene.puzzle
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
    const payload: Record<string, unknown> = { sceneId: scene.id, narrative, imagePrompt }
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
      style={{ background: 'rgba(5,5,18,0.7)', backdropFilter: 'blur(4px)', zIndex: 60 }}
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
          borderColor: 'var(--holo-cyan)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="holo-text-glow text-xl font-black">✏️ עריכת סצנה — {scene.title}</h2>
          <button
            onClick={onClose}
            className="cursor-pointer text-xl"
            style={{ color: 'var(--holo-text)', opacity: 0.6 }}
            title="סגור"
          >
            ✕
          </button>
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
        </div>

        {/* חידה */}
        {hasPuzzle && (
          <div
            className="mb-4 rounded-lg p-3"
            style={{ background: 'rgba(0,136,255,0.08)', border: '1px solid rgba(0,136,255,0.25)' }}
          >
            <label style={labelStyle}>🧩 טקסט החידה</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              style={fieldStyle}
              placeholder="שאלת החידה…"
            />

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
                    <button type="button" onClick={() => removeFromList(setWords, i)} style={{ color: '#ff7099' }}>✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => setWords((a) => [...a, ''])} className="text-sm" style={{ color: 'var(--holo-cyan)', alignSelf: 'flex-start' }}>+ הוסף מילה</button>
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
                    <button type="button" onClick={() => setPairs((arr) => arr.filter((_, j) => j !== i))} style={{ color: '#ff7099' }}>✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => setPairs((a) => [...a, { a: '', b: '' }])} className="text-sm" style={{ color: 'var(--holo-cyan)', alignSelf: 'flex-start' }}>+ הוסף זוג</button>
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
                    <button type="button" onClick={() => removeFromList(setAnswers, i)} style={{ color: '#ff7099' }}>✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => setAnswers((a) => [...a, ''])} className="text-sm" style={{ color: 'var(--holo-cyan)', alignSelf: 'flex-start' }}>+ הוסף תשובה</button>
                {wordBank.length > 0 && (
                  <>
                    <span style={{ ...labelStyle, marginBottom: 0, marginTop: '0.4rem' }}>בנק מילים</span>
                    {wordBank.map((w, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input value={w} onChange={(e) => updateList(setWordBank, i, e.target.value)} style={{ ...fieldStyle, padding: '0.4rem 0.7rem' }} />
                        <button type="button" onClick={() => removeFromList(setWordBank, i)} style={{ color: '#ff7099' }}>✕</button>
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
                  <div key={i} className="flex flex-col gap-1 p-2 rounded" style={{ background: 'rgba(0,0,0,0.15)' }}>
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
                  <div key={qi} className="flex flex-col gap-1 p-2 rounded" style={{ background: 'rgba(0,0,0,0.15)' }}>
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
                    border: '1px solid rgba(0,246,255,0.3)',
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
          <p className="text-sm mb-3" style={{ color: '#ff7099' }}>
            ⚠️ {error}
          </p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            className="holo-button"
            style={{ background: 'transparent', border: '1px solid rgba(0,246,255,0.35)' }}
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
