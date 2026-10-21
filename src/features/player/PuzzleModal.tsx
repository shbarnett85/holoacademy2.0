import { useEffect, useMemo, useRef, useState } from 'react'
import type { Placement } from '../player/stageRouting'
import { puzzleTypeLabel } from '../../shared/lib/labels'
import type { Puzzle } from './useGameEngine'
import TileSwapChallenge from './challenges/TileSwapChallenge'
import WordSearchChallenge from './challenges/WordSearchChallenge'
import MemoryChallenge from './challenges/MemoryChallenge'
import WordCompletionChallenge from './challenges/WordCompletionChallenge'
import SequenceOrderChallenge from './challenges/SequenceOrderChallenge'
import HangmanChallenge from './challenges/HangmanChallenge'
import FinalQuizChallenge from './challenges/FinalQuizChallenge'
import MoralDilemmaChallenge from './challenges/MoralDilemmaChallenge'
import { triggerErrorFlash } from './challenges/errorFlash'
import { shatterToCrystals } from './challenges/successShatter'
import DigitalEntrance from '../../shared/components/DigitalEntrance'
import { playSound } from '../../shared/lib/sound'
import {
  createPuzzleTelemetry, buildPresentation, presentChoices, isTrueFalse, PUZZLE_READY_DELAY_MS,
  type PuzzleTelemetry, type PresentationRecord,
} from '../../shared/lib/answerTelemetry'

interface Props {
  puzzle: Puzzle
  /* תמונת הסצנה — לפאזל ההזזה */
  imageUrl?: string
  onSolve: (correct: boolean, score?: number) => void
  onClose: () => void
  /* "המשך ←" אחרי ההסבר — הדרך היחידה להתקדם */
  onContinue: () => void
  /* אם האתגר מסתיים באיסוף מפתח — מחליפים את "המשך" בכפתור איסוף ישיר (פישוט התהליך) */
  onCollect?: () => void
  collectLabel?: string
  /* 'panel' = תשובת טקסט/בחירה, בתוך הפאנל הצדדי (המשך דברי הדוקטור).
     'stage'  = אתגר מניפולציה, במרכז הבמה. ראו stageRouting.ts */
  placement?: Placement
  /* ── טלמטריית תשובות (שלב 1B) — hook נפרד לצד onSolve; לא משפיע על מהלך המשחק ── */
  sceneId?: string
  /* הצגה מס' N של האתגר בסצנה (פתיחה/סגירה חוזרת = הצגה חדשה) */
  presentationSeq?: number
  /* נקרא פעם אחת בסיום ההצגה (תשובה / סגירה) עם השורות שיש לשמור */
  onTelemetry?: (rec: PresentationRecord) => void
}

interface Result { correct: boolean; score: number }

/* רוחב המודאל לפי סוג האתגר — חלקם דורשים שטח רחב יותר */
function maxWidthFor(type?: string): string {
  switch (type) {
    case 'tileSwap':
    case 'slidingPuzzle':
    case 'wordSearch':
    case 'memory':
    case 'sequenceOrder':
    case 'hangman':
    case 'finalQuiz':
    case 'moralDilemma':
      return '34rem'
    default:
      return '28rem'
  }
}

/* מודאל אתגר הולוגרפי — אתגר אינטראקטיבי → פאנל תוצאה/הסבר → המשך */
export default function PuzzleModal({ puzzle, imageUrl, onSolve, onClose, onContinue, onCollect, collectLabel, placement = 'panel', sceneId = '', presentationSeq = 1, onTelemetry }: Props) {
  const [result, setResult] = useState<Result | null>(null)
  /* טלמטריה להצגה הזו — נוצרת פעם אחת לכל mount (= הצגה) */
  const telRef = useRef<PuzzleTelemetry | null>(null)
  if (telRef.current === null) telRef.current = createPuzzleTelemetry()
  const tel = telRef.current
  const finalizedRef = useRef(false)
  useEffect(() => {
    const t = window.setTimeout(() => tel.markReady(), PUZZLE_READY_DELAY_MS)
    return () => window.clearTimeout(t)
  }, [tel])

  /* ערבוב בזמן ההצגה — בחירה מרובה בלבד (נכון/לא-נכון נשאר בסדר קבוע). נבנה פעם אחת להצגה;
     האובייקטים נשארים אותם אובייקטים (id/isCorrect), ולכן בדיקת הנכונות נשארת זהה. */
  const presented = useMemo(() => {
    const t = puzzle.type
    const isChoiceType = !t || t === 'multipleChoice' || t === 'trueFalse'
    if (!isChoiceType || !puzzle.choices || puzzle.choices.length === 0) return null
    return presentChoices(puzzle.choices, { fixed: isTrueFalse(t, puzzle.choices) })
  }, [puzzle])
  /* רישום הסדר שהוצג — ב-effect ולא בתוך ה-memo: React (StrictMode) מריץ memo פעמיים בערבוב אקראי,
     ותופעת-לוואי בתוכו תרשום סדר שונה מזה שנבחר להצגה. */
  useEffect(() => {
    if (presented) tel.setDisplay(presented.displayedOrder, presented.correctPosition)
  }, [presented, tel])

  /* סגירת ההצגה → שורות answers. עטוף ב-try: כשל טלמטריה לעולם לא משפיע על האתגר. */
  function finalize(res: { correct: boolean; score?: number } | null) {
    if (finalizedRef.current) return
    finalizedRef.current = true
    try {
      if (!onTelemetry) return
      const rec = buildPresentation(tel, {
        sceneId, puzzleType: puzzle.type ?? 'multipleChoice', seq: presentationSeq, result: res,
        puzzle: { choices: puzzle.choices, items: puzzle.items, correctOrder: puzzle.correctOrder, questions: puzzle.questions, moralChoices: puzzle.moralChoices },
      })
      onTelemetry(rec)
    } catch { /* ignore */ }
  }
  function handleClose() {
    tel.act('closed')
    finalize(null)
    onClose()
  }
  /* הגנה מלחיצה כפולה — ה-state אסינכרוני, ה-ref מיידי */
  const lockedRef = useRef(false)
  /* התפוגגות לרסיסים בהצלחה — הפאנל כולו מתנפץ לתכלת שעפה אל מד הקריסטלים */
  const panelRef = useRef<HTMLDivElement>(null)
  const shatteringRef = useRef(false)

  /* force — לשאלת מוסר, שאינה עוברת דרך result אך תמיד מזכה ברסיסים */
  function continueAfterSuccess(action: () => void, force = false) {
    if (shatteringRef.current) return
    if ((!force && !result?.correct) || !panelRef.current) { action(); return }
    shatteringRef.current = true
    shatterToCrystals(panelRef.current, action)
  }

  function handleResult(r: { correct: boolean; score?: number }) {
    if (lockedRef.current) return
    lockedRef.current = true
    const score = r.score ?? (r.correct ? 1 : 0)
    /* צליל הפתרון עדין — צליל הניצחון (win) שמור לרגע שקריסטל מתמלא לגמרי (CrystalBar) */
    if (r.correct) playSound('good')
    setResult({ correct: r.correct, score })
    onSolve(r.correct, score)
    finalize({ correct: r.correct, score })
  }

  const type = puzzle.type
  const correctChoiceText = puzzle.choices?.find((c) => c.isCorrect)?.text

  /* ── פאנל התוצאה: הסבר מעמיק / סיכום מבחן / הצלחה-כישלון ── */
  function renderResult(res: Result) {
    let header: string
    let body: string
    const good = res.correct

    if (type === 'finalQuiz') {
      const n = puzzle.questions?.length ?? 0
      const correctCount = Math.round(res.score * n)
      header = `ענית נכון על ${correctCount} מתוך ${n}`
      body =
        res.score === 1
          ? 'מבחן מושלם! שליטה מלאה בחומר! 🌟'
          : res.score >= 0.5
            ? 'כל הכבוד — תפסת את עיקרי החומר!'
            : 'שווה לחזור על החומר ולנסות שוב במסע הבא.'
    } else if (type === 'multipleChoice' || type === 'trueFalse' || type === 'wordCompletion' || !type) {
      header = good ? '✓ תשובה נכונה! 💎' : '✗ לא בדיוק…'
      /* בכישלון מציגים את התשובה הנכונה: השלמת מילים → ה-answer; רב-ברירה → הבחירה הנכונה */
      const wcAnswer = puzzle.answers && puzzle.answers.length > 0 ? puzzle.answers.join(', ') : puzzle.answer
      const correctText = type === 'wordCompletion' ? wcAnswer : correctChoiceText
      body = good
        ? (puzzle.explanationCorrect ?? 'נכון מאוד!')
        : (puzzle.explanationIncorrect ??
          (correctText ? `התשובה הנכונה היא: ${correctText}` : 'נסו לזכור להבא!'))
    } else {
      /* אתגרים אינטראקטיביים (פאזל/חיפוש/זיכרון) */
      header = good ? '✓ כל הכבוד! פתרת את האתגר 💎' : '✗ האתגר לא הושלם'
      body = good ? 'מעולה! ממשיכים הלאה 🌟' : 'לא נורא — אפשר לנסות שוב במסע הבא.'
    }

    return (
      <div
        className="rounded-xl p-4 mt-4 text-start"
        style={good
          ? { background: 'rgba(0,255,150,0.08)', border: '1px solid rgba(0,255,150,0.45)' }
          : { background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.45)' }}
      >
        <div className="font-bold mb-2" style={{ color: good ? '#5fffb0' : '#ffce5e' }}>{header}</div>
        <p className="leading-relaxed" style={{ color: 'var(--holo-text)' }}>{body}</p>
        <div className="text-center mt-4">
          {onCollect ? (
            /* האתגר הסתיים עם מפתח לאיסוף — כפתור איסוף ישיר במקום "המשך" (פחות לחיצות) */
            <button
              className="holo-button text-lg"
              style={{ padding: '0.7rem 2rem', background: 'linear-gradient(135deg, #6633cc, #0062cc)' }}
              onClick={() => continueAfterSuccess(onCollect)}
            >
              {collectLabel ?? 'אספו את המפתח 🔑'}
            </button>
          ) : (
            <button className="holo-button text-lg" style={{ padding: '0.7rem 2.5rem' }} onClick={() => continueAfterSuccess(onContinue)}>
              המשך ←
            </button>
          )}
        </div>
      </div>
    )
  }

  /* ── ניתוב לאתגר המתאים ── */
  function renderChallenge() {
    switch (type) {
      case 'tileSwap':
      case 'slidingPuzzle':
        return <TileSwapChallenge puzzle={puzzle} imageUrl={imageUrl} onResult={handleResult} tel={tel} />
      case 'wordSearch':
        return <WordSearchChallenge puzzle={puzzle} onResult={handleResult} tel={tel} />
      case 'memory':
        return <MemoryChallenge puzzle={puzzle} onResult={handleResult} tel={tel} />
      case 'wordCompletion':
        return <WordCompletionChallenge puzzle={puzzle} onResult={handleResult} tel={tel} />
      case 'sequenceOrder':
        return <SequenceOrderChallenge puzzle={puzzle} onResult={handleResult} tel={tel} />
      case 'hangman':
        return <HangmanChallenge puzzle={puzzle} onResult={handleResult} tel={tel} />
      case 'finalQuiz':
        return <FinalQuizChallenge puzzle={puzzle} onResult={handleResult} tel={tel} />
      default:
        /* multipleChoice / trueFalse / ברירת מחדל — שאלה + תשובות */
        if (puzzle.choices && puzzle.choices.length > 0) {
          return (
            <>
              <h3 className="text-xl font-bold mt-4">{puzzle.question}</h3>
              <div className="flex flex-col gap-3 mt-5 holo-answers">
                {(presented?.choices ?? puzzle.choices).map((c, pos) => (
                  <button key={c.id} className="holo-button" style={{ padding: '0.8rem' }} onClick={() => { tel.act('select', { optionId: c.id, position: pos }); if (!c.isCorrect) triggerErrorFlash(); handleResult({ correct: c.isCorrect }) }}>
                    {c.text}
                  </button>
                ))}
              </div>
            </>
          )
        }
        /* חידה ללא נתונים תקינים — דילוג בטוח */
        return (
          <>
            <h3 className="text-xl font-bold mt-4">{puzzle.question}</h3>
            <p className="mt-3" style={{ opacity: 0.6 }}>לא ניתן להציג אתגר זה.</p>
            <button className="holo-button mt-4" onClick={() => handleResult({ correct: true })}>המשך ←</button>
          </>
        )
    }
  }

  return (
    /* פאנל inline — מוצג *במקום* הנרטיב בתוך זרימת הסצנה (לא מודאל צף, אין שכבת כיסוי).
       הקריאוּת מובטחת ע"י רקע ה-holo-panel עצמו. נכנס דרך DigitalEntrance (glitch+scale+blur)
       כמכל-תיבה אחד — מכסה את כל סוגי האתגרים, בלי לעטוף קלפים/טיילים פנימיים. */
    <DigitalEntrance className="w-full mx-auto">
    <div
      ref={panelRef}
      className="holo-panel w-full text-center mx-auto"
      style={{ maxWidth: placement === 'stage' ? 'none' : maxWidthFor(type), boxShadow: 'var(--holo-glow)', maxHeight: `calc(100dvh - var(--puzzle-vgutter, ${placement === 'stage' ? '6.4rem' : '12rem'}))`, overflowY: 'auto' }}
    >
        <span className="text-xs rounded-full px-3 py-1" style={{ background: 'rgba(0,136,255,0.2)', border: '1px solid rgba(0,136,255,0.4)' }}>
          {type === 'finalQuiz' ? '📝' : '🧩'} {puzzleTypeLabel(type)}
        </span>

        {/* ── ההוראה נוסעת עם האתגר ────────────────────────────────────────
            כשהאתגר עולה לבמה, הפאנל עם דברי הדוקטור מתעמעם בצד. אם ההוראה
            נשארת שם בלבד, התלמיד מתחיל לגרור ושוכח מה ביקשו — הוא נאלץ
            להחזיק את השאלה בזיכרון העבודה תוך כדי מניפולציה (קשב מפוצל).
            לכן ההוראה מוצגת כאן, צמודה למה שהידיים עושות. */}
        {/* ההוראה/השאלה מוצגת **יחד עם התשובות** במרכז, לכל סוגי האתגרים —
            לא מפוצלת בין עמוד הטקסט לאתגר. רב-ברירה ונכון/לא-נכון מציגים את
            השאלה בעצמם למטה, ולכן שם הכותרת הזו מושמטת כדי לא לכפול אותה. */}
        {placement === 'stage' && puzzle.question && type !== 'multipleChoice' && type !== 'trueFalse' && (
          <h3 className="holo-stage-instruction">{puzzle.question}</h3>
        )}

        {type === 'moralDilemma' ? (
          /* שאלת מוסר — מנהלת בעצמה בחירה→השלכה→המשך; כל בחירה מזכה בקריסטלים, אין כישלון */
          <MoralDilemmaChallenge puzzle={puzzle} tel={tel} onResolve={() => { onSolve(true, 1); finalize({ correct: true, score: 1 }) }} onContinue={() => continueAfterSuccess(onCollect ?? onContinue, true)} />
        ) : result === null ? (
          <>
            {renderChallenge()}
            {/* יציאה זמינה רק לפני מתן תשובה, ובאתגרים שאינם רצף שאלות */}
            {type !== 'finalQuiz' && (
              <button
                className="text-sm mt-4 cursor-pointer block mx-auto"
                style={{ background: 'none', border: 'none', color: 'var(--holo-text)', opacity: 0.5 }}
                onClick={handleClose}
              >
                סגירה
              </button>
            )}
          </>
        ) : (
          renderResult(result)
        )}
    </div>
    </DigitalEntrance>
  )
}
