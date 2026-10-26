/* ──────────────────────────────────────────────────────────────────────────
   levelComparison — השוואה הוגנת בין תלמידים, ופירוק לפי טווחי דרגות (סיכום שיעור). pure; משותף לשרת ולבדיקות.
   כל תלמיד/ה משחק/ת כל אתגר ברמה (דרגה 1-20) שנקבעה לו/ה — גרסה אישית (כיול) או רמת המורה. לכן "הצליח/ה" של תלמיד/ה בדרגה 14 ושל תלמיד/ה
   בדרגה 6 אינם מדד לאותו דבר, ואסור להציג את מי שנכשל בדרגה גבוהה כחלש ממי שהצליח בדרגה נמוכה.
   הכלל (LEVEL_COMPARISON, analyticsConfig): משווים רק מול מי ששיחקו את **אותו אתגר** (ולכן אותו ממד) בדרגה שונה בלא יותר מ-maxGap, ולפחות minPeers
   כאלה. אחרת — "אין מספיק תלמידים ברמה דומה להשוואה". ללא נתון רמה — לא משווים. */
import { LEVEL_BANDS, LEVEL_COMPARISON } from './analyticsConfig'

export interface PeerPlay { level: number | null; solved: boolean }

export type ComparisonResult =
  | { kind: 'compared'; peers: number; solved: number; levelFrom: number; levelTo: number }
  | { kind: 'not_enough' }
  | { kind: 'no_level' }

/* myLevel = הדרגה שבה השחקן/ית שיחק/ה את האתגר; peers = כל שאר התלמידים שניסו אותו (בלי השחקן/ית עצמו/ה) */
export function compareToPeers(myLevel: number | null, peers: readonly PeerPlay[]): ComparisonResult {
  if (myLevel === null) return { kind: 'no_level' }
  const similar = peers.filter((p): p is { level: number; solved: boolean } => p.level !== null && Math.abs(p.level - myLevel) <= LEVEL_COMPARISON.maxGap)
  if (similar.length < LEVEL_COMPARISON.minPeers) return { kind: 'not_enough' }
  const levels = similar.map((p) => p.level)
  return { kind: 'compared', peers: similar.length, solved: similar.filter((p) => p.solved).length, levelFrom: Math.min(...levels), levelTo: Math.max(...levels) }
}

export interface LevelBandCount { from: number; to: number; attempted: number; solved: number }

/* פירוק לפי טווחי דרגות: רק טווחים שיש בהם תלמידים; מי שאין לו נתון רמה לא נספר באף טווח */
export function levelBandsOf(plays: readonly PeerPlay[]): LevelBandCount[] {
  const out: LevelBandCount[] = []
  for (const b of LEVEL_BANDS) {
    const inBand = plays.filter((p) => p.level !== null && p.level >= b.from && p.level <= b.to)
    if (inBand.length > 0) out.push({ from: b.from, to: b.to, attempted: inBand.length, solved: inBand.filter((p) => p.solved).length })
  }
  return out
}
