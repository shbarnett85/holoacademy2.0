import { useCallback, useState } from 'react'

interface AuthUser {
  userId: string
  role: 'student' | 'teacher' | 'admin'
  classId: string | null
}

/* פענוח payload של JWT — לתצוגה בלבד, ללא אימות חתימה (האימות בשרת) */
function decodeToken(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (payload.exp && payload.exp * 1000 < Date.now()) return null
    return {
      userId: payload.userId,
      role: payload.role,
      classId: payload.classId ?? null,
    }
  } catch {
    return null
  }
}

export function useAuth() {
  const [token, setToken] = useState(() => sessionStorage.getItem('holo_token'))

  const user = token ? decodeToken(token) : null

  const logout = useCallback(() => {
    sessionStorage.removeItem('holo_token')
    sessionStorage.removeItem('holo_student_name')
    setToken(null)
  }, [])

  return { user, isLoggedIn: user !== null, logout }
}
