import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'

/* עטיפת route לעמודי צוות — דורש isStaff (אחרת ל-/staff/login).
   adminOnly / superAdminOnly לעמודי ניהול. */
export default function ProtectedRoute({
  children,
  adminOnly,
  superAdminOnly,
}: {
  children: ReactNode
  adminOnly?: boolean
  superAdminOnly?: boolean
}) {
  const { isStaff, isAdmin, isSuperAdmin } = useStaffAuth()
  if (!isStaff) return <Navigate to="/staff/login" replace />
  if (superAdminOnly && !isSuperAdmin) return <Navigate to="/creator/library" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/creator/library" replace />
  return <>{children}</>
}
