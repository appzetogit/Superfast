import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const rawMessage = err.message || 'Server Error';
    const requestId = req.requestId || '-';

    logger.error(
        `[${requestId}] ${req.method} ${req.originalUrl} ${statusCode} - ${err.name || 'Error'} - ${rawMessage}`
    );
    if (err.stack && (config.nodeEnv === 'development' || statusCode >= 500)) {
        logger.error(`[${requestId}] ${err.stack}`);
    }

    // 5xx are our fault: log the real reason, but never send DB/code internals to the client.
    const message = statusCode >= 500 && config.nodeEnv === 'production'
        ? 'Something went wrong on our side. Please try again in a moment.'
        : rawMessage;

    res.status(statusCode).json({
        success: false,
        error: message,
        message,
        requestId
    });
};

export default errorHandler;
