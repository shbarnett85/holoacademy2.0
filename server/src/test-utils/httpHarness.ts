import express from 'express'
import type { Express } from 'express'
import type { AddressInfo } from 'node:net'
import { errorHandler } from '../middleware/errors.js'

/* שרת express זמני על פורט אקראי לבדיקות נתיבים — עם ה-errorHandler האמיתי */
export async function startApp(mount: (app: Express) => void): Promise<{ base: string; close: () => Promise<void> }> {
  const app = express()
  app.use(express.json())
  mount(app)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  const { port } = server.address() as AddressInfo
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}

export async function call(base: string, method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}
