import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

/**
 * Category A — Authentication Rate Limiter
 * Dedicated rate limiter for authentication routes (login, register, OTP, password reset).
 * Uses AUTH_RATE_LIMIT_WINDOW and AUTH_RATE_LIMIT_MAX.
 */
const authWindowMs = (config.authRateLimitWindowMinutes || 15) * 60 * 1000;

export const authRateLimiter = rateLimit({
    windowMs: authWindowMs,
    max: config.authRateLimitMaxRequests || 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !config.rateLimitEnabled,
    handler: (req, res) => {
        const timestamp = new Date().toISOString();
        const clientIp = req.ip || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown-ip';
        const userAgent = req.get('user-agent') || 'unknown-agent';
        console.warn(`[${timestamp}] [RATE LIMIT BLOCKED] Auth Route | IP: ${clientIp} | Route: ${req.originalUrl} | Method: ${req.method} | UserAgent: ${userAgent}`);
        res.status(429).json({
            success: false,
            message: 'Too many requests. Please try again later.'
        });
    }
});

/**
 * Category C — Private Rate Limiter
 * Applied after authentication middleware.
 * Uses RATE_LIMIT_WINDOW and (RATE_LIMIT_DEV_MAX in dev, RATE_LIMIT_MAX in prod).
 * Rate limit key generator: <User_ID>:<Real_Client_IP>
 */
const privateWindowMs = (config.rateLimitWindowMinutes || 15) * 60 * 1000;
const privateMaxRequests = config.nodeEnv === 'development'
    ? (config.rateLimitDevMaxRequests || 2000)
    : (config.rateLimitMaxRequests || 3500);

export const privateRateLimiter = rateLimit({
    windowMs: privateWindowMs,
    max: privateMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => !config.rateLimitEnabled,
    keyGenerator: (req) => {
        const userId = req.user?.id || req.user?._id || req.userId || req.user?.userId || 'anonymous';
        const clientIp = req.ip || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown-ip';
        return `${userId}:${clientIp}`;
    },
    handler: (req, res) => {
        const timestamp = new Date().toISOString();
        const userId = req.user?.id || req.user?._id || req.userId || req.user?.userId || 'anonymous';
        const clientIp = req.ip || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown-ip';
        const userAgent = req.get('user-agent') || 'unknown-agent';
        console.warn(`[${timestamp}] [RATE LIMIT BLOCKED] Private Route | IP: ${clientIp} | User: ${userId} | Route: ${req.originalUrl} | Method: ${req.method} | UserAgent: ${userAgent}`);
        res.status(429).json({
            success: false,
            message: 'Too many requests. Please try again later.'
        });
    }
});

// Backward compatibility alias for apiRateLimiter
export const apiRateLimiter = privateRateLimiter;
