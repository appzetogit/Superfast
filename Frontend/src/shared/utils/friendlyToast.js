import { toast } from 'sonner'

// Technical wording that must never reach end users (server/dev details).
const TECHNICAL_PATTERN =
  /backend|back-end|server is running|cannot connect to (the )?(server|backend)|network error|err_network|econnaborted|econnrefused|failed to fetch|localhost|127\.0\.0\.1|npm run|endpoint not found|no response from server/i

const FRIENDLY_MESSAGE = 'Something went wrong on our side. Please try again in a moment.'
const FRIENDLY_ID = 'friendly-connection-error'

let installed = false

/**
 * Wraps toast.error so server/connection jargon is replaced with a calm,
 * user-friendly message. The original text is still logged for developers.
 * Uses a fixed id so repeated failures show a single toast instead of a stack.
 */
export function installFriendlyToast() {
  if (installed) return
  installed = true

  const originalError = toast.error.bind(toast)

  toast.error = (message, data) => {
    if (typeof message === 'string' && TECHNICAL_PATTERN.test(message)) {
      console.warn('[toast suppressed]', message)
      return originalError(FRIENDLY_MESSAGE, { ...data, id: FRIENDLY_ID })
    }
    return originalError(message, data)
  }
}
