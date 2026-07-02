import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import GameScreen from './GameScreen'
import { homePathForRole } from '../../shared/lib/homePath'
import { usePlaySession } from './usePlaySession'
import type { GameData } from './useGameEngine'

interface QuestPayload {
  id: string
  title: string
  game_data: GameData | null
}

/* slug ידידותי לכתובת ההדמיה הציבורית (URL קריא, כמו /play/leonardo) — מתורגם
   ל-id האמיתי דרך GET /api/quests/demo לפני שהמשחק/ה-session מתחילים. */
const DEMO_SLUGS: Record<string, true> = { leonardo: true }

/* כניסה למשחק — טעינת ה-quest לפי id (או slug ציבורי) והפעלת המנוע */
export default function Player() {
  const { questId: rawId } = useParams<{ questId: string }>()
  const isDemoSlug = !!rawId && DEMO_SLUGS[rawId]
  /* עד שה-slug מתורגם ל-id אמיתי — questId נשאר undefined, כך ש-usePlaySession
     (וה-fetch) לא ינסו לפעול על מחרוזת לא-תקנית ("leonardo" אינו uuid). */
  const [resolvedId, setResolvedId] = useState<string | undefined>(isDemoSlug ? undefined : rawId)
  const questId = resolvedId
  const [quest, setQuest] = useState<QuestPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  /* מחזור חיי ה-session — start בתחילה, complete מרוכז בסיום (best-effort) */
  const { initialState, settled, saveResume, complete, variantGameData } = usePlaySession(questId)

  useEffect(() => {
    if (!isDemoSlug) return
    fetch('/api/quests/demo')
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error ?? 'הדמו לא נמצא')
        }
        return res.json()
      })
      .then((body) => setResolvedId(body.id))
      .catch((e: Error) => setError(e.message))
  }, [isDemoSlug])

  useEffect(() => {
    if (!questId) return
    fetch(`/api/quests/${questId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error ?? 'הדמיה לא נמצאה')
        }
        return res.json()
      })
      .then((body) => setQuest(body.quest))
      .catch((e: Error) => setError(e.message))
  }, [questId])

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="holo-panel text-center" style={{ borderColor: 'rgba(255,80,120,0.4)' }}>
          <p style={{ color: '#ff7099' }}>{error}</p>
        </div>
      </div>
    )
  }

  /* ממתינים גם לטעינת ההדמיה וגם לסיום ניסיון ה-session (כדי להחיל resume לפני אתחול המנוע) */
  if (!quest || !settled) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="holo-text-glow text-xl">טוען את ההרפתקה…</span>
      </div>
    )
  }

  if (!quest.game_data?.scenes?.length) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="holo-panel text-center">
          <p>להדמיה זו אין עדיין תוכן משחק</p>
        </div>
      </div>
    )
  }

  const effectiveGameData = (variantGameData as GameData | null) ?? quest.game_data

  return (
    <GameScreen
      gameData={effectiveGameData}
      questTitle={quest.title}
      initialState={initialState}
      saveResume={saveResume}
      onComplete={complete}
      backPath={homePathForRole()}
    />
  )
}
