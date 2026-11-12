/* הגדרות הבדיקות: אותן הגדרות Vite, ועוד שני דברים.
   · קובצי ה-CSS נקראים בבדיקות כטקסט (?raw): בדיקות הניגודיות מחשבות מקובץ הטוקנים עצמו, וסריקת הצבעים הקשיחים מכסה גם CSS.
   · עותקי עבודה ישנים תחת .claude/ אינם חלק מהפרויקט ולא נסרקים. */
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    css: { include: [/tokens\.css/, /index\.css/, /App\.css/] },
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
}))
