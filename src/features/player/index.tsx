import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import GameScreen from './GameScreen'
import { usePlaySession } from './usePlaySession'
import type { GameData } from './useGameEngine'

interface QuestPayload {
  id: string
  title: string
  game_data: GameData | null
}

/* כניסה למשחק — טעינת ה-quest לפי id והפעלת המנוע */
export default function Player() {
  const { questId } = useParams<{ questId: string }>()
  const [quest, setQuest] = useState<QuestPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  /* מחזור חיי ה-session — start בתחילה, complete מרוכז בסיום (best-effort) */
  const { initialState, settled, saveResume, complete } = usePlaySession(questId)

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

  return (
    <GameScreen
      gameData={quest.game_data}
      questTitle={quest.title}
      initialState={initialState}
      saveResume={saveResume}
      onComplete={complete}
      backPath="/student"
    />
  )
}
