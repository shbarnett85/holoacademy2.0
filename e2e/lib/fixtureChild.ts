/* ──────────────────────────────────────────────────────────────────────────
   תהליך-בן שמריץ את server/src/scripts/resultsFixture.ts (seed / cleanup) עם cwd=server.
   שימוש (פנימי, מ-login.ts):  node tsx/cli.mjs e2e/lib/fixtureChild.ts <seed|cleanup> <fixtureFile> [argJsonFile]
   מדפיס שורה אחת "__E2E_FIXTURE_JSON__<json>" עם התוצאה. אינו מדפיס טוקנים בשום דרך אחרת.
   ────────────────────────────────────────────────────────────────────────── */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const MARKER = '__E2E_FIXTURE_JSON__'
const [mode, file, argFile] = process.argv.slice(2)

type Fn = (arg?: unknown) => Promise<unknown> | unknown

async function main(): Promise<unknown> {
  if ((mode !== 'seed' && mode !== 'cleanup') || !file) throw new Error('usage: fixtureChild.ts <seed|cleanup> <file> [argJson]')
  const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>
  const dflt = (mod.default ?? {}) as Record<string, unknown>
  const names = mode === 'seed' ? ['seedResultsFixture', 'seedFixture', 'seed'] : ['cleanupResultsFixture', 'cleanupFixture', 'cleanup']
  let fn: Fn | undefined
  for (const n of names) {
    const cand = mod[n] ?? dflt[n]
    if (typeof cand === 'function') { fn = cand as Fn; break }
  }
  if (!fn) throw new Error(`ב-${file} אין export בשם ${names[0]} (exports: ${Object.keys(mod).join(', ') || '—'})`)
  const arg = argFile ? JSON.parse(readFileSync(argFile, 'utf8')) : undefined
  /* פונקציה בלי פרמטרים → בלי ארגומנט (ניקוי לפי קידומת zz-ux-); אחרת מעבירים את תוצאת ה-seed */
  const result = fn.length === 0 || arg === undefined ? await fn() : await fn(arg)
  return result ?? null
}

main().then(
  /* ממתינים לסיום הכתיבה ל-pipe לפני יציאה (ב-Windows היא אסינכרונית); יוצאים במפורש כי לקוחות supabase משאירים handles */
  (result) => { process.stdout.write('\n' + MARKER + JSON.stringify(result) + '\n', () => process.exit(0)) },
  (e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1) },
)
