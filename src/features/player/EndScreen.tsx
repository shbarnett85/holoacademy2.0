/* מסך הסיום, "סוף הפרק": שני מצבים בלבד — הסיפור נסגר (3 גבישים שלמים ומעלה), או הסיפור נשאר פתוח. 5 גבישים: אותו סוף, עם זוהר מיוחד.
   כפתור אחד: "חזרה לספרייה" (המסך הראשי של מי שמשחק). "שחקו שוב" הוא קישור בדיו מתחתיו, ולחיצה על הפורטל בסיפור פתוח.
   משפטי צמיחה בלבד: בלי רמת קושי, בלי אחוזים ובלי השוואה לאחרים.
   גבישי הכיתה נטענים אחרי שהמשחק נשמר. במשחק בלי session (מקרן, מבקר) אין גבישי כיתה ואין מסע. */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { GEM_TOTAL, gemFill, gemsValue, storyState, wholeGems, type JourneyLesson } from '../../shared/lib/gemModel'
import { GemDefs, GemSocket } from '../../shared/ui/Gem'
import { gemTier } from '../../shared/lib/gemTier'
import { labMoodsOf } from '../../shared/lib/holoMoods'
import { usesStoryFont } from '../../shared/lib/storyFont'
import LabStage from './lab/LabStage'
import { CLASSROOM_SRC, labPortalImages } from './lab/labComposition'
import { confetti, cfg, prefersReducedMotion, sounds } from './gameFeel/engine'
import { growthCounts } from './gameFeel/points'
import { END_TEXT } from './gameFeel/text'
import { SubjectJourney } from './Journey'
import { progressFill, progressTrack } from '../../styles/ui'
import type { ChallengeResult, EndingScene, GameData } from './useGameEngine'

interface ClassGems { available: boolean; classGems?: number; mine?: number; target?: number }

function authHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('holo_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function EndScreen({ gameData, questId, questTitle, results, gemPoints, gemPossible, hasSession, saved, onPlayAgain, onExit, onHome, footer }: {
  gameData: GameData
  questId?: string
  questTitle: string
  results: ChallengeResult[]
  gemPoints: number
  gemPossible: number
  /* התלמיד/ה מחובר/ת ויש session: גבישי הכיתה והמסע רלוונטיים */
  hasSession: boolean
  /* מסתיימת כשהמשחק נשמר בשרת */
  saved?: Promise<void> | null
  onPlayAgain: () => void
  /* לא בשימוש עוד: הכפתור היחיד הוא onHome. נשאר כדי לא לשבור קריאות קיימות */
  onExit?: () => void
  /* "חזרה לספרייה", וגם לחיצה על הפורטל בסיפור שנסגר: המסך הראשי של מי שמשחק (תלמיד, מורה, או האתר למבקר) */
  onHome?: () => void
  /* פוטר למבקרים (שיתוף, הזמנה למורים) */
  footer?: ReactNode
}) {
  const whole = wholeGems(gemPoints, gemPossible)
  const value = gemsValue(gemPoints, gemPossible)
  const state = storyState(whole, gemPossible)
  const closed = state !== 'open'
  const ending: EndingScene | undefined = closed ? gameData.endingGood : gameData.endingBad
  const reduced = prefersReducedMotion()
  const popIn = !reduced && cfg().holo
  const portalSrc = closed ? CLASSROOM_SRC : labPortalImages(gameData.scenes, gameData.entrySceneId).opening
  const radiant = state === 'radiant'
  const moods = labMoodsOf(gameData.holoMoods)

  const moralIds = useMemo(() => new Set(gameData.scenes.filter((s) => s.puzzle?.type === 'moralDilemma').map((s) => s.id)), [gameData])
  const { firstTry, retried } = growthCounts(results, moralIds)

  const [classGems, setClassGems] = useState<ClassGems | null>(null)
  const [lessons, setLessons] = useState<(JourneyLesson & { subjectCode: string | null })[] | null>(null)

  /* צליל סוף פעם אחת. הקונפטי: פרץ בכניסה, ואז גל קטן כל עוד המסך פתוח (לא בלשונית מוסתרת) */
  useEffect(() => {
    sounds.end(state === 'open' ? 'open' : state === 'radiant' ? 'radiant' : 'closed')
    if (state === 'open') return
    const n = cfg().confetti
    if (!n) return
    confetti(state === 'radiant' ? n * 2 : n)
    const wave = Math.ceil((state === 'radiant' ? n : n * 0.6) / 3)
    const t = window.setInterval(() => { if (!document.hidden) confetti(wave) }, 1400)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hasSession || !questId) return
    let cancelled = false
    const load = async () => {
      try { await saved } catch { /* נטען בכל מקרה */ }
      try {
        const [cg, as] = await Promise.all([
          fetch(`/api/sessions/class-gems/${encodeURIComponent(questId)}`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)),
          fetch('/api/sessions/assigned', { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)),
        ])
        if (cancelled) return
        if (cg) setClassGems(cg as ClassGems)
        if (as) setLessons((as as { quests?: (JourneyLesson & { subjectCode: string | null })[] }).quests ?? [])
      } catch { /* הפאנלים פשוט לא מוצגים */ }
    }
    void load()
    return () => { cancelled = true }
  }, [hasSession, questId, saved])

  const currentLesson = lessons?.find((l) => l.id === questId)
  const showClass = classGems?.available === true && (classGems.target ?? 0) > 0
  const showJourney = !!currentLesson

  const kicker = state === 'radiant' ? END_TEXT.kickerRadiant : state === 'closed' ? END_TEXT.kickerClosed : END_TEXT.kickerOpen
  const goHome = onHome ?? onExit
  const narrative = ending?.narrative ?? (closed ? END_TEXT.narrativeClosed : END_TEXT.narrativeOpen)

  return (
    <div data-end-screen={state} className="relative" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 'clamp(12px, 2.5vh, 24px)', overflow: 'auto' }}>
      <GemDefs />
      <style>{`
        @keyframes holo-whiteout { from { opacity: 1; } to { opacity: 0; } }
        .holo-summary-whiteout { position: fixed; inset: 0; z-index: 81; pointer-events: none;
          background: var(--color-surface); animation: holo-whiteout 0.45s ease-out both; }
        @keyframes end-gem-in { from { opacity: 0; transform: translateY(12px) scale(.5); } }
        .end-gem-pop { animation: end-gem-in .5s cubic-bezier(.2,1.5,.4,1) both; }
        /* טלפון לרוחב: החלון צר ונמוך, ולכן הכול נכנס בלי גלילה */
        @media (max-height: 500px) {
          [data-end-screen] .holo-panel { gap: 4px !important; padding: 8px !important; }
          [data-end-screen] .holo-panel h1 { font-size: 16px !important; }
          [data-end-screen] .holo-panel h2[data-end-title] { font-size: 12.5px !important; margin: 0 !important; flex-basis: 100%; }
          /* הכותרת והמצב בשורה אחת, והכפתור והקישור זה לצד זה: חוסכים שתי שורות של גובה */
          [data-end-screen] [data-end-head] { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 8px; }
          [data-end-screen] [data-end-head] h1 { order: -1; }
          [data-end-screen] [data-end-actions] { flex-direction: row !important; align-items: center !important; gap: 12px !important; }
          [data-end-screen] [data-play-again] { font-size: 12px !important; }
          [data-end-screen] [data-class-gems], [data-end-screen] [data-end-journey] { padding: 5px 10px !important; }
          [data-end-screen] [data-class-gems] h2, [data-end-screen] [data-end-journey] h2 { margin-bottom: 3px !important; font-size: 12px !important; }
          [data-end-screen] .holo-panel p, [data-end-screen] [data-growth] { font-size: 11px !important; line-height: 1.25 !important; }
          [data-end-screen] [data-end-gems] { gap: 3px !important; }
          [data-end-screen] [data-end-gems] svg { width: 24px !important; height: 24px !important; }
          [data-end-screen] [data-end-count] { font-size: 12px !important; }
          [data-end-screen] .holo-button { padding: 0.2rem 0.6rem !important; font-size: 12px !important; min-height: 32px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .holo-summary-whiteout { animation: none; opacity: 0; }
          .end-gem-pop { animation: none; }
        }
      `}</style>
      <div className="holo-summary-whiteout" aria-hidden />
      <div style={{ position: 'fixed', inset: 0 }}>
        <LabStage state={closed ? 'closed' : 'open'} portalSrc={portalSrc} mood={closed ? moods.closed : moods.open} human={radiant} onPortalClick={closed ? onHome : onPlayAgain} portalLabel={closed ? END_TEXT.back : END_TEXT.playAgain} />
      </div>

      <div className="holo-panel" style={{ position: 'relative', width: 'calc(50vw - max(20.1vw, 35.7vh) - clamp(12px, 2.5vh, 24px) - 4px)', justifySelf: 'start', maxHeight: 'calc(100dvh - 2 * clamp(12px, 2.5vh, 24px))', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', padding: 'clamp(12px, 2.2vh, 22px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', justifyContent: 'center' }}>
          <div data-end-head style={{ minWidth: 0, textAlign: 'start' }}>
            <div data-end-kicker style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', color: state === 'open' ? 'var(--color-human-deep)' : 'var(--color-machine-deep)' }}>{kicker}</div>
            <h1 className="holo-text-glow" data-end-heading style={{ margin: 0, fontSize: 'clamp(20px, 3vw, 30px)', fontWeight: 900, lineHeight: 1.2 }}>{END_TEXT.chapterEnd}</h1>
            {/* הכותרת שהשיעור נתן לסיום שלו */}
            {ending?.title && <h2 data-end-title style={{ margin: '2px 0 0', fontSize: 'clamp(15px, 1.7vw, 19px)', fontWeight: 800, lineHeight: 1.25, color: 'var(--color-ink)', textWrap: 'balance' }}>{ending.title}</h2>}
          </div>
        </div>
        {/* טקסט העלילה של הסיום: בגופן הסיפור, כמו בעמודים */}
        <p className={usesStoryFont(gameData.readingScale) ? 'holo-story-font' : undefined} data-end-narrative style={{ margin: 0, lineHeight: 1.5, textAlign: 'start', width: '100%', fontSize: 15 }}>
          {narrative}
          {ending?.drHoloDialog ? ` ד״ר הולו אומר: "${ending.drHoloDialog}"` : ''}
        </p>

        {gemPossible > 0 && (
          <>
            <div data-end-gems className={state === 'radiant' ? 'end-gems-radiant' : ''} dir="ltr" style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {Array.from({ length: GEM_TOTAL }).map((_, i) => (
                <span key={i} className={popIn ? 'end-gem-pop' : ''} style={{ animationDelay: `${i * 0.12}s`, display: 'block' }}>
                  <GemSocket fill={gemFill(value, i)} size="clamp(34px, 8vh, 58px)" tier={gemTier(whole)} />
                </span>
              ))}
            </div>
            <div data-end-count style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17 }}>{END_TEXT.gemsCount(whole, value - whole > 1e-6)}</div>
            <ul data-growth style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 14 }}>
              {firstTry > 0 && <li>{END_TEXT.firstTry(firstTry)}</li>}
              {retried > 0 && <li>{END_TEXT.retried(retried)}</li>}
              <li style={{ color: closed ? undefined : 'var(--color-human-deep)' }}>{closed ? END_TEXT.enough : END_TEXT.needMore}</li>
            </ul>
          </>
        )}

        {(showClass || showJourney) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))', gap: 10, width: '100%', textAlign: 'start' }}>
            {showClass && (
              <div data-class-gems style={{ background: 'var(--color-surface)', border: '1px solid var(--color-line-strong)', borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
                <h2 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: 'var(--color-machine-deep)' }}>{END_TEXT.classTitle}</h2>
                <div style={{ ...progressTrack, height: 14, boxSizing: 'border-box' }}>
                  <i style={{ ...progressFill, display: 'block', width: `${Math.min(100, ((classGems?.classGems ?? 0) / Math.max(1, classGems?.target ?? 1)) * 100)}%` }} />
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.45 }}>{END_TEXT.classLine(classGems?.classGems ?? 0, classGems?.mine ?? 0, classGems?.target ?? 0)}</p>
              </div>
            )}
            {showJourney && currentLesson && lessons && (
              <div data-end-journey style={{ background: 'var(--color-surface)', border: '1px solid var(--color-line-strong)', borderRadius: 12, padding: '10px 12px', minWidth: 0 }}>
                <h2 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: 'var(--color-machine-deep)' }}>{END_TEXT.journeyTitle}</h2>
                <SubjectJourney lessons={lessons} currentId={questId ?? ''} subjectCode={currentLesson.subjectCode} />
              </div>
            )}
          </div>
        )}

        {/* כפתור אחד: חזרה לספרייה. "שחקו שוב" הוא קישור בדיו (ניווט), לא כפתור */}
        <div data-end-actions style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {goHome && <button type="button" data-end-exit className="holo-button" style={{ padding: '0.6rem 1.8rem' }} onClick={goHome}>{END_TEXT.back}</button>}
          <button type="button" data-play-again className="holo-link" style={{ fontSize: 15 }} onClick={onPlayAgain}>{END_TEXT.playAgain}</button>
        </div>
        {footer}
        <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{questTitle}</span>
      </div>
    </div>
  )
}
