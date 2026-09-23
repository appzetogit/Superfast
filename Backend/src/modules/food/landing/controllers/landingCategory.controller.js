import {
    listLandingCategories,
    listPublicLandingCategories,
    createLandingCategory,
    deleteLandingCategory,
    toggleLandingCategoryStatus,
    updateLandingCategoryOrder
} from '../services/landingCategory.service.js';

export const listLandingCategoriesController = async (req, res, next) => {
    try {
        const categories = await listLandingCategories();
        return res.json({
            success: true,
            data: { categories }
        });
    } catch (err) {
        next(err);
    }
};

export const listPublicLandingCategoriesController = async (req, res, next) => {
    try {
        const categories = await listPublicLandingCategories();
        return res.json({
            success: true,
            data: { categories }
        });
    } catch (err) {
        next(err);
    }
};

export const createLandingCategoryController = async (req, res, next) => {
    try {
        const file = req.file;
        const { label } = req.body || {};
        const created = await createLandingCategory(file, { label });
        return res.status(201).json({
            success: true,
            data: created
        });
    } catch (err) {
        if (err.message === 'Image file is required' || err.message === 'Label is required') {
            return res.status(400).json({ success: false, message: err.message });
        }
        next(err);
    }
};

export const deleteLandingCategoryController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await deleteLandingCategory(id);
        if (!result.deleted) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        return res.json({ success: true, message: 'Category deleted' });
    } catch (err) {
        next(err);
    }
};

export const toggleLandingCategoryStatusController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updated = await toggleLandingCategoryStatus(id);
        if (!updated) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        return res.json({ success: true, data: updated });
    } catch (err) {
        next(err);
    }
};

export const updateLandingCategoryOrderController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { order } = req.body || {};
        const updated = await updateLandingCategoryOrder(id, order);
        if (!updated) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        return res.json({ success: true, data: updated });
    } catch (err) {
        next(err);
    }
};
