/* הנקודות של אתגר שהסתיים, לפי מה שנרשם בטלמטריה. קריאה בלבד: לוגיקת האתגרים לא משתנה.
   "הטעויות המותרות" מחושבות באותה דרך שהאתגר עצמו מחשב אותן. */
import { challengePoints } from '../../../shared/lib/gemModel'
import { scaleMemory, scaleTileSwap, scaleWordCompletion } from '../../../shared/lib/difficultyScaling'
import type { InteractionEvent } from '../../../shared/lib/answerTelemetry'
import type { ChallengeResult } from '../useGameEngine'

interface PuzzleMeta { type?: string; difficulty?: number; maxWrong?: number; gridSize?: number }

export function allowedMistakes(p: PuzzleMeta): number {
  switch (p.type) {
    case 'memory': return scaleMemory(p.difficulty ?? 5).maxMistakes
    case 'wordCompletion': return scaleWordCompletion(p.difficulty ?? 5).maxAttempts
    case 'hangman': return Math.max(3, Math.min(10, p.maxWrong ?? 6))
    case 'tileSwap':
    case 'slidingPuzzle': {
      if (p.difficulty != null) return scaleTileSwap(p.difficulty).maxBadSwaps
      const n = Math.min(5, Math.max(2, p.gridSize ?? 3))
      return Math.max(3, n * n)
    }
    default: return 0
  }
}

export function countMistakes(type: string | undefined, events: readonly InteractionEvent[]): number {
  switch (type) {
    case 'memory': return events.filter((e) => e.k === 'pair' && e.match === false).length
    case 'wordCompletion': return events.filter((e) => e.k === 'attempt' && e.correct === false).length
    case 'hangman': return events.filter((e) => e.k === 'letter' && e.correct === false).length
    case 'sequenceOrder': return events.filter((e) => e.k === 'submit' && e.correct === false).length
    case 'tileSwap':
    case 'slidingPuzzle': return events.filter((e) => e.k === 'swap' && e.bad === true).length
    default: return 0
  }
}

/* אתגרים שאינם בחירה מרובה / מבחן סיכום / דילמה */
export function pointsFromTelemetry(p: PuzzleMeta, solved: boolean, events: readonly InteractionEvent[]): number {
  return challengePoints({ type: p.type, solved, mistakes: countMistakes(p.type, events), allowed: allowedMistakes(p) })
}

/* כמה אתגרים הצליחו בניסיון הראשון, וכמה פעמים ניסו שוב והצליחו. דילמה מוסרית לא נספרת: אין בה ניסיון */
export function growthCounts(results: readonly ChallengeResult[], moralSceneIds: ReadonlySet<string>): { firstTry: number; retried: number } {
  let firstTry = 0
  let retried = 0
  for (const r of results) {
    if (moralSceneIds.has(r.sceneId)) continue
    const p = r.gemPoints ?? r.score
    if (p >= 1) firstTry++
    else if (p > 0) retried++
  }
  return { firstTry, retried }
}
