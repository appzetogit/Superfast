import express from 'express';
import { upload } from '../../../middleware/upload.js';
import { processAndSaveImage } from '../../../services/storage.service.js';

const router = express.Router();

// POST /v1/uploads/image
router.post('/image', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({
                success: false,
                message: 'No file provided'
            });
        }

        const folder = typeof req.body?.folder === 'string' && req.body.folder.trim()
            ? req.body.folder.trim()
            : 'uploads';

        const url = await processAndSaveImage(req.file.buffer, folder);
        res.status(200).json({
            success: true,
            data: { url }
        });
    } catch (error) {
        next(error);
    }
});

// GET /v1/uploads/migrate-cloudinary
router.get('/migrate-cloudinary', async (req, res, next) => {
    try {
        const mongoose = (await import('mongoose')).default;
        const db = mongoose.connection.db;
        const collections = await db.listCollections({}, { nameOnly: true }).toArray();
        const targetCollections = collections.map(c => c.name).filter(n => !n.startsWith('system.'));
        
        let totalUpdated = 0;
        const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
        
        const getLocalUrl = (url) => {
            const idx = url.indexOf('/upload/');
            if (idx === -1) return url;
            const rel = url.substring(idx + 8);
            const segments = rel.split('/').filter(s => !s.match(/^[a-z]_[^/]+$/) && !s.match(/^v\d+$/));
            return `${backendUrl}/uploads/${segments.join('/')}`;
        };

        const collectUpdates = (val, path = '') => {
            const updates = [];
            if (typeof val === 'string' && val.includes('/res.cloudinary.com/') && val.includes('/image/upload/')) {
                updates.push({ path, to: getLocalUrl(val) });
            } else if (Array.isArray(val)) {
                val.forEach((item, i) => updates.push(...collectUpdates(item, path ? `${path}.${i}` : String(i))));
            } else if (val && typeof val === 'object' && !(val instanceof Date) && !(val instanceof mongoose.Types.ObjectId)) {
                Object.entries(val).forEach(([k, v]) => {
                    if (k !== '_id') updates.push(...collectUpdates(v, path ? `${path}.${k}` : k));
                });
            }
            return updates;
        };

        for (const colName of targetCollections) {
            const cursor = db.collection(colName).find({});
            while (await cursor.hasNext()) {
                const doc = await cursor.next();
                const updates = collectUpdates(doc).filter(u => u.path);
                if (updates.length > 0) {
                    const setPayload = Object.fromEntries(updates.map(u => [u.path, u.to]));
                    await db.collection(colName).updateOne({ _id: doc._id }, { $set: setPayload });
                    totalUpdated += updates.length;
                }
            }
        }
        
        res.json({ success: true, message: `Migrated ${totalUpdated} fields` });
    } catch (error) {
        next(error);
    }
});

export default router;
