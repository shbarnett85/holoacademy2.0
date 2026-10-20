/* תמונה קטנה של ההדמיה. אם אין תמונה (או שהיא לא נטענה) — ריבוע עם האייקון של המקצוע.
   התמונה דקורטיבית (alt ריק): השם כתוב תמיד לידה. */
import { useState } from 'react'
import { subjectStyle } from '../../shared/lib/subjectStyle'
import { T } from '../teacherUi'

interface ThumbProps {
  url: string | null
  subjectCode: string | null
  width: number
  height: number
}

export default function Thumb({ url, subjectCode, width, height }: ThumbProps) {
  const [failed, setFailed] = useState(false)
  const s = subjectStyle(subjectCode)
  if (url && !failed) {
    return <img src={url} alt="" width={width} height={height} loading="lazy" onError={() => setFailed(true)}
      style={{ width, height, objectFit: 'cover', borderRadius: 10, border: `1.5px solid ${T.border}`, flexShrink: 0, display: 'block' }} />
  }
  return (
    <span aria-hidden="true" style={{ width, height, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', border: `2px solid ${s.color}`, background: `color-mix(in srgb, ${s.color} 14%, transparent)`, fontSize: Math.round(height * 0.5) }}>
      {s.icon}
    </span>
  )
}
