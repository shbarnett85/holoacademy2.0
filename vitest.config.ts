/* הגדרות הבדיקות: אותן הגדרות Vite, ועוד שני דברים.
   · tokens.css נקרא בבדיקות כטקסט (?raw), כדי שבדיקות הניגודיות יחשבו מקובץ הטוקנים עצמו.
   · עותקי עבודה ישנים תחת .claude/ אינם חלק מהפרויקט ולא נסרקים. */
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    css: { include: [/tokens\.css/] },
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
}))
