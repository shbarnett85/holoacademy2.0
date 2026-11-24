import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { createElement, lazy, Suspense, useEffect, useState } from 'react'
import Splash from './features/home/Splash'
import LeaveTransition from './shared/ui/LeaveTransition'
import { loadPlayer, loadedPlayer } from './shared/lib/playerChunk'
import MemoryDevHarness from './features/player/MemoryDevHarness'
import SecretDeck from './features/deck/SecretDeck'
import ErrorBoundary from './shared/ui/ErrorBoundary'
import { HoloDialogHost } from './shared/ui/dialog'
import { initSound, installGlobalClickSound } from './shared/lib/sound'

/* טעינה עצלה לכל feature */
const Home       = lazy(() => import('./features/home'))
const ClassEntry = lazy(() => import('./features/auth'))
const StaffLogin = lazy(() => import('./features/auth/StaffLogin'))
const Forgot = lazy(() => import('./features/auth/PasswordReset').then((m) => ({ default: m.ForgotPassword })))
const Reset  = lazy(() => import('./features/auth/PasswordReset').then((m) => ({ default: m.ResetPassword })))
const StaffSignup = lazy(() => import('./features/auth/StaffSignup'))
const ProtectedRoute = lazy(() => import('./features/auth/ProtectedRoute'))
const Creator    = lazy(() => import('./features/creator'))
const Library    = lazy(() => import('./features/creator/Library'))
const QuestView  = lazy(() => import('./features/creator/QuestView'))
const LazyPlayer = lazy(loadPlayer)
/* הנגן שכבר נטען מראש (לפני הצלילה לפורטל) מוצג מיד, בלי מסך הטעינה של הנתיב */
function Player() { const ready = loadedPlayer(); return ready ? createElement(ready) : <LazyPlayer /> }
const StudentHome = lazy(() => import('./features/player/StudentHome'))
const SuperAdmin = lazy(() => import('./features/superadmin'))
const Management = lazy(() => import('./features/management'))
const Students   = lazy(() => import('./features/management/Students'))
const Analytics  = lazy(() => import('./features/analytics'))
const Results    = lazy(() => import('./features/results'))
const TeacherUiGallery = import.meta.env.DEV ? lazy(() => import('./features/teacherUi/DevGallery')) : null

/* מסכי מורה (יושבים על טוקני הערכה, ברירת מחדל בהירה) — הטוען שלהם בצבעי הערכה כדי שלא יהבהב כהה לפני מסך בהיר */
const TEACHER_PREFIXES = ['/creator', '/library', '/manage', '/analytics', '/results']

/* טוען הולוגרפי — טבעת מסתובבת + ליבת זוהר פועמת, בצבעי הערכה */
function Loader() {
  const { pathname } = useLocation()
  const teacher = TEACHER_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
  if (teacher) {
    return (
      <div role="status" style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, background: 'var(--page-background)', fontFamily: 'var(--font-display)' }}>
        <div style={{ position: 'relative', width: 64, height: 64 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid color-mix(in srgb, var(--color-machine-deep) 16%, transparent)', borderTopColor: 'var(--color-machine-deep)', borderRightColor: 'var(--color-machine-deep)', animation: 'holo-spin 0.9s linear infinite' }} />
        </div>
        <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-muted)' }}>טוען…</span>
      </div>
    )
  }
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, background: 'var(--page-background)', fontFamily: 'var(--font-display)' }}>
      <div style={{ position: 'relative', width: 64, height: 64 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid var(--color-line)', borderTopColor: 'var(--color-ink)', borderRightColor: 'var(--color-ink)', animation: 'holo-spin 0.9s linear infinite' }} />
      </div>
      <span style={{ fontSize: '0.95rem', letterSpacing: '.14em', color: 'var(--color-ink)', fontWeight: 600 }}>טוען…</span>
    </div>
  )
}

export default function App() {
  /* ספלאש פתיחה — פעם אחת לכל טעינת לשונית (sessionStorage), לא בכל ניווט */
  const [splashDone, setSplashDone] = useState(() => sessionStorage.getItem('holo_splash_seen') === '1')

  /* סאונד: preload + צליל קליק גלובלי על כל הכפתורים בכל האפליקציה (מורה/תלמיד/משחק) */
  useEffect(() => { initSound(); installGlobalClickSound() }, [])

  return (
    <BrowserRouter>
      {!splashDone && (
        <Splash onDone={() => { sessionStorage.setItem('holo_splash_seen', '1'); setSplashDone(true) }} />
      )}
      <ErrorBoundary>
      <Suspense fallback={<Loader />}>
        {/* בלי דהייה אחרי הספלאש: הספלאש נפתח כמו פורטל וחושף את העמוד שכבר מרונדר מתחתיו */}
        <div>
        <Routes>
          <Route path="/"                element={<Home />} />
          <Route path="/class/:urlCode"  element={<ClassEntry />} />
          <Route path="/staff/login"     element={<StaffLogin />} />
          <Route path="/staff/signup"    element={<StaffSignup />} />
          <Route path="/staff/forgot"    element={<Forgot />} />
          <Route path="/staff/reset"     element={<Reset />} />
          {/* היצירה פתוחה לכולם — הרשמה נדרשת רק לשיתוף לכיתה */}
          <Route path="/creator"         element={<Creator />} />
          <Route path="/creator/library" element={<Library />} />
          <Route path="/library"         element={<ProtectedRoute><Library /></ProtectedRoute>} />
          <Route path="/creator/quest/:questId" element={<QuestView />} />
          <Route path="/admin"           element={<ProtectedRoute superAdminOnly><SuperAdmin /></ProtectedRoute>} />
          <Route path="/manage"          element={<ProtectedRoute><Management /></ProtectedRoute>} />
          <Route path="/manage/students" element={<ProtectedRoute><Students /></ProtectedRoute>} />
          {/* תוצאות: רשימת שליחות → שליחה (כיתה) → תלמיד/ה. הקומפוננטה קוראת את הכתובת בעצמה */}
          <Route path="/results"         element={<ProtectedRoute><Results /></ProtectedRoute>} />
          <Route path="/results/:submissionId" element={<ProtectedRoute><Results /></ProtectedRoute>} />
          <Route path="/results/:submissionId/live" element={<ProtectedRoute><Results /></ProtectedRoute>} />
          <Route path="/results/:submissionId/discuss" element={<ProtectedRoute><Results /></ProtectedRoute>} />
          <Route path="/results/:submissionId/student/:studentId" element={<ProtectedRoute><Results /></ProtectedRoute>} />
          <Route path="/analytics"       element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
          {/* האנליטיקה החדשה מנתבת פנימית בין כיתה לתלמיד; הכתובות האלה מוכנות עבורה */}
          <Route path="/analytics/class/:classId" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
          <Route path="/analytics/student/:studentId" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
          <Route path="/play/:questId"   element={<Player />} />
          {/* גלריית עיצוב לשקעי הקריסטלים — DEV בלבד */}
          {import.meta.env.DEV && <Route path="/dev/memory" element={<MemoryDevHarness />} />}
          {/* גלריית ערכת הממשק למסכי מורה (בהיר + כהה) — DEV בלבד */}
          {import.meta.env.DEV && TeacherUiGallery && <Route path="/dev/teacher-ui" element={<TeacherUiGallery />} />}
          {/* עמוד סודי (לא מקושר): מצגת GESAwards 2026 */}
          <Route path="/ges2026" element={<SecretDeck />} />
          <Route path="/student"         element={<StudentHome />} />
        </Routes>
        </div>
      </Suspense>
      <LeaveTransition />
      <HoloDialogHost />
      </ErrorBoundary>
    </BrowserRouter>
  )
}
