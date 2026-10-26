/* תמונה קטנה של השיעור — רכיב אחד לשיעור (shared/ui/LessonThumb): מסגרת בצבע המקצוע וסמל המקצוע בפינה.
   אין תמונה (או שלא נטענה) — ריבוע עם סמל ספר. התמונה דקורטיבית (alt ריק): השם כתוב תמיד לידה. */
import LessonThumb from '../../shared/ui/LessonThumb'

interface ThumbProps {
  url: string | null
  subjectCode: string | null
  width: number
  height: number
}

export default function Thumb({ url, subjectCode, width, height }: ThumbProps) {
  return <LessonThumb url={url} subjectCode={subjectCode} width={width} height={height} radius={10} frame={2} />
}
