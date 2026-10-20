/* ──────────────────────────────────────────────────────────────────────────
   דוחות: report.json (מלא, לצריכה ע"י כלים) + report.md (טבלה קריאה + פירוט כשלים).
   ────────────────────────────────────────────────────────────────────────── */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { screenChecklist } from './checklist.ts'
import { THRESHOLDS } from './config.ts'
import type { ScreenResult } from './types.ts'

export interface RunMeta {
  generatedAt: string
  base: string
  api: string
  theme: 'light' | 'dark'
  viewports: string[]
  strict: boolean
  args: string[]
  fixture: { used: boolean; note: string | null }
}

export interface Summary {
  screens: number
  ok: number
  missing: number
  skipped: number
  error: number
  axeSeriousCritical: number
  forbiddenHits: number
  failing: number
  strictFailing: number
}

export function summarize(results: ScreenResult[]): Summary {
  const s: Summary = { screens: results.length, ok: 0, missing: 0, skipped: 0, error: 0, axeSeriousCritical: 0, forbiddenHits: 0, failing: 0, strictFailing: 0 }
  for (const r of results) {
    s[r.status]++
    if (r.axe) s.axeSeriousCritical += r.axe.serious + r.axe.critical
    s.forbiddenHits += r.forbidden.length
    if (r.hardFailures.length) s.failing++
    if (r.strictFailures.length) s.strictFailing++
  }
  return s
}

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
const OK = '✓'
const NO = '✗'

function row(r: ScreenResult): string {
  const l = r.layout
  const na = '—'
  if (r.status !== 'ok' || !l || !r.axe) {
    const label = r.status === 'missing' ? 'MISSING' : r.status === 'skipped' ? 'SKIPPED' : r.status === 'error' ? 'ERROR' : r.status
    return `| ${cell(r.id)} | ${r.viewport} | ${label} | ${na} | ${na} | ${na} | ${na} | ${na} | ${na} | ${r.clicksFromMainTab ?? na} |`
  }
  const fits = l.fitsOneScreen ? OK : `${NO} +${l.overflowPx}px`
  const axe = r.axe.serious + r.axe.critical === 0 ? `${OK} 0` : `${NO} ${r.axe.serious + r.axe.critical}`
  const small = l.smallTargets.count === 0 ? `${OK} 0/${l.smallTargets.total}` : `${NO} ${l.smallTargets.count}/${l.smallTargets.total}`
  const minFont = l.fonts.min === null ? na : l.fonts.min < THRESHOLDS.fontFlag ? `${NO} ${l.fonts.min}px (${l.fonts.below16} <16)` : l.fonts.below16 > 0 ? `~ ${l.fonts.min}px (${l.fonts.below16} <16)` : `${OK} ${l.fonts.min}px`
  const forb = r.forbidden.length === 0 ? `${OK} 0` : `${NO} ${r.forbidden.length} (${[...new Set(r.forbidden.map((h) => h.word))].join(', ')})`
  const crumb = !r.inner ? na : l.breadcrumb.present ? OK : NO
  const clicks = r.clicksFromMainTab === null ? na : r.clicksFromMainTab > THRESHOLDS.maxClicks ? `${NO} ${r.clicksFromMainTab}` : String(r.clicksFromMainTab)
  return `| ${cell(r.id)} | ${r.viewport} | ok | ${fits} | ${axe} | ${small} | ${minFont} | ${forb} | ${crumb} | ${clicks} |`
}

function details(r: ScreenResult): string[] {
  const out: string[] = []
  out.push(`### ${r.id} @ ${r.viewport}`)
  out.push(`- URL: \`${r.finalUrl ?? r.requestedUrl}\`${r.screenshot ? ` · צילום: \`${r.screenshot}\`` : ''}${r.loadMs !== null ? ` · ${r.loadMs}ms` : ''}`)
  if (r.statusDetail) out.push(`- סטטוס: **${r.status}** — ${r.statusDetail}`)
  for (const f of r.hardFailures) out.push(`- **כשל:** ${f}`)
  for (const f of r.strictFailures) out.push(`- strict: ${f}`)
  if (r.axe) {
    for (const v of r.axe.violations) {
      out.push(`- axe \`${v.id}\` (${v.impact}, ${v.nodes} צמתים): ${v.help} — ${v.targets.slice(0, 2).map((t) => `\`${t.slice(0, 80)}\``).join(', ')}`)
    }
  }
  for (const h of r.forbidden) out.push(`- מילה אסורה "${h.word}": …${h.context}…`)
  const l = r.layout
  if (l) {
    if (!l.fitsOneScreen) {
      out.push(`- גלילה: מסמך ${l.scrollHeight}px מול חלון ${l.innerHeight}px; החריגה הגבוהה ביותר ${l.tallestOverflowPx}px`)
      for (const o of l.overflowers) out.push(`  - מגיע הכי נמוך: \`${o.selector}\` "${o.text}" ${o.note ?? ''}`)
    }
    for (const s of l.innerScrollers.slice(0, 3)) out.push(`- אזור גלילה פנימי: \`${s.selector}\` (+${s.overflowPx}px)`)
    if (l.smallTargets.count) {
      out.push(`- יעדים קטנים (${l.smallTargets.count}${l.smallTargets.inlineExcluded ? `, ${l.smallTargets.inlineExcluded} קישורים בתוך משפט לא נספרו` : ''}):`)
      for (const e of l.smallTargets.examples) out.push(`  - \`${e.selector}\` "${e.text}" ${e.w}×${e.h}`)
    }
    if (l.fonts.below16) {
      out.push(`- גופנים קטנים מ-${THRESHOLDS.fontBody}px: ${l.fonts.below16} אלמנטים (${l.fonts.below14} מתחת ל-${THRESHOLDS.fontFlag}) מתוך ${l.fonts.textElements}`)
      for (const e of l.fonts.examples.slice(0, 5)) out.push(`  - ${e.size}px \`${e.selector}\` "${e.text}"`)
    }
    if (l.hoverOnly.controls + l.hoverOnly.info) {
      out.push(`- hover-only: ${l.hoverOnly.controls} פקדים, ${l.hoverOnly.info} פריטי מידע`)
      for (const e of l.hoverOnly.examples.slice(0, 5)) out.push(`  - \`${e.selector}\` ${e.note ?? ''}`)
    }
    if (l.clickableNonSemantic.count) {
      out.push(`- לחיצים בלי תפקיד סמנטי (cursor:pointer): ${l.clickableNonSemantic.count}`)
      for (const e of l.clickableNonSemantic.examples.slice(0, 4)) out.push(`  - \`${e.selector}\` "${e.text}"`)
    }
    out.push(`- breadcrumb: ${l.breadcrumb.present ? `${l.breadcrumb.via} — "${l.breadcrumb.text}"` : 'אין'} · h1: ${l.headings.h1}${l.headings.firstH1 ? ` ("${l.headings.firstH1}")` : ''}`)
  }
  if (r.consoleErrors.count) out.push(`- שגיאות קונסול (${r.consoleErrors.count}): ${r.consoleErrors.samples.slice(0, 3).map((s) => `\`${s.slice(0, 120)}\``).join(' · ')}`)
  if (r.failedRequests.count) out.push(`- בקשות שנכשלו (${r.failedRequests.count}): ${r.failedRequests.samples.slice(0, 5).map((s) => `\`${s}\``).join(' · ')}`)
  if (r.note) out.push(`- הערה: ${r.note}`)
  out.push('')
  return out
}

export function buildMarkdown(meta: RunMeta, results: ScreenResult[], sum: Summary): string {
  const lines: string[] = []
  lines.push('# דוח ביקורת UX/נגישות')
  lines.push('')
  lines.push(`- הופק: ${meta.generatedAt} · base: ${meta.base} · ערכה: **${meta.theme}** · viewports: ${meta.viewports.join(', ')}${meta.strict ? ' · **strict**' : ''}`)
  lines.push(`- fixture מורים אמיתיים: ${meta.fixture.used ? 'כן' : 'לא'}${meta.fixture.note ? ` — ${meta.fixture.note}` : ''}`)
  lines.push(`- מסכים: ${sum.screens} · תקינים (ok): ${sum.ok} · missing: ${sum.missing} · skipped: ${sum.skipped} · error: ${sum.error}`)
  lines.push(`- **כשלים קשיחים (גורמים ל-exit 1):** ${sum.failing} מסכים — axe חמור/קריטי: ${sum.axeSeriousCritical} הפרות · מילים אסורות: ${sum.forbiddenHits} · שגיאות הרצה: ${sum.error}`)
  lines.push(`- כשלי strict (פריסה/יעדים/גופן/hover/breadcrumb/לחיצות): ${sum.strictFailing} מסכים`)
  lines.push('')
  lines.push('| Screen | Viewport | Status | Fits 1 screen | Axe serious+critical | Small targets (<44px) | Min font | Forbidden words | Breadcrumb | Clicks from main tab |')
  lines.push('|---|---|---|---|---|---|---|---|---|---|')
  for (const r of results) lines.push(row(r))
  lines.push('')
  lines.push('מקרא: ✓ עבר · ✗ נכשל · ~ אזהרה (גופן קטן מ-16px) · — לא רלוונטי/לא נמדד. "Axe" = מספר כללי axe שנכשלו ב-impact serious/critical. "Small targets" = קטנים/סה"כ יעדי לחיצה גלויים.')
  lines.push('')

  const problem = results.filter((r) => r.status !== 'ok' || r.hardFailures.length || r.strictFailures.length || (r.layout && (r.layout.clickableNonSemantic.count || r.layout.fonts.below16)) || r.consoleErrors.count)
  if (problem.length) {
    lines.push('## פירוט')
    lines.push('')
    for (const r of problem) lines.push(...details(r))
  }
  return lines.join('\n')
}

export async function writeReports(outDir: string, meta: RunMeta, results: ScreenResult[]): Promise<{ json: string; md: string; summary: Summary }> {
  await mkdir(outDir, { recursive: true })
  const summary = summarize(results)
  const json = path.join(outDir, 'report.json')
  const md = path.join(outDir, 'report.md')
  /* לכל מסך (גם missing/skipped/error): h1, נתיב חזרה, לחיצות, נכנס-במסך-אחד, צילום — ראו checklist.ts */
  const enriched = results.map((r) => ({ ...r, checklist: screenChecklist(r) }))
  await writeFile(json, JSON.stringify({ meta, summary, results: enriched }, null, 2), 'utf8')
  await writeFile(md, buildMarkdown(meta, results, summary), 'utf8')
  return { json, md, summary }
}
