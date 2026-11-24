/* הקוד של הנגן נטען בנפרד (lazy). כשהוא נטען מראש, לפני הכניסה לשיעור (player/lessonPreload), הנתיב /play מציג אותו
   מיד, בלי רגע של מסך טעינה בין מסך בחירת השיעורים למשחק. */
import type { ComponentType } from 'react'

export const loadPlayer = () => import('../../features/player')
let loaded: ComponentType | null = null
export const preloadPlayer = (): Promise<void> => loadPlayer().then((m) => { loaded = m.default })
export const loadedPlayer = (): ComponentType | null => loaded
