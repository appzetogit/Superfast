import { sendResponse } from '../../../../utils/response.js';
import { validateUserProfileUpdateDto } from '../../../../dtos/food/userProfileUpdate.dto.js';
import {
    getCurrentUserProfile,
    updateCurrentUserProfile,
    uploadCurrentUserProfileImage
} from '../services/userProfile.service.js';
import { transformImageFields } from '../../../../utils/urlHelper.js';

export const getCurrentUserProfileController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const result = await getCurrentUserProfile(userId);
        return sendResponse(res, 200, 'Profile retrieved successfully', transformImageFields(result));
    } catch (error) {
        next(error);
    }
};

export const updateCurrentUserProfileController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const body = validateUserProfileUpdateDto(req.body);
        const result = await updateCurrentUserProfile(userId, body);
        return sendResponse(res, 200, 'Profile updated successfully', transformImageFields(result));
    } catch (error) {
        next(error);
    }
};

export const uploadCurrentUserProfileImageController = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        const result = await uploadCurrentUserProfileImage(userId, req.file);
        return sendResponse(res, 200, 'Profile image uploaded successfully', transformImageFields(result));
    } catch (error) {
        next(error);
    }
};


