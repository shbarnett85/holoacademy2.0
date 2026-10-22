/* שכבת-על פתוחה: שאר העמוד inert וגם מוסתר (כדי שיישאר h1 גלוי אחד), ובסגירה המצב הקודם משוחזר בדיוק. אלמנטים מדומים — בלי דפדפן. */
import { describe, expect, it } from 'vitest'
import { lockPageBehind, type LockableElement } from './sheetLock'

class FakeEl implements LockableElement {
  name: string
  attrs = new Map<string, string>()
  style = { visibility: '' }
  constructor(name: string, init: { inert?: boolean; visibility?: string } = {}) {
    this.name = name
    if (init.inert) this.attrs.set('inert', '')
    if (init.visibility !== undefined) this.style.visibility = init.visibility
  }
  hasAttribute(n: string): boolean { return this.attrs.has(n) }
  setAttribute(n: string, v: string): void { this.attrs.set(n, v) }
  removeAttribute(n: string): void { this.attrs.delete(n) }
}

describe('lockPageBehind', () => {
  it('נועל את כל האחים חוץ מהשכבה עצמה: inert + visibility:hidden', () => {
    const root = new FakeEl('root'); const toast = new FakeEl('toast'); const sheet = new FakeEl('sheet')
    lockPageBehind([root, sheet, toast], sheet)
    for (const el of [root, toast]) { expect(el.hasAttribute('inert'), el.name).toBe(true); expect(el.style.visibility, el.name).toBe('hidden') }
    expect(sheet.hasAttribute('inert')).toBe(false)
    expect(sheet.style.visibility).toBe('')
  })

  it('שחרור: מחזיר inert והנראות למצב הקודם בדיוק (גם נראות שהייתה מוגדרת מראש)', () => {
    const root = new FakeEl('root'); const custom = new FakeEl('custom', { visibility: 'visible' }); const sheet = new FakeEl('sheet')
    const unlock = lockPageBehind([root, custom, sheet], sheet)
    unlock()
    expect(root.hasAttribute('inert')).toBe(false)
    expect(root.style.visibility).toBe('')
    expect(custom.hasAttribute('inert')).toBe(false)
    expect(custom.style.visibility).toBe('visible')
  })

  it('אלמנט שכבר נעול (inert) לא נוגעים בו, ולא משחררים אותו בסגירה — שייך למי שנעל אותו', () => {
    const root = new FakeEl('root'); const other = new FakeEl('other-sheet', { inert: true, visibility: 'hidden' }); const sheet = new FakeEl('sheet')
    const unlock = lockPageBehind([root, other, sheet], sheet)
    expect(other.style.visibility).toBe('hidden')
    unlock()
    expect(other.hasAttribute('inert')).toBe(true)
    expect(other.style.visibility).toBe('hidden')
    expect(root.hasAttribute('inert')).toBe(false)
  })

  it('שתי שכבות זו על זו: הסגירה של העליונה מחזירה את התחתונה, ושל התחתונה את העמוד', () => {
    const root = new FakeEl('root'); const first = new FakeEl('first'); const second = new FakeEl('second')
    const unlockFirst = lockPageBehind([root, first], first)
    const unlockSecond = lockPageBehind([root, first, second], second)
    expect(first.hasAttribute('inert')).toBe(true)
    unlockSecond()
    expect(first.hasAttribute('inert')).toBe(false)
    expect(first.style.visibility).toBe('')
    expect(root.hasAttribute('inert')).toBe(true)
    unlockFirst()
    expect(root.hasAttribute('inert')).toBe(false)
    expect(root.style.visibility).toBe('')
  })

  it('בלי אחים: לא קורה כלום, והשחרור בטוח', () => {
    const sheet = new FakeEl('sheet')
    expect(() => lockPageBehind([sheet], sheet)()).not.toThrow()
  })
})
