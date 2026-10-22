/* טקסט לקוראי מסך בלבד (מוסתר חזותית). משמש להשלמת מילה לאייקון — לא כתחליף למילה גלויה. */
import type { ReactNode } from 'react'

export default function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span style={{ position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }}>{children}</span>
}
