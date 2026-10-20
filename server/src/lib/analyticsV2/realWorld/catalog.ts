/* ──────────────────────────────────────────────────────────────────────────
   catalog (חי) — בניית CatalogSnapshot משורות הטבלאות המאושרות. **טהור** (ה-I/O ב-fetchRaw.fetchCatalogRows).
   · חוק 2: רק מושגים / תפיסות / צמתי תוכנית לימודים במצב approved. טבלה ריקה ← קטלוג ריק (EMPTY_CATALOG), וזה תקין:
     וקטורי תוכן וטעויות נפוצות ריקים, והממשק אומר שעוד לא תויגו.
   · מושג נכנס רק עם וקטור תוכן מוגדר (concepts.vector — עמודה שעוד לא קיימת ב-DB; עד המיגרציה אין מושגים) ובמרחב השמות של המקצוע (חוק 3).
   · תפיסה נכנסת רק אם המושג שלה בקטלוג (אחרת אין כותרת מושג להציג); תחולת השכבות מצומת התוכנית של המושג (אין צומת ← כל השכבות).
   · mappingStatus='official' רק לצומת approved עם source_version לא ריק; אחרת 'sample'.
   ────────────────────────────────────────────────────────────────────────── */
import { CONTENT_VECTOR_KINDS, type ContentVectorKey } from '../../../../../src/shared/lib/analyticsConfig.js'
import type { SubjectCode } from '../../../../../src/shared/lib/subjects.js'
import { EMPTY_CATALOG, createCatalog, type CatalogSnapshot, type ConceptDef, type GoalDef, type MisconceptionDef } from '../catalog.js'

export interface CatalogConceptRow { id: string; key: string; titleHe: string; subject: SubjectCode | null; vector: string | null; status: string }
export interface CatalogNodeRow { id: string; titleHe: string; gradeFrom: number | null; gradeTo: number | null; status: string; sourceVersion: string | null }
export interface CatalogMisconceptionRow {
  id: string; code: string; titleHe: string; descriptionHe: string | null; subject: SubjectCode | null; conceptId: string | null; status: string
}
export interface CatalogRows {
  concepts: CatalogConceptRow[]
  nodes: CatalogNodeRow[]
  /* curriculum_links עם entity_type='concept' */
  conceptLinks: { conceptId: string; nodeId: string }[]
  misconceptions: CatalogMisconceptionRow[]
  misconceptionLinks: { misconceptionId: string; questId: string }[]
  questTitles: ReadonlyMap<string, string>
}

export const emptyCatalogRows = (): CatalogRows => ({ concepts: [], nodes: [], conceptLinks: [], misconceptions: [], misconceptionLinks: [], questTitles: new Map() })

const VECTOR_KEYS: ReadonlySet<string> = new Set(CONTENT_VECTOR_KINDS.map((v) => v.key))
const clampGrade = (g: number | null, fallback: number): number => (g !== null && Number.isFinite(g) ? Math.min(12, Math.max(1, Math.round(g))) : fallback)

export function buildCatalog(rows: CatalogRows): CatalogSnapshot {
  const nodes = new Map(rows.nodes.filter((n) => n.status === 'approved').map((n) => [n.id, n]))
  const nodeOfConcept = new Map<string, string>()
  for (const l of [...rows.conceptLinks].sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0))) {
    if (nodes.has(l.nodeId) && !nodeOfConcept.has(l.conceptId)) nodeOfConcept.set(l.conceptId, l.nodeId)
  }

  const concepts: ConceptDef[] = []
  const goals = new Map<string, GoalDef>()
  const conceptById = new Map<string, ConceptDef>()
  for (const c of [...rows.concepts].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))) {
    if (c.status !== 'approved' || !c.subject || !c.vector || !VECTOR_KEYS.has(c.vector)) continue
    if (!c.key.startsWith(`${c.subject}.`)) continue
    const node = nodes.get(nodeOfConcept.get(c.id) ?? '')
    let goalId: string | null = null
    if (node) {
      goalId = node.id
      if (!goals.has(node.id)) {
        goals.set(node.id, {
          id: node.id, title: node.titleHe, subject: c.subject, gradeFrom: clampGrade(node.gradeFrom, 1), gradeTo: clampGrade(node.gradeTo, 12),
          mappingStatus: node.sourceVersion && node.sourceVersion.trim() ? 'official' : 'sample',
        })
      }
    }
    const def: ConceptDef = { key: c.key, titleHe: c.titleHe, subject: c.subject, vector: c.vector as ContentVectorKey, goalId }
    concepts.push(def)
    conceptById.set(c.id, def)
  }

  const questOfMisconception = new Map<string, string>()
  for (const l of [...rows.misconceptionLinks].sort((a, b) => (a.questId < b.questId ? -1 : a.questId > b.questId ? 1 : 0))) {
    if (!questOfMisconception.has(l.misconceptionId)) questOfMisconception.set(l.misconceptionId, l.questId)
  }
  const misconceptions: MisconceptionDef[] = []
  for (const m of [...rows.misconceptions].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))) {
    if (m.status !== 'approved' || !m.subject || !m.conceptId) continue
    const concept = conceptById.get(m.conceptId)
    if (!concept) continue
    const node = nodes.get(nodeOfConcept.get(m.conceptId) ?? '')
    const questId = questOfMisconception.get(m.id)
    const questTitle = questId ? rows.questTitles.get(questId) : undefined
    misconceptions.push({
      id: m.id, code: m.code, titleHe: m.titleHe, descriptionHe: m.descriptionHe ?? '',
      conceptKey: concept.key, subject: m.subject,
      prevalence: {},
      grades: node ? { from: clampGrade(node.gradeFrom, 1), to: clampGrade(node.gradeTo, 12) } : null,
      linkedQuest: questId && questTitle ? { questId, title: questTitle } : null,
    })
  }

  if (!concepts.length && !misconceptions.length && !goals.size) return EMPTY_CATALOG
  return createCatalog({ concepts, misconceptions, goals: [...goals.values()] })
}
