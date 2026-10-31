import { ValidationError } from '../../../core/auth/errors.js';

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const SERVICE_TIMEZONE = 'Asia/Kolkata';

/** Normalizes "7:5"/"07:05" style input to "HH:mm". Empty input means "no limit" and returns ''. */
export const normalizeAvailabilityTime = (value, label = 'time') => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const match = TIME_RE.exec(raw);
    if (!match) throw new ValidationError(`Invalid ${label}. Use HH:mm (24-hour)`);
    return `${match[1].padStart(2, '0')}:${match[2]}`;
};

/**
 * Validates a from/to pair from a request body. Both must be set together (or both empty).
 * Returns only the keys present in the body so partial updates do not wipe the other value.
 */
export const readAvailabilityWindow = (body = {}) => {
    const hasFrom = body.availableFrom !== undefined;
    const hasTo = body.availableTo !== undefined;
    if (!hasFrom && !hasTo) return null;
    const availableFrom = hasFrom ? normalizeAvailabilityTime(body.availableFrom, 'start time') : undefined;
    const availableTo = hasTo ? normalizeAvailabilityTime(body.availableTo, 'end time') : undefined;
    if (hasFrom && hasTo && Boolean(availableFrom) !== Boolean(availableTo)) {
        throw new ValidationError('Set both start time and end time, or leave both empty');
    }
    const out = {};
    if (hasFrom) out.availableFrom = availableFrom;
    if (hasTo) out.availableTo = availableTo;
    return out;
};

/** "17:30" -> "5:30 PM" */
export const formatAvailabilityTime12h = (hhmm) => {
    const match = TIME_RE.exec(String(hhmm || ''));
    if (!match) return '';
    const h = Number(match[1]);
    return `${h % 12 === 0 ? 12 : h % 12}:${match[2]} ${h < 12 ? 'AM' : 'PM'}`;
};

const toMinutes =(hhmm) => {
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
};

const nowMinutesInServiceZone = (now = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: SERVICE_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    return hour * 60 + minute;
};

/** True when the item has no window, or the current time falls inside it (overnight windows supported). */
export const isWithinAvailabilityWindow = (availableFrom, availableTo, now = new Date()) => {
    if (!TIME_RE.test(String(availableFrom || '')) || !TIME_RE.test(String(availableTo || ''))) return true;
    const from = toMinutes(availableFrom);
    const to = toMinutes(availableTo);
    if (from === to) return true;
    const current = nowMinutesInServiceZone(now);
    return from < to ? current >= from && current < to : current >= from || current < to;
};
