import { FoodLandingCategory } from '../models/landingCategory.model.js';
import { FoodCategory } from '../../admin/models/category.model.js';
import { deleteImage, processAndSaveImage } from '../../../../services/storage.service.js';
import { getDeveloperModeFilter } from '../../../common/utils/developerMode.js';
import mongoose from 'mongoose';

const STORAGE_FOLDER = 'food/categories';

/**
 * List all landing categories (admin). Sorted by sortOrder.
 */
export const listLandingCategories = async () => {
    const list = await FoodLandingCategory.find()
        .sort({ sortOrder: 1, createdAt: -1 })
        .lean();
    return list.map(item => ({
        ...item,
        order: item.sortOrder ?? 0
    }));
};

/**
 * List active landing categories for public user app.
 */
export const listPublicLandingCategories = async () => {
    const devFilter = await getDeveloperModeFilter();

    if (devFilter.isDevMode && Array.isArray(devFilter.demoLandingCategoryIds) && devFilter.demoLandingCategoryIds.length > 0) {
        const catObjIds = devFilter.demoLandingCategoryIds
            .map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : null)
            .filter(Boolean);

        if (catObjIds.length > 0) {
            const [landingList, mainList] = await Promise.all([
                FoodLandingCategory.find({ _id: { $in: catObjIds }, isActive: true }).lean(),
                FoodCategory.find({ _id: { $in: catObjIds }, isActive: true }).lean()
            ]);

            const landingFormatted = landingList.map(item => ({
                id: item._id,
                name: item.label,
                slug: item.label.toLowerCase().replace(/\s+/g, '-'),
                image: item.imageUrl,
                order: item.sortOrder ?? 0
            }));

            const mainFormatted = mainList.map(item => ({
                id: item._id,
                name: item.name,
                slug: (item.name || '').toLowerCase().replace(/\s+/g, '-'),
                image: item.image,
                order: item.sortOrder ?? 0
            }));

            const combinedMap = new Map();
            landingFormatted.forEach(c => combinedMap.set(String(c.id), c));
            mainFormatted.forEach(c => {
                if (!combinedMap.has(String(c.id))) {
                    combinedMap.set(String(c.id), c);
                }
            });

            return Array.from(combinedMap.values());
        }
    }

    const list = await FoodLandingCategory.find({ isActive: true })
        .sort({ sortOrder: 1, createdAt: -1 })
        .lean();
    return list.map(item => ({
        id: item._id,
        name: item.label,
        slug: item.label.toLowerCase().replace(/\s+/g, '-'),
        image: item.imageUrl,
        order: item.sortOrder ?? 0
    }));
};

const getNextSortOrder = async () => {
    const last = await FoodLandingCategory.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();
    return (last?.sortOrder ?? -1) + 1;
};

const uploadCategoryImage = async (buffer) => {
    const url = await processAndSaveImage(buffer, STORAGE_FOLDER);
    return { secure_url: url, public_id: url };
};

export const createLandingCategory = async (file, meta) => {
    if (!file?.buffer) {
        throw new Error('Image file is required');
    }
    const label = (meta?.label || '').trim();
    if (!label) {
        throw new Error('Label is required');
    }

    const { secure_url, public_id } = await uploadCategoryImage(file.buffer);
    const sortOrder = await getNextSortOrder();

    const doc = await FoodLandingCategory.create({
        label,
        imageUrl: secure_url,
        publicId: public_id,
        sortOrder,
        isActive: true
    });

    const obj = doc.toObject();
    return { ...obj, order: obj.sortOrder ?? 0 };
};

export const deleteLandingCategory = async (id) => {
    const doc = await FoodLandingCategory.findById(id);
    if (!doc) {
        return { deleted: false };
    }
    if (doc.publicId) {
        try {
            await deleteImage(doc.publicId);
        } catch {
            // ignore
        }
    }
    await doc.deleteOne();
    return { deleted: true };
};

export const toggleLandingCategoryStatus = async (id) => {
    const doc = await FoodLandingCategory.findById(id);
    if (!doc) return null;
    const isActive = !doc.isActive;
    const updated = await FoodLandingCategory.findByIdAndUpdate(id, { isActive }, { new: true }).lean();
    return { ...updated, order: updated.sortOrder ?? 0 };
};

export const updateLandingCategoryOrder = async (id, order) => {
    const num = Number(order);
    if (Number.isNaN(num)) return null;
    const updated = await FoodLandingCategory.findByIdAndUpdate(id, { sortOrder: num }, { new: true }).lean();
    return { ...updated, order: updated.sortOrder ?? 0 };
};
