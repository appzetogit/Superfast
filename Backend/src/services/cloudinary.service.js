import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/env.js';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

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

// Helper to save buffer to local disk
const saveBufferToDisk = async (buffer, folder, extension) => {
    if (!buffer) throw new Error('File buffer is required');
    
    // Ensure the folder exists
    const targetDir = path.join(UPLOADS_DIR, folder);
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    // Generate a unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = `${uniqueSuffix}.${extension}`;
    const filePath = path.join(targetDir, filename);

    // Save file
    fs.writeFileSync(filePath, buffer);

    // Return the local URL
    const relativeUrl = `/uploads/${folder}/${filename}`.replace(/\\/g, '/');
    return `${config.backendUrl}${relativeUrl}`;
};

export const uploadImageBuffer = async (buffer, folder = 'uploads') => {
    return await saveBufferToDisk(buffer, folder, 'webp');
};

export const uploadImageBufferDetailed = async (buffer, folder = 'uploads') => {
    const url = await saveBufferToDisk(buffer, folder, 'webp');
    return { secure_url: url, url, format: 'webp' };
};

export const uploadBufferDetailed = async (
    buffer,
    { folder = 'uploads', resourceType = 'auto' } = {}
) => {
    const extension = resourceType === 'image' ? 'webp' : 'bin';
    const url = await saveBufferToDisk(buffer, folder, extension);
    return { secure_url: url, url, format: extension };
};
