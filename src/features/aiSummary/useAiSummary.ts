/* ──────────────────────────────────────────────────────────────────────────
   useAiSummary — החיבור בין מכונת המצבים (state.ts) לבין React: טוען את הסיכום השמור והזכאות (GET) כשהיעד מתחלף,
   וחושף פעולות: כתיבה, כתיבה מחדש, עריכה, שמירה, ביטול, חזרה לטקסט של ד״ר הולו, וניסיון חוזר לטעינה.
   · אין setState סינכרוני ב-effect: "טוען" נגזר מכך שהמצב האחרון שייך למפתח אחר (כמו useV2).
   · api ניתן להחלפה (בדיקות) — ברירת המחדל summaryApi.
   ────────────────────────────────────────────────────────────────────────── */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { SummaryTarget } from '../../shared/types/aiSummaryV1'
import { summaryApi } from './api'
import type { SummaryApi, SummaryParams } from './api'
import { derive, initialState, runLoad, runSave, runWrite, summaryReducer, targetKey } from './state'
import type { FlowCtx, PanelModel } from './state'

export interface AiSummaryActions {
  /** כתבו לי סיכום (או כתיבה מחדש / "נסו שוב עם ד״ר הולו" כש-regenerate=true). discardEdit: אושרה מחיקת עריכת המורה */
  write: (regenerate?: boolean, discardEdit?: boolean) => void
  /** כתיבה מחדש: אם הסיכום ערוך — מוצג חלון אישור (לא כותבים עד שהמורה מאשרת); אחרת כותבים */
  regenerate: () => void
  /** אישור בחלון: כתיבה מחדש ומחיקת העריכה */
  confirmRegenerate: () => void
  /** ביטול בחלון: העריכה נשארת */
  cancelRegenerate: () => void
  editStart: () => void
  draftChange: (text: string) => void
  save: () => void
  cancel: () => void
  /** חזרה לטקסט של ד״ר הולו */
  revert: () => void
  /** ניסיון חוזר לטעינה */
  reload: () => void
}

export function useAiSummary(target: SummaryTarget, params: SummaryParams, api: SummaryApi = summaryApi): { model: PanelModel; actions: AiSummaryActions } {
  const [tick, setTick] = useState(0)
  const [state, dispatch] = useReducer(summaryReducer, initialState)
  /* מזהה היעד כפרימיטיבים: האובייקטים שמגיעים מההורה נבנים מחדש בכל רינדור, והמפתח הוא שמחליט מתי לטעון */
  const key = targetKey(target, params, tick)
  const latest = useRef({ target, params, api, state, key })
  useEffect(() => { latest.current = { target, params, api, state, key } })

  const { scope, id, subject } = target
  const lens = params.lens
  const lensSubject = params.subject
  useEffect(() => {
    let cancelled = false
    const t: SummaryTarget = subject ? { scope, id, subject } : { scope, id }
    const p: SummaryParams = { lens, subject: lensSubject }
    void runLoad({ api: latest.current.api, target: t, params: p, key, dispatch, cancelled: () => cancelled })
    return () => { cancelled = true }
  }, [key, scope, id, subject, lens, lensSubject])

  /* פעולות שנקראות מאירועי לחיצה: משתמשות בערך האחרון, ומתבטלות אם המסך נסגר או שהיעד התחלף באמצע */
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const flow = useCallback((): FlowCtx => {
    const l = latest.current
    return { api: l.api, target: l.target, params: l.params, key: l.key, dispatch, cancelled: () => !alive.current || latest.current.key !== l.key }
  }, [])

  const actions = useMemo<AiSummaryActions>(() => ({
    write: (regenerate = false, discardEdit = false) => { void runWrite(flow(), regenerate, discardEdit) },
    regenerate: () => {
      const l = latest.current
      if (derive(l.state, l.key, l.target.scope).summary?.edited) dispatch({ type: 'regenAsked', key: l.key })
      else void runWrite(flow(), true, false)
    },
    confirmRegenerate: () => { void runWrite(flow(), true, true) },
    cancelRegenerate: () => dispatch({ type: 'regenCancelled', key: latest.current.key }),
    editStart: () => dispatch({ type: 'editStarted', key: latest.current.key }),
    draftChange: (text) => dispatch({ type: 'draftChanged', key: latest.current.key, text }),
    save: () => { void runSave(flow(), latest.current.state, latest.current.state.draft) },
    cancel: () => dispatch({ type: 'editCancelled', key: latest.current.key }),
    revert: () => { void runSave(flow(), latest.current.state, null) },
    reload: () => setTick((t) => t + 1),
  }), [flow])

  return { model: derive(state, key, scope), actions }
}
