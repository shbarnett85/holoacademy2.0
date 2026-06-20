import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../shared/lib/api'
import QuestWorkspace, { WorkspaceActions } from './QuestWorkspace'
import type { GeneratedQuest } from './creatorStore'

type Scene = GeneratedQuest['game_data']['scenes'][number]

type EndingScene = NonNullable<import('./creatorStore').GeneratedQuest['game_data']['endingGood']>

interface QuestDetails {
  id: string
  title: string
  created_at: string
  status: string
  game_data: { scenes: Scene[]; endingGood?: EndingScene; endingBad?: EndingScene } | null
}

/* מצב טיוטה מהספרייה — אותה סביבת עבודה כמו החלון שאחרי יצירה (QuestWorkspace) */
export default function QuestView() {
  const { questId } = useParams<{ questId: string }>()
  const navigate = useNavigate()
  const [quest, setQuest] = useState<QuestDetails | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!questId) return
    apiFetch(`/api/quests/${questId}`)
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

  /* עדכון סצנה ב-state המקומי */
  function patchScene(sceneId: string, patch: Partial<Scene>) {
    setQuest((q) =>
      q && q.game_data
        ? { ...q, game_data: { ...q.game_data, scenes: q.game_data.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)) } }
        : q,
    )
  }

  /* עדכון סצנת סיום ב-state המקומי */
  function patchEnding(which: 'good' | 'bad', patch: Partial<EndingScene>) {
    setQuest((q) =>
      q && q.game_data
        ? { ...q, game_data: { ...q.game_data, ...(which === 'good' ? { endingGood: { ...q.game_data.endingGood, ...patch } as EndingScene } : { endingBad: { ...q.game_data.endingBad, ...patch } as EndingScene }) } }
        : q,
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="holo-panel max-w-sm w-full text-center" style={{ borderColor: 'rgba(255,80,120,0.4)' }}>
          <p style={{ color: '#ff7099' }}>{error}</p>
          <button className="holo-button mt-4" onClick={() => navigate('/creator/library')}>
            חזרה לספרייה
          </button>
        </div>
      </div>
    )
  }

  if (!quest) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="holo-text-glow text-xl">טוען…</span>
      </div>
    )
  }

  const scenes = quest.game_data?.scenes ?? []
  const endingGood = quest.game_data?.endingGood
  const endingBad = quest.game_data?.endingBad
  const statusLabel = quest.status === 'published' ? 'פורסם' : 'טיוטה'

  return (
    <QuestWorkspace
      questId={quest.id}
      title={quest.title}
      subtitle={`${new Date(quest.created_at).toLocaleDateString('he-IL')} · ${scenes.length} סצנות · ${statusLabel}`}
      scenes={scenes}
      endingGood={endingGood}
      endingBad={endingBad}
      patchScene={patchScene}
      patchEnding={patchEnding}
      actions={
        <WorkspaceActions
          onSave={() => navigate('/creator/library')}
          onRegenerate={() => navigate('/creator')}
          onPlay={() => navigate(`/play/${quest.id}`)}
        />
      }
    />
  )
}
