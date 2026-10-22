/* מעטפת מסכי האנליטיקה: ScreenShell של הערכה + תג "נתוני הדגמה" (כשהחוזה מסמן) + בורר העדשה המשותף (אורח)
   + "איך חישבנו?" — כפתור אחד קבוע בשורת הכותרת, בכל מסך (שורות ההסבר המשותפות מ-HOW_WE_CALC; howExtra = שורות נוספות של המסך). */
import type { ReactNode } from 'react'
import { HOW_WE_CALC } from '../../shared/lib/findingsNarrative'
import { GuestLensSwitcher, Icon, ScreenShell, T } from '../teacherUi'
import type { BreadcrumbItem } from '../teacherUi'
import { useV2Env } from './context'
import { L } from './labels'

export function DemoChip() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 700, padding: '2px 12px', borderRadius: 14, border: `1.5px solid ${T.accent}`, color: T.text }}>
      <span style={{ color: T.accent, display: 'inline-flex' }}><Icon name="info" size={16} /></span>
      {L.demoChip}
    </span>
  )
}

export function AnalyticsShell({ title, breadcrumb, howExtra, children }: { title: string; breadcrumb?: BreadcrumbItem[]; howExtra?: ReactNode; children: ReactNode }) {
  const env = useV2Env()
  /* החלפת עדשה/מקצוע חוזרת למסך הכניסה כדי להישאר במסך תקף; הערך נכתב למאגר המשותף על ידי הבורר */
  const lensSwitcher = env.guest
    ? <GuestLensSwitcher force value={{ lens: env.lens, subject: env.subject }} onChange={(n) => env.goLens(n.lens, n.subject ?? undefined)} />
    : undefined
  return (
    <ScreenShell active="analytics" title={title} breadcrumb={breadcrumb}
      titleAside={env.cfg.dataNotice && !env.guest ? <DemoChip /> : undefined}
      lensSwitcher={lensSwitcher}
      howWeCalc={{ lines: HOW_WE_CALC.lines, children: howExtra }}>
      {children}
    </ScreenShell>
  )
}
