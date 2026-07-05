import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState } from 'react'
import Splash from './features/home/Splash'
import ErrorBoundary from './shared/ui/ErrorBoundary'
import { initSound, installGlobalClickSound } from './shared/lib/sound'

/* טעינה עצלה לכל feature */
const Home       = lazy(() => import('./features/home'))
const ClassEntry = lazy(() => import('./features/auth'))
const StaffLogin = lazy(() => import('./features/auth/StaffLogin'))
const StaffSignup = lazy(() => import('./features/auth/StaffSignup'))
const ProtectedRoute = lazy(() => import('./features/auth/ProtectedRoute'))
const Creator    = lazy(() => import('./features/creator'))
const Library    = lazy(() => import('./features/creator/Library'))
const QuestView  = lazy(() => import('./features/creator/QuestView'))
const Player     = lazy(() => import('./features/player'))
const StudentHome = lazy(() => import('./features/player/StudentHome'))
const SuperAdmin = lazy(() => import('./features/superadmin'))
const Management = lazy(() => import('./features/management'))
const Students   = lazy(() => import('./features/management/Students'))
const Analytics  = lazy(() => import('./features/analytics'))

/* טוען הולוגרפי — טבעת מסתובבת + ליבת זוהר פועמת, בצבעי הערכה */
function Loader() {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, background: 'var(--holo-bg-deep)', fontFamily: 'var(--font-display)' }}>
      <div style={{ position: 'relative', width: 64, height: 64 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(47,243,255,.15)', borderTopColor: 'var(--holo-cyan-bright)', borderRightColor: 'rgba(155,140,255,.7)', animation: 'holo-spin 0.9s linear infinite', boxShadow: '0 0 18px rgba(47,243,255,.35)' }} />
        <div style={{ position: 'absolute', inset: 16, borderRadius: '50%', background: 'radial-gradient(circle, rgba(47,243,255,.5), transparent 70%)', animation: 'holo-loader-pulse 1.4s ease-in-out infinite' }} />
      </div>
      <span className="holo-text-glow" style={{ fontSize: '0.95rem', letterSpacing: '.14em', opacity: 0.85 }}>טוען…</span>
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
        <div className={splashDone ? 'holo-screen-fade' : undefined}>
        <Routes>
          <Route path="/"                element={<Home />} />
          <Route path="/class/:urlCode"  element={<ClassEntry />} />
          <Route path="/staff/login"     element={<StaffLogin />} />
          <Route path="/staff/signup"    element={<StaffSignup />} />
          <Route path="/creator"         element={<ProtectedRoute><Creator /></ProtectedRoute>} />
          <Route path="/creator/library" element={<ProtectedRoute><Library /></ProtectedRoute>} />
          <Route path="/library"         element={<ProtectedRoute><Library /></ProtectedRoute>} />
          <Route path="/creator/quest/:questId" element={<ProtectedRoute><QuestView /></ProtectedRoute>} />
          <Route path="/admin"           element={<ProtectedRoute superAdminOnly><SuperAdmin /></ProtectedRoute>} />
          <Route path="/manage"          element={<ProtectedRoute><Management /></ProtectedRoute>} />
          <Route path="/manage/students" element={<ProtectedRoute><Students /></ProtectedRoute>} />
          <Route path="/analytics"       element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
          <Route path="/play/:questId"   element={<Player />} />
          <Route path="/student"         element={<StudentHome />} />
        </Routes>
        </div>
      </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
