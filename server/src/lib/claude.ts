import Anthropic from '@anthropic-ai/sdk'

/* קליינט Anthropic — קורא את ANTHROPIC_API_KEY מהסביבה.
   timeout של 10 דקות ליצירות גדולות (streaming מאפס אותו בכל chunk, אך זהו הגבול הקשיח). */
export const claude = new Anthropic({ timeout: 600_000 })
