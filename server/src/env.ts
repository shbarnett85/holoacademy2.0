import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

/* טעינת .env של השרת לפי מיקום הקובץ — לא תלוי בתיקיית העבודה.
   מיובא ראשון ב-index.ts כדי לרוץ לפני כל מודול שקורא process.env */
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })
