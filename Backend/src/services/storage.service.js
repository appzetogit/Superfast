import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { config } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolves the root upload directory:
 * - Production VPS: /var/www/upload (or process.env.UPLOAD_DIR / VPS_STORAGE_PATH)
 * - Local development: backend/upload
 */
export const getUploadDir = () => {
    if (process.env.UPLOAD_DIR) return process.env.UPLOAD_DIR;
    if (process.env.VPS_STORAGE_PATH && path.isAbsolute(process.env.VPS_STORAGE_PATH)) {
        return process.env.VPS_STORAGE_PATH;
    }
    if (process.env.NODE_ENV === 'production') {
        return '/var/www/upload';
    }
    if (fs.existsSync('/var/www/upload')) {
        return '/var/www/upload';
    }
    return path.join(process.cwd(), 'upload');
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
 * Process and save an image buffer to storage.
 * ALL images are saved directly in the root upload folder without subdirectories.
 *
 * @param {Buffer} buffer - The image buffer from Multer
 * @param {string} _folder - Ignored to enforce single flat upload folder
 * @param {boolean} isRaw - If true, skips sharp processing and saves raw buffer
 * @returns {Promise<string>} The public relative URL of the saved image (e.g. 'upload/filename.webp')
 */
export const processAndSaveImage = async (buffer, _folder = 'misc', isRaw = false) => {
    if (!buffer) throw new Error('File buffer is required');

    const targetDir = getUploadDir();
    ensureDir(targetDir);

    // Save directly inside targetDir with NO subdirectories
    const filename = `${uuidv4()}.webp`;
    const filePath = path.join(targetDir, filename);

    if (isRaw) {
        fs.writeFileSync(filePath, buffer);
    } else {
        await sharp(buffer)
            .resize({
                width: 1200,
                height: 1200,
                fit: 'inside',
                withoutEnlargement: true
            })
            .webp({ quality: 80, effort: 6 })
            .toFile(filePath);
    }

    return `upload/${filename}`;
};

/**
 * Delete an image given its relative path or public URL
 * @param {string} url - The relative path or public URL of the image
 */
export const deleteImage = async (url) => {
    if (!url || typeof url !== 'string') {
        return false;
    }

    try {
        let cleaned = url.trim();
        const filename = path.basename(cleaned);
        const targetDir = getUploadDir();

        const filePath = path.join(targetDir, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }

        const fallbackPath = path.join(process.cwd(), 'upload', filename);
        if (fs.existsSync(fallbackPath)) {
            fs.unlinkSync(fallbackPath);
            return true;
        }
    } catch (err) {
        console.error(`Failed to delete image: ${url}`, err);
    }
    return false;
};
