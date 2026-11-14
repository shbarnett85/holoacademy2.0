/* הקומפוזיציה הקבועה של מסכי הפתיחה והסיכום, בקואורדינטות של תמונת הרקע ולא של המסך.
   הפורטל במרכז המסך, חלון הטקסט מימינו וד"ר הולו משמאלו, בחצי גוף וקרוב למצלמה (הרגליים מתחת לקצה התמונה).
   יש שתי קומפוזיציות, אחת לכל רקע, וכל הפונקציות מקבלות את הקומפוזיציה (ברירת המחדל: המעבדה):
     · LIBRARY — "ספריית השרתים": הרקע של מסך הפתיחה. וידאו בלולאה (6 שניות) עם תמונה קבועה כגיבוי.
     · LAB — המעבדה הכהה: עדיין הרקע של מסך הסיכום, עד שיגיע לו רקע חדש.
   מסכת הפורטל של המעבדה נגזרה מהתמונה עצמה (קרניים מהמרכז עד הקצה הזוהר של הטבעת), כי הטבעת בתמונה לא עגולה מדויק.
   בספרייה הפתח הוא עיגול שהבמה חותכת מלמטה, ולכן המסכה מחושבת (circlePolygon). */

export interface StageComposition {
  /** תמונת הרקע (וגם הגיבוי לווידאו) */
  src: string
  /** וידאו בלולאה מעל התמונה; בלי ערך: תמונה בלבד */
  video?: string
  /** light = רקע בהיר (בלי שכבות הזוהר של המעבדה הכהה) */
  tone: 'dark' | 'light'
  width: number
  height: number
  /** נקודת המוקד של cover: הפורטל נשאר במרכז גם כשהמסך חותך את התמונה */
  focal: { x: number; y: number }
  portal: { box: { x: number; y: number; width: number; height: number }; polygon: readonly number[] }
  camera: { openingScale: number; summaryScale: number; summaryFocus: { x: number; y: number }; approachMs: number; diveMs: number; pullbackMs: number; revealMs: number }
  /** ד"ר הולו: מרכז הנכס בציר x, ראש הנכס בציר y, וגובה הדמות המלאה */
  holo: { centerX: number; top: number; height: number }
}

/* עיגול שנחתך מלמטה בקו ישר (הבמה שלפני הפורטל): רשימת x,y שטוחה */
function circlePolygon(cx: number, cy: number, r: number, floorY: number, steps = 72): number[] {
  const out: number[] = []
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    out.push(Math.round(cx + r * Math.cos(t)), Math.min(floorY, Math.round(cy + r * Math.sin(t))))
  }
  return out
}

/* ספריית השרתים (1672×940). הטבעת הזוהרת: מרכז (835, 402), רדיוס 224 עד 230; הפתח שבתוכה ברדיוס 215, והבמה חותכת אותו ב-y=576 */
export const LIBRARY: StageComposition = {
  src: '/lab/library.webp',
  video: '/lab/library.mp4',
  tone: 'light',
  width: 1672,
  height: 940,
  focal: { x: 0.5, y: 0.43 },
  portal: {
    box: { x: 620, y: 187, width: 430, height: 389 },
    polygon: circlePolygon(835, 402, 215, 576),
  },
  camera: { openingScale: 1.04, summaryScale: 1.025, summaryFocus: { x: 248, y: 330 }, approachMs: 24000, diveMs: 1100, pullbackMs: 1500, revealMs: 420 },
  holo: { centerX: 248, top: 190, height: 1500 },
}

export const LAB: StageComposition = {
  src: '/lab/lab.webp',
  tone: 'dark',
  width: 2560,
  height: 1440,
  /* נקודת המוקד של cover: הפורטל במרכז */
  focal: { x: 0.5, y: 0.5 },
  portal: {
    box: { x: 828, y: 230, width: 902, height: 916 },
    polygon: [
      1730, 688, 1728, 727, 1723, 766, 1716, 804, 1705, 842, 1690, 879, 1672, 914, 1652, 948, 1628, 980,
      1601, 1009, 1571, 1036, 1541, 1061, 1507, 1082, 1472, 1101, 1435, 1117, 1397, 1129, 1358, 1138, 1319, 1144,
      1279, 1146, 1239, 1144, 1199, 1140, 1160, 1131, 1122, 1118, 1085, 1103, 1050, 1084, 1016, 1063, 985, 1038,
      956, 1011, 930, 981, 905, 949, 885, 915, 868, 879, 852, 843, 841, 805, 835, 766, 830, 727,
      828, 688, 830, 648, 835, 609, 843, 571, 854, 533, 869, 496, 888, 461, 909, 428, 933, 397,
      959, 367, 987, 340, 1018, 315, 1051, 293, 1086, 273, 1123, 258, 1161, 246, 1200, 237, 1239, 232,
      1279, 230, 1319, 232, 1358, 237, 1397, 246, 1435, 258, 1472, 274, 1507, 293, 1540, 315, 1571, 339,
      1600, 366, 1627, 396, 1650, 428, 1671, 461, 1690, 496, 1704, 533, 1716, 571, 1724, 609, 1728, 648,
    ],
  },
  /* המצלמה: קירוב איטי בפתיחה (לכיוון מרכז המסך) ובסיכום (לכיוון הפנים של ד"ר הולו) */
  camera: { openingScale: 1.04, summaryScale: 1.025, summaryFocus: { x: 380, y: 500 }, approachMs: 24000, diveMs: 1100, pullbackMs: 1500, revealMs: 420 },
  /* ד"ר הולו: מרכז הנכס בציר x, ראש הנכס בציר y, וגובה הדמות המלאה. המותן בערך בקצה התחתון של התמונה */
  holo: { centerX: 380, top: 290, height: 2300 },
}

/* איזה רקע לכל מסך. כשיגיע רקע חדש לסיכום: מחליפים כאן שורה אחת */
export const OPENING_STAGE: StageComposition = LIBRARY
export const SUMMARY_STAGE: StageComposition = LAB
export const stageFor = (state: 'opening' | 'closed' | 'open'): StageComposition => (state === 'opening' ? OPENING_STAGE : SUMMARY_STAGE)

const pairs = (flat: readonly number[]): [number, number][] => {
  const out: [number, number][] = []
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]])
  return out
}

export const portalPoints = (comp: StageComposition = LAB): string => pairs(comp.portal.polygon).map(([x, y]) => `${x},${y}`).join(' ')

/* clip-path ביחס למלבן של הפורטל */
export const portalClipPath = (comp: StageComposition = LAB): string => `polygon(${pairs(comp.portal.polygon).map(([x, y]) => `${x - comp.portal.box.x}px ${y - comp.portal.box.y}px`).join(',')})`

/* cover עם נקודת מוקד: אותה טרנספורמציה לכל הקומפוזיציה, ולכן הפורטל וד"ר הולו נשארים מיושרים למעבדה בכל גודל מסך */
export function labCover(width: number, height: number, comp: StageComposition = LAB): { scale: number; x: number; y: number } {
  const scale = Math.max(width / comp.width, height / comp.height)
  return { scale, x: (width - comp.width * scale) * comp.focal.x, y: (height - comp.height * scale) * comp.focal.y }
}

export interface CameraTransform { scale: number; x: number; y: number }
export const cameraCss = ({ scale, x, y }: CameraTransform): string => `translate(${x}px, ${y}px) scale(${scale})`

/* קואורדינטות המעבדה של מרכז המסך */
const screenCenter = (width: number, height: number, comp: StageComposition = LAB): { x: number; y: number } => {
  const c = labCover(width, height, comp)
  return { x: (width / 2 - c.x) / c.scale, y: (height / 2 - c.y) / c.scale }
}

/* טרנספורמציה של המצלמה בעולם המעבדה (transform-origin: 0 0). קירוב סביב נקודה: הנקודה נשארת במקומה */
const zoomAround = (p: { x: number; y: number }, scale: number): CameraTransform => ({ scale, x: p.x * (1 - scale), y: p.y * (1 - scale) })
export const cameraRest: CameraTransform = { scale: 1, x: 0, y: 0 }
export const cameraOpening = (width: number, height: number, comp: StageComposition = LAB): CameraTransform => zoomAround(screenCenter(width, height, comp), comp.camera.openingScale)
export const cameraSummary = (comp: StageComposition = LAB): CameraTransform => zoomAround(comp.camera.summaryFocus, comp.camera.summaryScale)

/* בתוך הפורטל: מרכז הפתח על מרכז המסך, והפתח גדול מאלכסון המסך, ולכן תמונת הפורטל ממלאה את כל המסך */
export function cameraInsidePortal(width: number, height: number, comp: StageComposition = LAB): CameraTransform {
  const c = labCover(width, height, comp)
  const { box } = comp.portal
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const radius = Math.min(box.width, box.height) / 2
  const scale = (Math.hypot(width, height) / 2 / c.scale / radius) * 1.06
  const s = screenCenter(width, height, comp)
  return { scale, x: s.x - center.x * scale, y: s.y - center.y * scale }
}

interface SceneRef { id: string; imageUrl?: string | null; nextSceneId?: string | null; choices?: { nextSceneId?: string | null }[] }

/* מה רואים בפורטל: תמונה שכבר קיימת בשיעור. פתיחה — הסצנה הראשונה אחרי המעבדה. סיכום — הסצנה האחרונה */
/* בפורטל: בפתיחה ובסיפור שנשאר פתוח, ה-establishing shot של השיעור (הסצנה שאחרי המעבדה), כי צריך לחזור ולנסות שוב.
   בסיפור שנסגר: כיתה בבית ספר, כי מסיימים וחוזרים לשיעור הרגיל (CLASSROOM_SRC) */
export const CLASSROOM_SRC = '/lab/classroom.webp'
/* בכיתה החיתוך זז ימינה, כי פינת הקיר משמאל נראתה בעיגול כמו קצה של התמונה */
export const portalFocusX = (src: string): number => src === CLASSROOM_SRC ? 0.665 : 0.5
export function labPortalImages(scenes: readonly SceneRef[], entrySceneId: string): { opening?: string } {
  const byId = new Map(scenes.map((s) => [s.id, s]))
  const entry = byId.get(entrySceneId)
  const firstId = entry?.nextSceneId ?? entry?.choices?.find((c) => c.nextSceneId)?.nextSceneId
  const first = (firstId ? byId.get(firstId)?.imageUrl : undefined) ?? scenes.find((s) => s.id !== entrySceneId && s.imageUrl)?.imageUrl ?? undefined
  return { opening: first }
}
