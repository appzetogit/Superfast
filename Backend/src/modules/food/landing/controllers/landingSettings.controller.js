import {
    deleteLandingHeaderVideo,
    getLandingSettings,
    updateLandingSettings,
    uploadLandingHeaderVideo
} from '../services/landingSettings.service.js';
import { invalidateLandingSettingsCache } from './publicLanding.controller.js';
import { sendResponse } from '../../../../utils/response.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { transformImageFields } from '../../../../utils/urlHelper.js';

export const getAdminLandingSettingsController = async (req, res, next) => {
    try {
        const settings = await getLandingSettings();
        return sendResponse(res, 200, 'Landing settings fetched successfully', { settings: transformImageFields(settings) });
    } catch (error) {
        next(error);
    }
};

export const updateAdminLandingSettingsController = async (req, res, next) => {
    try {
        const payload = req.body || {};
        if (typeof payload !== 'object') {
            throw new ValidationError('Invalid settings payload');
        }
        const updated = await updateLandingSettings(payload);
        invalidateLandingSettingsCache();
        return sendResponse(res, 200, 'Landing settings updated successfully', { settings: transformImageFields(updated) });
    } catch (error) {
        next(error);
    }
};

export const uploadAdminLandingHeaderVideoController = async (req, res, next) => {
    try {
        const updated = await uploadLandingHeaderVideo(req.file);
        invalidateLandingSettingsCache();
        return sendResponse(res, 200, 'Landing header video uploaded successfully', { settings: transformImageFields(updated) });
    } catch (error) {
        next(error);
    }
};

export const deleteAdminLandingHeaderVideoController = async (req, res, next) => {
    try {
        const updated = await deleteLandingHeaderVideo();
        invalidateLandingSettingsCache();
        return sendResponse(res, 200, 'Landing header video removed successfully', { settings: transformImageFields(updated) });
    } catch (error) {
        next(error);
    }
};


