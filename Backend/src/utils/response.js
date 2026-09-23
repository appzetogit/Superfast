import { transformImageFields } from './urlHelper.js';

export const sendResponse = (res, statusCode, message, data = null) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data: transformImageFields(data)
    });
};

export const sendError = (res, statusCode, message) => {
    return res.status(statusCode).json({
        success: false,
        message
    });
};

