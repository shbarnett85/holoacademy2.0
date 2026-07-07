import { useSyncExternalStore } from 'react'
import { getSession, setSession, subscribe, type StaffProfile, type StaffRole } from '../lib/staffSession'

interface StaffAuth {
  user: StaffProfile | null
  role: StaffRole | null
  schoolId: string | null
  isStaff: boolean
  isAdmin: boolean
  isSuperAdmin: boolean
  isGuest: boolean
  logout: () => void
}

/* hook להזדהות צוות — מסונכרן בין כל הקומפוננטות דרך ה-external store */
export function useStaffAuth(): StaffAuth {
  /* תוקף נבדק בטעינה (staffSession.load) ועל 401 בקריאות ה-API — כאן רק נוכחות session */
  const session = useSyncExternalStore(subscribe, getSession, getSession)
  return {
    user: session ? session.staff : null,
    role: session ? session.staff.role : null,
    schoolId: session ? session.staff.schoolId : null,
    isStaff: !!session,
    isAdmin: !!session && (session.staff.role === 'admin' || session.staff.role === 'super_admin'),
    isSuperAdmin: !!session && session.staff.role === 'super_admin',
    isGuest: !!session && session.staff.isGuest === true,
    logout: () => setSession(null),
  }
}
