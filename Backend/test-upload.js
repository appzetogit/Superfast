import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { processAndSaveImage } from './src/services/storage.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testUpload() {
    // create a fake image buffer (just a 1x1 pixel webp)
    const buffer = Buffer.from('UklGRjIAAABXRUJQVlA4ICYAAACyAgCdASoBAAEALmk0mk0iIiIiIgBoSygABc6zbAAA/v56QAAAAA==', 'base64');
    
    try {
        const url = await processAndSaveImage(buffer, 'category');
        console.log('Upload successful. URL:', url);
        
        // check if file exists
        // url is something like http://localhost:5000/uploads/category/2026/07/uuid.webp
        const urlObj = new URL(url);
        const urlPath = urlObj.pathname; // /uploads/category/2026/07/uuid.webp
        const relPath = urlPath.replace('/uploads/', ''); // category/2026/07/uuid.webp
        
        const localPath = path.join(__dirname, 'uploads', relPath);
        console.log('Expected local path:', localPath);
        if (fs.existsSync(localPath)) {
            console.log('File EXISTS locally!');
        } else {
            console.log('File DOES NOT EXIST locally!');
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

testUpload();
