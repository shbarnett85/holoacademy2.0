/* ──────────────────────────────────────────────────────────────────────────
   תוכן ההדמיות עוד לא תויג (נתוני אמת): "טעויות נפוצות" ו"תחומים חזקים/מאתגרים" נשענים על תיוג, ולכן אינם פעילים בחשבון.
   החוזה אומר זאת בשדות אופציונליים: catalogReady=false + catalogNote (המשפט המוכן). חסר או true = כרגיל (כל ההדגמה).
   במצב הזה לא מציגים עמודות/כרטיסים שתמיד ריקים ולא מבטיחים ש"יופיעו כשיצטברו תשובות" — אומרים פעם אחת מה קורה, ומציגים את מה שכן נמדד.
   ────────────────────────────────────────────────────────────────────────── */
import { CATALOG_UNTAGGED_TEXT } from '../../shared/lib/findingsNarrative'

interface CatalogFields { catalogReady?: boolean; catalogNote?: string | null }

/** הקטלוג ריק: טעויות נפוצות ותחומים אינם פעילים בחשבון הזה */
export const catalogEmptyOf = (d: CatalogFields | null | undefined): boolean => d?.catalogReady === false

/** המשפט המוכן להצגה (מהחוזה; ברירת מחדל — הנוסח הכללי) */
export const catalogNoteOf = (d: CatalogFields | null | undefined): string => (d?.catalogNote && d.catalogNote.length > 0 ? d.catalogNote : CATALOG_UNTAGGED_TEXT.note)
