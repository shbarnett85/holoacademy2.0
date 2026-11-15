import { describe, expect, it } from 'vitest'
import { LAB, LIBRARY, LIBRARY_CLOSED, LIBRARY_OPEN, cameraInsidePortal, cameraOpening, cameraSummary, labCover, labPortalImages, portalPoints, stageFor } from './labComposition'

describe('labCover', () => {
  it('ממלא את המסך וממרכז לפי נקודת המוקד', () => {
    for (const [w, h] of [[1366, 768], [1920, 1080], [740, 360], [1024, 768]]) {
      const { scale, x, y } = labCover(w, h)
      expect(LAB.width * scale).toBeGreaterThanOrEqual(w - 0.01)
      expect(LAB.height * scale).toBeGreaterThanOrEqual(h - 0.01)
      expect(x).toBeLessThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(0)
    }
  })
  it('הפורטל במרכז המסך בכל גודל', () => {
    const cx = LAB.portal.box.x + LAB.portal.box.width / 2
    for (const [w, h] of [[1366, 768], [1920, 1080], [740, 360], [1024, 768]]) {
      const { scale, x } = labCover(w, h)
      expect(Math.abs(cx * scale + x - w / 2) / w).toBeLessThan(0.01)
    }
  })
})

describe('מצלמה', () => {
  const SIZES = [[1366, 768], [1920, 1080], [740, 360], [1024, 768]]
  it('בתוך הפורטל: כל פינות המסך בתוך פתח הפורטל', () => {
    const pts = portalPoints().split(' ').map((p) => p.split(',').map(Number))
    const inside = (x: number, y: number) => {
      let c = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]; const [xj, yj] = pts[j]
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
      }
      return c
    }
    for (const [w, h] of SIZES) {
      const cover = labCover(w, h)
      const cam = cameraInsidePortal(w, h)
      for (const [sx, sy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
        const world = { x: (sx - cover.x) / cover.scale, y: (sy - cover.y) / cover.scale }
        expect(inside((world.x - cam.x) / cam.scale, (world.y - cam.y) / cam.scale)).toBe(true)
      }
    }
  })
  it('קירוב הפתיחה משאיר את מרכז המסך במקומו, וקירוב הסיכום את הפנים של ד"ר הולו', () => {
    for (const [w, h] of SIZES) {
      const cover = labCover(w, h)
      const center = { x: (w / 2 - cover.x) / cover.scale, y: (h / 2 - cover.y) / cover.scale }
      const cam = cameraOpening(w, h)
      expect(center.x * cam.scale + cam.x).toBeCloseTo(center.x)
      expect(center.y * cam.scale + cam.y).toBeCloseTo(center.y)
    }
    const s = cameraSummary()
    expect(LAB.camera.summaryFocus.x * s.scale + s.x).toBeCloseTo(LAB.camera.summaryFocus.x)
  })
})

describe('labPortalImages', () => {
  const scenes = [
    { id: 'lab', imageUrl: 'old-lab.png', nextSceneId: 's1' },
    { id: 's1', imageUrl: 'first.png', nextSceneId: 's2' },
    { id: 's2', imageUrl: 'second.png', nextSceneId: 's3' },
    { id: 's3', imageUrl: 'last.png', nextSceneId: null },
  ]
  it('פתיחה: הסצנה שאחרי המעבדה. סיכום: הסצנה האחרונה. תמונת המעבדה הישנה לא מוצגת', () => {
    expect(labPortalImages(scenes, 'lab')).toEqual({ opening: 'first.png' })
  })
  it('בלי nextSceneId בכניסה: הבחירה הראשונה', () => {
    const hub = [{ id: 'lab', choices: [{ nextSceneId: 's2' }] }, { id: 's1', imageUrl: 'a.png' }, { id: 's2', imageUrl: 'b.png', nextSceneId: 's1' }]
    expect(labPortalImages(hub, 'lab').opening).toBe('b.png')
  })
  it('שיעור בלי תמונות: בלי תמונה בפורטל', () => {
    expect(labPortalImages([{ id: 'lab' }, { id: 's1' }], 'lab')).toEqual({ opening: undefined })
  })
})

describe('ספריית השרתים (הרקע של מסכי הפתיחה והסיכום)', () => {
  const SIZES = [[1366, 768], [1920, 1080], [740, 360], [1024, 768], [1366, 620]]
  it('פתיחה: הספרייה הרגילה; סיפור פתוח: האפורה; סיפור שנסגר: הבוהקת', () => {
    expect(stageFor('opening')).toBe(LIBRARY)
    expect(stageFor('closed')).toBe(LIBRARY_CLOSED)
    expect(stageFor('open')).toBe(LIBRARY_OPEN)
    /* שלוש הגרסאות הן אותו צילום: אותה קומפוזיציה, רק קבצים אחרים */
    for (const c of [LIBRARY_OPEN, LIBRARY_CLOSED]) {
      expect({ ...c, src: '', video: '' }).toEqual({ ...LIBRARY, src: '', video: '' })
      expect(c.video).toBeTruthy()
    }
    expect(LIBRARY.video).toBeTruthy()
  })
  it('ממלא את המסך, והפורטל נשאר במרכז בכל גודל', () => {
    const cx = LIBRARY.portal.box.x + LIBRARY.portal.box.width / 2
    for (const [w, h] of SIZES) {
      const { scale, x, y } = labCover(w, h, LIBRARY)
      expect(LIBRARY.width * scale).toBeGreaterThanOrEqual(w - 0.01)
      expect(LIBRARY.height * scale).toBeGreaterThanOrEqual(h - 0.01)
      expect(x).toBeLessThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(0)
      expect(Math.abs(cx * scale + x - w / 2) / w).toBeLessThan(0.01)
    }
  })
  it('המסכה: עיגול שהבמה חותכת מלמטה, כולו בתוך המלבן של הפורטל', () => {
    const { box } = LIBRARY.portal
    const pts = portalPoints(LIBRARY).split(' ').map((p) => p.split(',').map(Number))
    expect(pts.length).toBeGreaterThan(40)
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(box.x)
      expect(x).toBeLessThanOrEqual(box.x + box.width)
      expect(y).toBeGreaterThanOrEqual(box.y)
      expect(y).toBeLessThanOrEqual(box.y + box.height)
    }
    expect(Math.max(...pts.map((p) => p[1]))).toBe(box.y + box.height)
  })
  it('בתוך הפורטל: תמונת הפורטל ממלאת את כל המסך', () => {
    const { box } = LIBRARY.portal
    for (const [w, h] of SIZES) {
      const cover = labCover(w, h, LIBRARY)
      const cam = cameraInsidePortal(w, h, LIBRARY)
      /* המלבן של הפורטל על המסך אחרי המצלמה: מכסה את כל פינות המסך */
      const sx = (wx: number) => (wx * cam.scale + cam.x) * cover.scale + cover.x
      const sy = (wy: number) => (wy * cam.scale + cam.y) * cover.scale + cover.y
      expect(sx(box.x)).toBeLessThanOrEqual(0)
      expect(sx(box.x + box.width)).toBeGreaterThanOrEqual(w)
      expect(sy(box.y)).toBeLessThanOrEqual(0)
      expect(sy(box.y + box.height)).toBeGreaterThanOrEqual(h)
    }
  })
})
