/* מעטפת מסכי האנליטיקה: ScreenShell של הערכה + תג "נתוני הדגמה" (כשהחוזה מסמן) + בורר העדשה המשותף (אורח). */
import type { ReactNode } from 'react'
import { GuestLensSwitcher, Icon, ScreenShell, T } from '../teacherUi'
import type { BreadcrumbItem } from '../teacherUi'
import { useV2Env } from './context'
import { L } from './labels'
import { HWC_CSS } from './ui'

export function DemoChip() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 700, padding: '2px 12px', borderRadius: 14, border: `1.5px solid ${T.accent}`, color: T.text }}>
      <span style={{ color: T.accent, display: 'inline-flex' }}><Icon name="info" size={16} /></span>
      {L.demoChip}
    </span>
  )
}

export function AnalyticsShell({ title, breadcrumb, children }: { title: string; breadcrumb?: BreadcrumbItem[]; children: ReactNode }) {
  const env = useV2Env()
  /* החלפת עדשה/מקצוע חוזרת למסך הכניסה כדי להישאר במסך תקף; הערך נכתב למאגר המשותף על ידי הבורר */
  const lensSwitcher = env.guest
    ? <GuestLensSwitcher force value={{ lens: env.lens, subject: env.subject }} onChange={(n) => env.goLens(n.lens, n.subject ?? undefined)} />
    : undefined
  return (
    <ScreenShell active="analytics" title={title} breadcrumb={breadcrumb}
      titleAside={env.cfg.dataNotice && !env.guest ? <DemoChip /> : undefined}
      lensSwitcher={lensSwitcher}>
      <style>{HWC_CSS}</style>
      {children}
    </ScreenShell>
  )
}
