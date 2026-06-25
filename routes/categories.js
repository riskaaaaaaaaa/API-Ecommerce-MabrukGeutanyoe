const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET semua kategori unik dari product_details
router.get('/', (req, res) => {
    const sql = `SELECT DISTINCT category FROM product_details WHERE category IS NOT NULL AND category != '' ORDER BY category`;
    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        const categories = results.map(row => row.category);
        res.json(categories);
    });
});

module.exports = router;