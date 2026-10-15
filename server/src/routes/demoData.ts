import { Router } from 'express'
import { z } from 'zod'
import { AppError } from '../middleware/errors.js'
import { requireStaff } from '../middleware/staffAuth.js'
import {
  requireDemoScope, demoStatus, createFictitiousClass, addFictitiousStudents, refreshResults, deleteDemoData,
} from '../lib/demoData.js'

/* ── /api/staff/demo — נתוני דוגמה פיקטיביים (ארגון הדגמה בלבד) ───────────────
   כל נקודת קצה (חוץ מ-status, שמחזיר enabled:false) עוברת requireDemoScope:
   תפקיד municipal_admin/teacher + schools.demo_data_enabled של הארגון של המשתמש.
   בכל ארגון אחר — 403. הנתיב לא נוגע ב-can_share ולא עובר דרך מסלול השיתוף. */
export const demoDataRouter = Router()
demoDataRouter.use(requireStaff)

demoDataRouter.get('/status', async (req, res, next) => {
  try {
    try {
      const scope = await requireDemoScope(req.staff)
      res.json(await demoStatus(scope))
    } catch (err) {
      if (err instanceof AppError && err.status === 403) { res.json({ enabled: false }); return }
      throw err
    }
  } catch (err) { next(err) }
})

const classSchema = z.object({ name: z.string().trim().min(1).max(40).optional() })
demoDataRouter.post('/class', async (req, res, next) => {
  try {
    const scope = await requireDemoScope(req.staff)
    const body = classSchema.parse(req.body ?? {})
    res.status(201).json(await createFictitiousClass(scope, body.name))
  } catch (err) { next(err) }
})

const studentsSchema = z.object({ classId: z.string().uuid(), count: z.number().int().min(1).max(12).default(1) })
demoDataRouter.post('/students', async (req, res, next) => {
  try {
    const scope = await requireDemoScope(req.staff)
    const body = studentsSchema.parse(req.body ?? {})
    res.status(201).json(await addFictitiousStudents(scope, body.classId, body.count))
  } catch (err) { next(err) }
})

demoDataRouter.post('/refresh', async (req, res, next) => {
  try {
    const scope = await requireDemoScope(req.staff)
    res.json(await refreshResults(scope))
  } catch (err) { next(err) }
})

demoDataRouter.delete('/data', async (req, res, next) => {
  try {
    const scope = await requireDemoScope(req.staff)
    res.json(await deleteDemoData(scope))
  } catch (err) { next(err) }
})
