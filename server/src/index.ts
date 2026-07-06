import './env.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import { authRouter } from './routes/auth.js'
import { questsRouter } from './routes/quests.js'
import { imagesRouter } from './routes/images.js'
import { aiRouter } from './routes/ai.js'
import { adminRouter } from './routes/admin.js'
import { staffRouter } from './routes/staff.js'
import { sessionsRouter } from './routes/sessions.js'
import { analyticsRouter } from './routes/analytics.js'
import { libraryRouter } from './routes/library.js'
import { errorHandler } from './middleware/errors.js'
import { info } from './lib/log.js'

const app = express()

/* מאחורי proxy (Railway) — נדרש כדי ש-req.ip ישקף את ה-IP האמיתי של הלקוח
   (משמש את הגבלת הקצב על נקודות האימות) */
app.set('trust proxy', 1)

/* CORS — בפרודקשן הקליינט מוגש same-origin מהשרת עצמו, אז אם CLIENT_URL לא הוגדר
   אין לפתוח לכל origin (allow-all עם credentials = פרצה); same-origin לא צריך CORS
   בכלל, לכן origin:false בטוח. ה-fallback הפתוח נשמר לדב בלבד. */
const allowedOrigins = process.env.CLIENT_URL
  ? [process.env.CLIENT_URL, 'http://localhost:5173']
  : process.env.NODE_ENV === 'production'
    ? false // same-origin בלבד — בלי CORS
    : true // allow all (dev fallback)
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json({ limit: '2mb' }))

/* endpoint בדיקה */
/* endpoint ציבורי — בוליאני "מוגדר/לא" בלבד, בלי לחשוף שום חלק מהמפתחות עצמם */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    superadminConfigured: !!(process.env.SUPERADMIN_EMAILS?.trim()),
    guestConfigured: !!(process.env.GUEST_EMAIL?.trim()),
    supabaseConfigured: !!(process.env.SUPABASE_URL?.trim()),
    togetherConfigured: !!(process.env.TOGETHER_API_KEY?.trim()),
    anthropicConfigured: !!(process.env.ANTHROPIC_API_KEY?.trim()),
  })
})

app.use('/api', authRouter)
app.use('/api/quests', questsRouter)
app.use('/api/quests', imagesRouter)
app.use('/api/ai', aiRouter)
app.use('/api/admin', adminRouter)
app.use('/api/staff', staffRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/analytics', analyticsRouter)
app.use('/api/library', libraryRouter)

/* בפרודקשן — Express מגיש את ה-React bundle ומטפל ב-SPA routing.
   dist/ נמצא ב-../.. יחסית לקובץ הנוכחי (server/src/index.ts → root/dist) */
if (process.env.NODE_ENV === 'production') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const distPath = path.resolve(__dirname, '../../dist')
  app.use(express.static(distPath))
  app.get('{*path}', (_req, res) => res.sendFile(path.join(distPath, 'index.html')))
}

/* error handler מרכזי — תמיד אחרון */
app.use(errorHandler)

const port = Number(process.env.PORT) || 3001
const server = app.listen(port, () => {
  info(`✦ HoloAcademy server רץ על http://localhost:${port}`)
})

/* יצירות גדולות יכולות להימשך עד 10 דקות — מסירים את ה-timeout-ים של Node
   שעלולים לחתוך את הבקשה לפני הגבול הלוגי. הגבול האמיתי (10 דקות) נאכף
   ע"י ה-AbortController בלקוח וע"י timeout של קריאת Claude. */
server.requestTimeout = 660_000 /* 11 דקות — מסגרת חיצונית מעל ה-10 דקות */
server.headersTimeout = 665_000
server.timeout = 0 /* ללא timeout על חוסר-פעילות בשקע בזמן המתנה ל-Claude */
server.keepAliveTimeout = 660_000
