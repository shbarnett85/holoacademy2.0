/* ──────────────────────────────────────────────────────────────────────────
   buildErrors — סיווג כשלי בניית ניתוח כיתה: תשתית (DB / רשת / בדיקת סכמה — חולף, "נסו שוב") מול נתונים (ההרכבה או המנוע נכשלו על הנתונים של הכיתה — לא יעבור לבד).
   בקובץ נפרד כדי ש-analysisCache ו-loadWorld יתלו בו בלי תלות הדדית.
   ────────────────────────────────────────────────────────────────────────── */
export class AnalysisDataError extends Error {
  constructor(public classId: string, message: string) {
    super(message)
    this.name = 'AnalysisDataError'
  }
}
