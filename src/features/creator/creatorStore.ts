import { create } from 'zustand'
import { apiFetch } from '../../shared/lib/api'

/* סוגי החידות הזמינים */
export const PUZZLE_TYPES = [
  { key: 'multipleChoice', label: 'שאלות בחירה מרובה' },
  { key: 'trueFalse', label: 'נכון / לא נכון' },
  { key: 'itemUsage', label: 'שימוש במפתח' },
  { key: 'tileSwap', label: 'פאזל החלפת חלקים' },
  { key: 'wordSearch', label: 'תפזורת' },
  { key: 'memory', label: 'משחק הזיכרון' },
  { key: 'wordCompletion', label: 'השלם את החסר' },
  { key: 'sequenceOrder', label: 'חידת סדר' },
  { key: 'hangman', label: 'פיצוח קוד' },
  { key: 'moralDilemma', label: 'שאלת מוסר' },
] as const

/* ששת הסגנונות האמנותיים הסופיים (key תואם ל-STYLE_SUFFIX בשרת) */
export const ART_STYLES = [
  { key: 'digital-painting', label: 'ציור דיגיטלי', icon: '🎨' },
  { key: 'realistic', label: 'ריאליסטי', icon: '📷' },
  { key: 'comic', label: 'קומיקס', icon: '💥' },
  { key: 'storybook', label: 'ספר ילדים', icon: '📖' },
  { key: 'anime', label: 'אנימה / מנגה', icon: '🌸' },
  { key: 'pixar-3d', label: 'תלת-ממד מצויר', icon: '🧸' },
] as const

export interface GeneratedQuest {
  id: string
  title: string
  game_data: {
    scenes: {
      id: string
      title: string
      narrative?: string
      imagePrompt?: string
      imageUrl?: string
      drHoloExpression?: string
      puzzle?: {
        type?: string
        question: string
        choices?: { id: string; text: string; isCorrect: boolean }[]
        explanationCorrect?: string
        explanationIncorrect?: string
        gridSize?: number
        words?: string[]
        pairs?: { a: string; b: string }[]
        sentence?: string
        answer?: string
        answers?: string[]
        wordBank?: string[]
        items?: { id: string; text: string; imagePrompt?: string }[]
        correctOrder?: string[]
        orderType?: string
        maxWrong?: number
        situation?: string
        moralChoices?: { text: string; consequence: string }[]
        difficulty?: number
        /* יעד הלמידה שהאתגר בוחן — מזהה מתוך game_data.objectives */
        objectiveId?: string | null
        questions?: {
          question: string
          options: string[]
          correctIndex: number
          explanationCorrect?: string
          explanationIncorrect?: string
          objectiveId?: string
        }[]
      }
      collectableItem?: { id: string; name: string; icon: string; imageUrl?: string }
      choices?: { id: string; text: string; nextSceneId?: string | null; requiredItemIds?: string[]; unlockText?: string }[]
      requiresItemId?: string | null
      unlockText?: string
    }[]
    entrySceneId: string
    isHistorical?: boolean
    /* יעדי הלמידה של ההדמיה — האתגרים מתויגים בהם דרך puzzle.objectiveId */
    objectives?: { id: string; text: string }[]
    endingGood?: { title: string; narrative: string; drHoloDialog?: string; imagePrompt?: string; imageUrl?: string; drHoloExpression?: string }
    endingBad?: { title: string; narrative: string; drHoloDialog?: string; imagePrompt?: string; imageUrl?: string; drHoloExpression?: string }
    /* מטא בדיקת עובדות אסינכרונית — נכתב ברקע אחרי היצירה */
    factCheck?: {
      status: 'pending' | 'done'
      warnings?: string[]
      correctedSceneIds?: string[]
      error?: boolean
    }
  }
}

/* מידע על מבנה ה-Hub שזוהה בשרת */
export interface HubInfo {
  hubSceneId: string
  hubTitle: string
  paths: { entryChoiceText: string; sceneTitles: string[]; keyId: string | null }[]
  lockedChoiceText: string
}

interface CreatorState {
  /* סקציה 1 — תוכן */
  title: string
  subject: string
  curriculum: string
  /* יעדי למידה (אופציונלי, עד 8) — כל אתגר יתויג ביעד שהוא בוחן */
  objectives: string[]
  questType: 'adventure' | 'tour'
  questLength: number

  /* סקציה 2 — חידות */
  puzzleTypes: Record<string, boolean>
  puzzleCounts: Record<string, number>

  /* סקציה 3 — התאמות */
  writingLevel: number
  puzzleDifficulty: number
  includeDrHolo: boolean
  artStyle: string

  /* מצב יצירה */
  status: 'idle' | 'generating' | 'done' | 'error'
  error: string | null
  result: GeneratedQuest | null
  warnings: string[]
  hub: HubInfo | null

  set: (partial: Partial<CreatorState>) => void
  togglePuzzle: (key: string) => void
  setPuzzleCount: (key: string, count: number) => void
  generate: () => Promise<void>
  reset: () => void
}

export const useCreatorStore = create<CreatorState>((set, get) => ({
  title: '',
  subject: '',
  curriculum: '',
  objectives: [],
  questType: 'adventure',
  questLength: 7,
  puzzleTypes: {},
  puzzleCounts: {},
  /* רמת היצירה על סקאלת 1-20 (שכבת גיל 4-17). שני השדות זהים — בורר שכבת-גיל
     יחיד מניע כתיבה+אופי+חידות (ראו CreationForm). דיפולט ו' = רמה 10. */
  writingLevel: 10,
  puzzleDifficulty: 10,
  includeDrHolo: true,
  artStyle: 'digital-painting',
  status: 'idle',
  error: null,
  result: null,
  warnings: [],
  hub: null,

  set: (partial) => set(partial),

  togglePuzzle: (key) =>
    set((s) => ({
      puzzleTypes: { ...s.puzzleTypes, [key]: !s.puzzleTypes[key] },
      puzzleCounts: { ...s.puzzleCounts, [key]: s.puzzleCounts[key] ?? 1 },
    })),

  setPuzzleCount: (key, count) =>
    set((s) => ({ puzzleCounts: { ...s.puzzleCounts, [key]: count } })),

  /* שליחת הבקשה לשרת — timeout של 10 דקות (יצירות גדולות + retry אפשרי בשרת) */
  generate: async () => {
    const s = get()
    set({ status: 'generating', error: null })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 600_000)

    try {
      const res = await apiFetch('/api/quests/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          title: s.title,
          subject: s.subject || undefined,
          curriculum: s.curriculum,
          objectives: s.objectives.filter((o) => o.trim()).length > 0 ? s.objectives.filter((o) => o.trim()) : undefined,
          questType: s.questType,
          questLength: s.questLength,
          puzzlePreferences: {
            types: s.puzzleTypes,
            counts: s.puzzleCounts,
          },
          difficultySettings: {
            writingLevel: s.writingLevel,
            puzzleDifficulty: s.puzzleDifficulty,
          },
          includeDrHolo: s.includeDrHolo,
          artStyle: s.artStyle,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'יצירת ההדמיה נכשלה')
      }

      /* השרת מחזיר מיד stub עם id; היצירה רצה ברקע. עושים polling ל-GET /:id
         עד שה-game_data מוכן (scenes) או שנכשל (genError). מנתק מ-timeout של proxy. */
      const { quest: stub } = await res.json()
      const questId: string = stub.id
      const deadline = Date.now() + 600_000
      let lastErr = ''
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4000))
        try {
          const r = await apiFetch(`/api/quests/${questId}`, { signal: controller.signal })
          if (!r.ok) continue
          const body = await r.json()
          const gd = body.quest?.game_data
          if (gd?.genError) { lastErr = gd.genError; break }
          if (gd?.scenes?.length) {
            const meta = gd.genMeta ?? {}
            set({ status: 'done', result: body.quest, warnings: meta.warnings ?? [], hub: meta.hub ?? null })
            return
          }
          /* עדיין נוצר (generating) — ממשיכים polling */
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') throw e
          /* שגיאת רשת חולפת — ננסה שוב בסבב הבא */
        }
      }
      throw new Error(lastErr || 'היצירה נמשכה זמן רב מדי — נסו שוב')
    } catch (err) {
      set({
        status: 'error',
        error:
          err instanceof DOMException && err.name === 'AbortError'
            ? 'היצירה נמשכה יותר מ-10 דקות ונעצרה — נסו שוב'
            : err instanceof Error
              ? err.message
              : 'שגיאה לא צפויה',
      })
    } finally {
      clearTimeout(timer)
    }
  },

  reset: () => set({ status: 'idle', error: null, result: null, warnings: [], hub: null }),
}))
