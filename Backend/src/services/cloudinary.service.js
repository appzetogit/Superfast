import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/env.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

import { processAndSaveImage } from './storage.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret
});

export const getOptimizedCloudinaryImageUrl = (url, { format = 'webp', quality = 'auto' } = {}) => {
    if (!url || typeof url !== 'string' || !url.includes('/image/upload/')) {
        return url;
    }

    if (url.includes(`/upload/f_${format},q_${quality}/`)) {
        return url;
    }

    return url.replace('/upload/', `/upload/f_${format},q_${quality}/`);
};

export const uploadImageBuffer = async (buffer, folder = 'uploads') => {
    return await processAndSaveImage(buffer, folder);
};

export const uploadImageBufferDetailed = async (buffer, folder = 'uploads') => {
    const url = await processAndSaveImage(buffer, folder);
    return { secure_url: url, url, public_id: url, format: 'webp' };
};

export const uploadBufferDetailed = async (
    buffer,
    { folder = 'uploads', resourceType = 'auto' } = {}
) => {
    const isRaw = resourceType !== 'image' && resourceType !== 'auto';
    const url = await processAndSaveImage(buffer, folder, isRaw);
    return { secure_url: url, url, public_id: url, format: isRaw ? 'bin' : 'webp' };
};
