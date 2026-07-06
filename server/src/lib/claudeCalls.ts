import { claude } from './claude.js'
import { AppError } from '../middleware/errors.js'
import { info } from './log.js'

export async function callClaude(messages: { role: 'user' | 'assistant'; content: string }[], cachedSystem?: string) {
  /* streaming מונע timeout של ה-SDK בפלטים ארוכים. effort=low. cachedSystem (אם סופק) —
     בלוק קבוע שנשלח כ-system עם cache_control:ephemeral; נחסך מעיבוד חוזר בקריאות
     עוקבות תוך 5 דקות (retry, יצירות רצופות, ובמיוחד ייצוא וריאציות פר-תלמיד). */
  const response = await claude.messages
    .stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 32000,
      output_config: { effort: 'low' },
      ...(cachedSystem ? { system: [{ type: 'text' as const, text: cachedSystem, cache_control: { type: 'ephemeral' as const } }] } : {}),
      messages,
    })
    .finalMessage()
  const u = response.usage as { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number }
  info(`[tokens] sonnet: in=${u.input_tokens} out=${u.output_tokens} cacheWrite=${u.cache_creation_input_tokens ?? 0} cacheRead=${u.cache_read_input_tokens ?? 0}`)
  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new AppError(502, 'תשובה ריקה מ-Claude')
  }
  return textBlock.text
}

/* קריאת haiku מהירה (לא-streaming) — לבדיקת עובדות, תיקון ממוקד, ובדיקת בטיחות תוכן.
   system אופציונלי — מפריד לגמרי הנחיות עם מטרה שונה (כמו בטיחות) מהודעת ה-user. */
export async function callHaiku(messages: { role: 'user' | 'assistant'; content: string }[], maxTokens: number, system?: string): Promise<string> {
  const response = await claude.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: maxTokens,
    ...(system ? { system } : {}),
    messages,
  })
  const u = response.usage
  info(`[tokens] haiku: in=${u.input_tokens} out=${u.output_tokens}`)
  const block = response.content.find((b) => b.type === 'text')
  return block && block.type === 'text' ? block.text : ''
}
