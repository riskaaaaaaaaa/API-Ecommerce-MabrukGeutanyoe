const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ================= KONFIGURASI UPLOAD GAMBAR =================
const uploadDir = 'uploads/reviews';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, 'review-' + uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    if (allowedMimeTypes.includes(file.mimetype) || allowedExt.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Hanya file gambar yang diperbolehkan (jpeg, jpg, png, gif, webp)'));
    }
};

const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: fileFilter });

// ================= ENDPOINT UPLOAD GAMBAR =================
router.post('/upload', upload.single('image'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Tidak ada file yang diupload' });
        res.json({ success: true, filename: req.file.filename, message: 'Gambar berhasil diupload' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal upload gambar' });
    }
});

// ================= CREATE REVIEW =================
router.post('/', async (req, res) => {
    const { user_id, product_id, order_id, rating, review, images, is_anonymous } = req.body;

    if (!user_id || !product_id || !order_id || !rating || !review) {
        return res.status(400).json({ success: false, message: 'Semua field wajib diisi' });
    }

    const checkSql = 'SELECT id FROM reviews WHERE order_id = ? AND product_id = ?';
    db.query(checkSql, [order_id, product_id], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        if (results.length > 0) return res.status(400).json({ success: false, message: 'Anda sudah memberikan ulasan untuk produk ini' });

        const imagesJson = images ? JSON.stringify(images) : '[]';
        const insertSql = `INSERT INTO reviews (user_id, product_id, order_id, rating, review, images, is_anonymous, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW())`;
        
        db.query(insertSql, [user_id, product_id, order_id, rating, review, imagesJson, is_anonymous ? 1 : 0], (err2, result) => {
            if (err2) return res.status(500).json({ success: false, message: 'Gagal menyimpan review' });
            updateProductRating(product_id);
            res.status(201).json({ success: true, message: 'Review berhasil disimpan', review_id: result.insertId });
        });
    });
});

function updateProductRating(productId) {
    const avgSql = `SELECT AVG(rating) as avg_rating, COUNT(*) as total FROM reviews WHERE product_id = ? AND status = 'active'`;
    db.query(avgSql, [productId], (err, results) => {
        if (err) return;
        const avgRating = results[0]?.avg_rating || 0;
        const totalReviews = results[0]?.total || 0;
        db.query(`UPDATE products SET rating = ?, total_reviews = ? WHERE id = ?`, [avgRating, totalReviews, productId]);
    });
}

// ================= GET REVIEWS BY PRODUCT =================
// ================= GET REVIEWS BY PRODUCT =================
router.get('/product/:product_id', (req, res) => {
    const { product_id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    console.log('Fetching reviews for product_id:', product_id); // Debug
    
    // Query dengan LEFT JOIN untuk memastikan semua review terambil
    const sql = `
        SELECT 
            r.*, 
            u.name as user_name, 
            u.photo as user_photo,
            CASE WHEN r.is_anonymous = 1 THEN 'Anonymous' ELSE u.name END as display_name,
            CASE WHEN r.is_anonymous = 1 THEN NULL ELSE u.photo END as display_photo
        FROM reviews r 
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.product_id = ? AND r.status = 'active'
        ORDER BY r.created_at DESC 
        LIMIT ? OFFSET ?
    `;

    db.query(sql, [product_id, parseInt(limit), offset], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, message: 'Database error: ' + err.message });
        }
        
        console.log('Found reviews:', results.length); // Debug
        
        // Parse images JSON
        const reviews = results.map(review => ({
            ...review,
            images: review.images ? (typeof review.images === 'string' ? JSON.parse(review.images) : review.images) : []
        }));
        
        // Get total count
        const countSql = 'SELECT COUNT(*) as total FROM reviews WHERE product_id = ? AND status = "active"';
        db.query(countSql, [product_id], (err2, countResult) => {
            if (err2) {
                console.error('Count error:', err2);
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            
            const total = countResult[0]?.total || 0;
            res.json({ 
                success: true, 
                reviews: reviews, 
                total: total,
                page: parseInt(page), 
                totalPages: Math.ceil(total / parseInt(limit))
            });
        });
    });
});

// ================= GET REVIEW SUMMARY =================
router.get('/summary/:product_id', (req, res) => {
    const sql = `SELECT COUNT(*) as total_reviews, AVG(rating) as average_rating,
        SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as rating_5,
        SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as rating_4,
        SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as rating_3,
        SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as rating_2,
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as rating_1
        FROM reviews WHERE product_id = ? AND status = 'active'`;
    db.query(sql, [req.params.product_id], (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, summary: results[0] });
    });
});

// ================= ADMIN: GET ALL REVIEWS =================
router.get('/admin', (req, res) => {
    const { page = 1, limit = 20, status, rating, search } = req.query;
    const offset = (page - 1) * limit;
    let whereConditions = [], params = [];
    
    if (status && status !== 'all') { whereConditions.push('r.status = ?'); params.push(status); }
    if (rating && rating !== 'all') { whereConditions.push('r.rating = ?'); params.push(parseInt(rating)); }
    if (search) { whereConditions.push('(p.name LIKE ? OR u.name LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    
    const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';
    const allParams = [...params];
    params.push(parseInt(limit), offset);
    
    const sql = `SELECT r.*, p.name as product_name, u.name as user_name, u.uid, r.is_anonymous,
        CASE WHEN r.is_anonymous = 1 THEN 'Anonymous' ELSE u.name END as display_name
        FROM reviews r LEFT JOIN products p ON r.product_id = p.id LEFT JOIN users u ON r.user_id = u.id
        ${whereClause} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;
    
    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        const reviews = results.map(review => {
            try { return { ...review, images: review.images ? JSON.parse(review.images) : [], is_anonymous: review.is_anonymous === 1, user_name: review.user_name || 'Pengguna' }; }
            catch(e) { return { ...review, images: [], is_anonymous: review.is_anonymous === 1, user_name: review.user_name || 'Pengguna' }; }
        });
        db.query(`SELECT COUNT(*) as total FROM reviews r LEFT JOIN products p ON r.product_id = p.id LEFT JOIN users u ON r.user_id = u.id ${whereClause}`, allParams, (err2, countResult) => {
            db.query(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status = 'hidden' THEN 1 ELSE 0 END) as hidden, CAST(COALESCE(AVG(rating), 0) AS DECIMAL(10,2)) as avg_rating FROM reviews`, (err3, statsResult) => {
                const stats = statsResult[0] || { total: 0, active: 0, hidden: 0, avg_rating: 0 };
                res.json({ success: true, reviews: reviews, total: countResult[0]?.total || 0, page: parseInt(page), totalPages: Math.ceil((countResult[0]?.total || 0) / limit), stats: { total: parseInt(stats.total) || 0, active: parseInt(stats.active) || 0, hidden: parseInt(stats.hidden) || 0, avg_rating: parseFloat(stats.avg_rating) || 0 } });
            });
        });
    });
});

// ================= CEK APAKAH SUDAH REVIEW =================
// LETAKKAN INI SEBELUM route /:id !!!
router.get('/check', (req, res) => {
    const { order_id, product_id } = req.query;
    
    if (!order_id || !product_id) {
        return res.status(400).json({ success: false, message: 'Order ID dan Product ID diperlukan' });
    }
    
    const sql = 'SELECT id, status, rating, review, images, is_anonymous, admin_reply, created_at FROM reviews WHERE order_id = ? AND product_id = ?';
    db.query(sql, [order_id, product_id], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        
        if (results.length > 0) {
            const review = results[0];
            res.json({ 
                success: true, 
                has_reviewed: true,
                review: {
                    id: review.id,
                    rating: review.rating,
                    review: review.review,
                    images: review.images ? JSON.parse(review.images) : [],
                    is_anonymous: review.is_anonymous === 1,
                    admin_reply: review.admin_reply,
                    created_at: review.created_at,
                    status: review.status
                }
            });
        } else {
            res.json({ success: true, has_reviewed: false });
        }
    });
});

// ================= GET REVIEW BY ID =================
router.get('/:id', (req, res) => {
    const sql = `SELECT r.*, p.name as product_name, u.name as user_name, CASE WHEN r.is_anonymous = 1 THEN 'Anonymous' ELSE u.name END as display_name
        FROM reviews r LEFT JOIN products p ON r.product_id = p.id LEFT JOIN users u ON r.user_id = u.id WHERE r.id = ?`;
    db.query(sql, [req.params.id], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ success: false, message: 'Review tidak ditemukan' });
        const review = { ...results[0], images: results[0].images ? JSON.parse(results[0].images) : [], is_anonymous: results[0].is_anonymous === 1 };
        res.json({ success: true, review });
    });
});

// ================= GET REVIEW BY ID =================
router.get('/:id', (req, res) => {
    const sql = `SELECT r.*, p.name as product_name, u.name as user_name, CASE WHEN r.is_anonymous = 1 THEN 'Anonymous' ELSE u.name END as display_name
        FROM reviews r LEFT JOIN products p ON r.product_id = p.id LEFT JOIN users u ON r.user_id = u.id WHERE r.id = ?`;
    db.query(sql, [req.params.id], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ success: false, message: 'Review tidak ditemukan' });
        const review = { ...results[0], images: results[0].images ? JSON.parse(results[0].images) : [], is_anonymous: results[0].is_anonymous === 1 };
        res.json({ success: true, review });
    });
});

// ================= ADMIN: CHANGE REVIEW STATUS =================
router.put('/:id/status', (req, res) => {
    const { status } = req.body;
    if (!['active', 'hidden', 'reported'].includes(status)) return res.status(400).json({ success: false, message: 'Status tidak valid' });
    db.query('UPDATE reviews SET status = ? WHERE id = ?', [status, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Review tidak ditemukan' });
        db.query('SELECT product_id FROM reviews WHERE id = ?', [req.params.id], (err2, reviewResult) => {
            if (!err2 && reviewResult.length > 0) updateProductRating(reviewResult[0].product_id);
        });
        res.json({ success: true, message: 'Status berhasil diubah' });
    });
});

// ================= ADMIN: ADD REPLY TO REVIEW =================
router.post('/:id/reply', (req, res) => {
    const { reply } = req.body;
    if (!reply || reply.trim() === '') return res.status(400).json({ success: false, message: 'Balasan tidak boleh kosong' });
    db.query('UPDATE reviews SET admin_reply = ?, replied_at = NOW() WHERE id = ?', [reply, req.params.id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Review tidak ditemukan' });
        res.json({ success: true, message: 'Balasan berhasil dikirim' });
    });
});


module.exports = router;