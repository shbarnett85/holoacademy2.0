/* תגי Open Graph דינמיים לקישורי /play/:id — קישור הדמיה ששותף בוואטסאפ/טלגרם
   מציג תצוגה עשירה (כותרת + תמונת הסצנה + תיאור). ה-crawlers של וואטסאפ/פייסבוק
   לא מריצים JS, לכן ההזרקה נעשית בשרת על ה-index.html הסטטי לפני ההגשה.
   המודול pure (ללא DB/‏fs) ונבדק ביחידה; טעינת הנתונים נשארת ב-index.ts. */

export interface PlayMeta {
  title: string
  description?: string
  imageUrl?: string
  url: string
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/* מסיר את תגי ברירת-המחדל (og / description / twitter) של index.html ומזריק את תגי
   ההדמיה במקומם + מחליף את ה-<title>. תג כפול = ה-crawler בוחר שרירותית, לכן ההסרה. */
export function injectPlayMeta(html: string, meta: PlayMeta): string {
  const title = `${escapeHtml(meta.title)} · HoloAcademy`
  const desc = escapeHtml((meta.description ?? 'הדמיית למידה אינטראקטיבית — שחקו עכשיו, בלי התקנה ובלי הרשמה.').slice(0, 160))
  const tags = [
    `<meta name="description" content="${desc}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${desc}" />`,
    meta.imageUrl ? `<meta property="og:image" content="${escapeHtml(meta.imageUrl)}" />` : '',
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="HoloAcademy" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].filter(Boolean).join('\n    ')
  return html
    .replace(/[ \t]*<meta (?:property="og:|name="(?:description|twitter:))[^>]*>\s*\n?/g, '')
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace('</head>', `    ${tags}\n  </head>`)
}

/* גזירת PlayMeta מהדמיה: תמונת סצנת הפתיחה + תחילת הנרטיב (ללא ניקוד, לתצוגה נקייה) */
export function questToPlayMeta(quest: { title: string; game_data: unknown }, url: string): PlayMeta {
  const gd = quest.game_data as { scenes?: { id: string; imageUrl?: string; narrative?: string }[]; entrySceneId?: string } | null
  const scenes = gd?.scenes ?? []
  const entry = scenes.find((s) => s.id === gd?.entrySceneId) ?? scenes[0]
  const narrative = (entry?.narrative ?? '').replace(/[֑-ׇ]/g, '').replace(/\s+/g, ' ').trim()
  return {
    title: quest.title,
    description: narrative ? narrative.slice(0, 150) + (narrative.length > 150 ? '…' : '') : undefined,
    imageUrl: entry?.imageUrl ?? scenes.find((s) => s.imageUrl)?.imageUrl,
    url,
  }
}
