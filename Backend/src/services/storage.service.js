import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env.js';

// Image processing configurations based on folder category
const IMAGE_CONFIGS = {
    banners: { width: 1200, height: null, fit: 'inside' },
    menu: { width: 800, height: 800, fit: 'cover' },
    restaurants: { width: 800, height: 800, fit: 'cover' },
    users: { width: 400, height: 400, fit: 'cover' },
    logos: { width: 400, height: 400, fit: 'contain' },
    default: { width: 1000, height: null, fit: 'inside' }
};

/**
 * Ensures a directory exists
 */
const ensureDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

/**
 * Process and save an image buffer to VPS storage
 * @param {Buffer} buffer - The image buffer from Multer
 * @param {string} folder - The target folder (e.g., 'menu', 'banners')
 * @param {boolean} isRaw - If true, skips sharp processing and saves raw buffer
 * @returns {Promise<string>} The public URL of the saved image
 */
export const processAndSaveImage = async (buffer, folder = 'misc', isRaw = false) => {
    if (!buffer) throw new Error('File buffer is required');

    // Determine processing options
    const options = IMAGE_CONFIGS[folder] || IMAGE_CONFIGS.default;

    // Build the folder structure: /var/storage/{folder}/{YYYY}/{MM}
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    // Fallback logic for when config.vpsStoragePath is not defined or local
    const baseStorageDir = config.vpsStoragePath; 
    
    const relativeDir = path.join(folder, year, month);
    const targetDir = path.join(baseStorageDir, relativeDir);
    ensureDir(targetDir);

    // Generate unique filename
    const filename = `${uuidv4()}.webp`;
    const filePath = path.join(targetDir, filename);

    // Process image with Sharp or save raw
    if (isRaw) {
        fs.writeFileSync(filePath, buffer);
    } else {
        let sharpInstance = sharp(buffer);
        
        // Only resize if a dimension is provided
        if (options.width || options.height) {
            sharpInstance = sharpInstance.resize({
                width: options.width,
                height: options.height,
                fit: options.fit || 'inside',
                withoutEnlargement: true // Don't upscale small images
            });
        }

        // Convert to webp and save
        await sharpInstance
            .webp({ quality: 80, effort: 6 })
            .toFile(filePath);
    }

    // Return the URL: https://api.domain.com/images/folder/YYYY/MM/filename.webp
    const relativeUrl = `${folder}/${year}/${month}/${filename}`.replace(/\\/g, '/');
    return `${config.vpsImageUrl}/${relativeUrl}`;
};

/**
 * Delete an image from VPS storage given its URL
 * @param {string} url - The public URL of the image
 */
export const deleteImage = async (url) => {
    if (!url || typeof url !== 'string' || !url.startsWith(config.vpsImageUrl)) {
        return false;
    }

    try {
        const relativeUrl = url.replace(`${config.vpsImageUrl}/`, '');
        const filePath = path.join(config.vpsStoragePath, relativeUrl);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
    } catch (err) {
        console.error(`Failed to delete image: ${url}`, err);
    }
    return false;
};
