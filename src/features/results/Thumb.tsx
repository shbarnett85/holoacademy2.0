/* תמונה קטנה של השיעור — אותו סגנון כמו כרטיס השיעור בספרייה (shared/ui/LessonThumb): תמונה ממוזערת במסגרת בצבע המקצוע,
   ועליה תגית המקצוע (שם המקצוע על הצבע). שיעור בלי תמונה: משטח בצבע המקצוע ועליו שם המקצוע.
   `tag="none"` רק בתמונה זעירה שהשם כתוב לידה בטקסט (ראש מסך השיעור). התמונה דקורטיבית (alt ריק): השם כתוב תמיד לידה. */
import LessonThumb from '../../shared/ui/LessonThumb'

interface ThumbProps {
  url: string | null
  subjectCode: string | null
  width: number
  height: number
  tag?: 'overlay' | 'none'
}

export default function Thumb({ url, subjectCode, width, height, tag = 'overlay' }: ThumbProps) {
  return <LessonThumb url={url} subjectCode={subjectCode} width={width} height={height} radius={10} frame={3} tag={tag} />
}
