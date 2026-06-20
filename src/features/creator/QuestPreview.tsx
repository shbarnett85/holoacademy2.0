import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreatorStore, type GeneratedQuest } from './creatorStore'
import { artStyleLabel } from '../../shared/lib/labels'
import { apiJson } from '../../shared/lib/api'
import QuestWorkspace, { WorkspaceActions } from './QuestWorkspace'

type Scene = GeneratedQuest['game_data']['scenes'][number]

/* החלון שנפתח מיד אחרי יצירת הדמיה — אותה סביבת עבודה כמו מצב טיוטה */
export default function QuestPreview() {
  const { result, warnings, hub, reset, generate, set, artStyle } = useCreatorStore()
  const navigate = useNavigate()

  /* מצב בדיקת העובדות האסינכרונית (רצה ברקע בשרת) */
  const [factStatus, setFactStatus] = useState<'pending' | 'done' | null>(null)
  const [factWarnings, setFactWarnings] = useState<string[]>([])
  const [correctedCount, setCorrectedCount] = useState(0)
  const questId = result?.id ?? null

  useEffect(() => {
    if (!questId) return
    /* אם היצירה כבר חזרה עם factCheck=pending — נתחיל polling */
    const initial = useCreatorStore.getState().result?.game_data?.factCheck
    if (!initial || initial.status === 'done') {
      if (initial?.status === 'done') {
        setFactStatus('done')
        setFactWarnings(initial.warnings ?? [])
        setCorrectedCount(initial.correctedSceneIds?.length ?? 0)
      }
      return
    }

    setFactStatus('pending')
    let cancelled = false
    let tries = 0
    const poll = async () => {
      tries += 1
      try {
        const { quest } = await apiJson<{ quest: GeneratedQuest }>(`/api/quests/${questId}`)
        const fc = quest.game_data?.factCheck
        if (cancelled) return
        if (fc?.status === 'done') {
          /* מיזוג התוכן המעודכן (כולל תיקונים) חזרה ל-store, אם המורה לא ערך בינתיים */
          const current = useCreatorStore.getState().result
          if (current && current.id === quest.id) set({ result: quest })
          setFactStatus('done')
          setFactWarnings(fc.warnings ?? [])
          setCorrectedCount(fc.correctedSceneIds?.length ?? 0)
          return
        }
      } catch {
        /* התעלמות — ננסה שוב */
      }
      if (!cancelled && tries < 25) timer = window.setTimeout(poll, 3000)
    }
    let timer = window.setTimeout(poll, 3000)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [questId, set])

  if (!result) return null
  const scenes = result.game_data?.scenes ?? []
  const endingGood = result.game_data?.endingGood
  const endingBad = result.game_data?.endingBad

  /* עדכון סצנה ב-store */
  function patchScene(sceneId: string, patch: Partial<Scene>) {
    const current = useCreatorStore.getState().result
    if (!current) return
    set({
      result: {
        ...current,
        game_data: {
          ...current.game_data,
          scenes: current.game_data.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)),
        },
      },
    })
  }

  /* עדכון סצנת סיום ב-store */
  type EndingScene = NonNullable<typeof endingGood>
  function patchEnding(which: 'good' | 'bad', patch: Partial<EndingScene>) {
    const current = useCreatorStore.getState().result
    if (!current) return
    set({
      result: {
        ...current,
        game_data: {
          ...current.game_data,
          ...(which === 'good'
            ? { endingGood: { ...current.game_data.endingGood, ...patch } as EndingScene }
            : { endingBad: { ...current.game_data.endingBad, ...patch } as EndingScene }),
        },
      },
    })
  }

  /* אזהרות המוצגות: בזמן בדיקה — אזהרות המבנה הראשוניות; בסיום — הסט המלא מהשרת */
  const shownWarnings = factStatus === 'done' ? factWarnings : warnings
  const correctedNote =
    factStatus === 'done' && correctedCount > 0
      ? [`✨ ${correctedCount} סצנות עודכנו בבדיקת העובדות — אם פתחתם סצנה לעריכה, רעננו לצפייה בתיקון`]
      : []

  return (
    <QuestWorkspace
      questId={result.id}
      title={result.title}
      subtitle={
        <>
          {`ההדמיה נוצרה! · ${scenes.length} סצנות · ${artStyleLabel(artStyle)}`}
          {factStatus === 'pending' && (
            <span style={{ display: 'block', marginTop: '0.3rem', color: 'var(--holo-cyan)' }}>
              🔍 בודק עובדות ברקע…
            </span>
          )}
        </>
      }
      scenes={scenes}
      endingGood={endingGood}
      endingBad={endingBad}
      warnings={[...correctedNote, ...shownWarnings]}
      hub={hub}
      patchScene={patchScene}
      patchEnding={patchEnding}
      actions={
        <WorkspaceActions
          onSave={() => { reset(); navigate('/creator/library') }}
          onRegenerate={() => generate()}
          onPlay={() => navigate(`/play/${result.id}`)}
        />
      }
    />
  )
}
