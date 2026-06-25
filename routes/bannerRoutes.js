const express = require('express');
const router = express.Router();

const multer = require('multer');

const bannerController =
    require('../controllers/bannerController');

// STORAGE
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/banner');
    },

    filename: (req, file, cb) => {
        cb(
            null,
            Date.now() + '-' + file.originalname
        );
    }
});

const upload = multer({
    storage: storage
});

// ROUTES
router.get('/', bannerController.getBanners);

router.post(
    '/',
    upload.single('image'),
    bannerController.addBanner
);

router.delete('/:id', bannerController.deleteBanner);

module.exports = router;