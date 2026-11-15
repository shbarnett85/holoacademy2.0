/* הקומפוזיציה הקבועה של מסכי הפתיחה והסיכום, בקואורדינטות של תמונת הרקע ולא של המסך.
   הפורטל במרכז המסך, חלון הטקסט מימינו וד"ר הולו משמאלו, בחצי גוף וקרוב למצלמה (הרגליים מתחת לקצה התמונה).
   לכל רקע קומפוזיציה משלו, וכל הפונקציות מקבלות את הקומפוזיציה (ברירת המחדל: המעבדה):
     · LIBRARY / LIBRARY_OPEN / LIBRARY_CLOSED — "ספריית השרתים" בשלוש גרסאות (פתיחה, סיפור פתוח, סיפור שנסגר). וידאו בלולאה עם תמונה קבועה כגיבוי.
     · LAB — המעבדה הכהה, הרקע הקודם; לא מוצגת יותר.
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
  /** הפורטל כהולוגרמה (PortalHologram): מרכז הפתח ורדיוסו, וקדמת הבמה (מכאן הרצפה וההשתקפות). בלי ערך: תמונה בלבד */
  hologram?: { cx: number; cy: number; r: number; stageFront: number }
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

/* ספריית השרתים (1280×720): שלוש גרסאות של אותו צילום, באותה קומפוזיציה בדיוק — פתיחה (רגילה), סיפור שנשאר פתוח (אפורה ואפלה),
   סיפור שנסגר (בהירה ובוהקת). הדלת שבתוך הטבעת: עיגול כהה ריק במרכז (640, 355) ברדיוס 178; המסכה ברדיוס 182, כדי שקצה הדלת לא ייראה,
   והבמה חותכת אותה ב-y=494. הדלת כהה ולכן גם ההשתקפות שלה ברצפה ניטרלית, והיא מתאימה לכל תמונה בפורטל.
   כל לולאה 3.5 שניות ב-24 פריימים, עם מעבר רך בנקודת החיבור */
const libraryStage = (name: string): StageComposition => ({
  src: `/lab/${name}.webp`,
  video: `/lab/${name}.mp4`,
  tone: 'light',
  width: 1280,
  height: 720,
  focal: { x: 0.5, y: 0.47 },
  portal: {
    box: { x: 458, y: 173, width: 364, height: 321 },
    polygon: circlePolygon(640, 355, 182, 494),
  },
  camera: { openingScale: 1.04, summaryScale: 1.025, summaryFocus: { x: 190, y: 253 }, approachMs: 24000, diveMs: 1100, pullbackMs: 1500, revealMs: 420 },
  holo: { centerX: 190, top: 145, height: 1148 },
  /* קדמת הבמה ב-y=545; ההשתקפות האפויה של הטבעת ברצפה מתאימה למראה עם קיצור של 0.85 */
  hologram: { cx: 640, cy: 355, r: 182, stageFront: 545 },
})
export const LIBRARY: StageComposition = libraryStage('library')
export const LIBRARY_OPEN: StageComposition = libraryStage('library-open')
export const LIBRARY_CLOSED: StageComposition = libraryStage('library-closed')

/* המעבדה הכהה: הרקע הקודם של מסכי הפתיחה והסיכום. לא מוצגת יותר; נשארת כקומפוזיציה לדוגמה ולבדיקות */
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

/* איזה רקע לכל מסך: פתיחה — הספרייה הרגילה; סיפור שנשאר פתוח — הגרסה האפורה; סיפור שנסגר — הגרסה הבוהקת */
export const OPENING_STAGE: StageComposition = LIBRARY
const STAGES = { opening: LIBRARY, open: LIBRARY_OPEN, closed: LIBRARY_CLOSED } as const
export const stageFor = (state: 'opening' | 'closed' | 'open'): StageComposition => STAGES[state]

/* הגאומטריה של ההולוגרמה בעולם: הפתח, הבמה, והאזור שהקנבס מכסה (הפורטל, הזוהר שלו וההשתקפות עד תחתית התמונה) */
export function hologramGeometry(comp: StageComposition) {
  const h = comp.hologram
  if (!h) return null
  const { box } = comp.portal
  const top = box.y - 12
  return {
    box, cx: h.cx, cy: h.cy, r: h.r,
    stageTop: box.y + box.height,
    stageFront: h.stageFront,
    rect: { x: h.cx - h.r - 58, y: top, width: (h.r + 58) * 2, height: comp.height - top },
  }
}

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

/* בפורטל, בפתיחה ובשני מצבי הסיכום: ה-establishing shot של השיעור (הסצנה שאחרי המעבדה).
   נכנסים לעולם של השיעור דרך הפורטל בפתיחה, ויוצאים ממנו דרכו בסוף */
export function labPortalImages(scenes: readonly SceneRef[], entrySceneId: string): { opening?: string } {
  const byId = new Map(scenes.map((s) => [s.id, s]))
  const entry = byId.get(entrySceneId)
  const firstId = entry?.nextSceneId ?? entry?.choices?.find((c) => c.nextSceneId)?.nextSceneId
  const first = (firstId ? byId.get(firstId)?.imageUrl : undefined) ?? scenes.find((s) => s.id !== entrySceneId && s.imageUrl)?.imageUrl ?? undefined
  return { opening: first }
}
