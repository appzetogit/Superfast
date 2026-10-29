/**
 * Turns any API/network failure into a message that is safe to show a customer.
 * Server-side failures (5xx, no response, timeouts) never expose status codes or backend text.
 * 4xx messages written for users by the backend (validation, "invalid OTP", ...) are kept.
 */

export const SERVER_BUSY_MESSAGE = "We're facing heavy traffic right now. Please try again in a few seconds."
export const NETWORK_MESSAGE = "Couldn't reach our servers. Please check your internet connection and try again."
export const GENERIC_MESSAGE = "Something went wrong. Please try again."

// Anything that looks like a code/stack/axios message rather than text written for a person.
const TECHNICAL_PATTERN = /status code|axios|ECONN|ENOTFOUND|ETIMEDOUT|Network Error|timeout of|<html|\bat \S+\.js|TypeError|ReferenceError|Cast to|E11000|MongoServerError|undefined|\bnull\b is not/i

export function isServerFailure(err) {
  if (!err) return false
  if (err.code === 'ERR_CANCELED') return false
  const status = err.response?.status
  return !err.response || status >= 500
}

export function getFriendlyErrorMessage(err, fallback = GENERIC_MESSAGE) {
  if (!err) return fallback
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return SERVER_BUSY_MESSAGE

  const status = err.response?.status
  if (!err.response) {
    return typeof navigator !== 'undefined' && navigator.onLine === false ? NETWORK_MESSAGE : SERVER_BUSY_MESSAGE
  }
  if (status >= 500) return SERVER_BUSY_MESSAGE
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.'

  const serverText = err.response?.data?.message || err.response?.data?.error
  if (typeof serverText === 'string' && serverText.trim() && !TECHNICAL_PATTERN.test(serverText)) {
    return serverText
  }
  return fallback
}

/**
 * Called from the axios response interceptor so every existing
 * `err.response.data.message || err.message` in the app shows a friendly text.
 */
export function sanitizeApiError(err) {
  if (!err || err.code === 'ERR_CANCELED') return err
  const friendly = getFriendlyErrorMessage(err, err.response ? GENERIC_MESSAGE : SERVER_BUSY_MESSAGE)
  err.userMessage = friendly
  if (isServerFailure(err) || TECHNICAL_PATTERN.test(String(err.message || ''))) {
    err.message = friendly
  }
  if (err.response?.data && typeof err.response.data === 'object' && isServerFailure(err)) {
    err.response.data.message = friendly
    if ('error' in err.response.data) err.response.data.error = friendly
  }
  return err
}
