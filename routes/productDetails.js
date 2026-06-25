const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/product_details';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

function parseSpecifications(data) {
    try {
        if (!data) return [];
        if (typeof data === 'string') return JSON.parse(data);
        return data;
    } catch (e) {
        return [];
    }
}

function parseSizes(sizes) {
    if (!sizes) return [];
    return sizes.split(',').map(s => s.trim()).filter(Boolean);
}

function buildProductDetail(row) {
    return {
        id: row.detail_id || null,
        product_id: row.product_id,
        name: row.name || '',
        price: row.price || 0,
        old_price: row.old_price || 0,
        rating: row.rating || 0,
        sold: row.sold || 0,
        description: row.description || '',
        material: row.material || '',
        brand: row.brand || '',
        category: row.category || '',
        stock: row.stock || 0,
        weight: row.weight || 0,
        shipping_info: row.shipping_info || '',
        specifications: parseSpecifications(row.specifications),
        sizes: parseSizes(row.sizes),
        images: [
            row.image1, row.image2, row.image3, row.image4
        ].filter(Boolean)
    };
}

// GET ALL
router.get('/', (req, res) => {
    const sql = `
        SELECT 
            p.id AS product_id,
            p.name,
            p.price,
            p.old_price,
            p.rating,
            p.sold,
            pd.id AS detail_id,
            pd.description,
            pd.material,
            pd.brand,
            pd.category,
            pd.stock,
            pd.weight,
            pd.sizes,
            pd.shipping_info,
            pd.specifications,
            pd.image1,
            pd.image2,
            pd.image3,
            pd.image4
        FROM products p
        LEFT JOIN product_details pd ON p.id = pd.product_id
        ORDER BY p.id DESC
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Gagal mengambil data' });
        }
        const data = results.map(row => buildProductDetail(row));
        res.json(data);
    });
});

// GET DETAIL by product_id
router.get('/:product_id', (req, res) => {
    const product_id = req.params.product_id;
    const sql = `
        SELECT 
            p.id AS product_id,
            p.name,
            p.price,
            p.old_price,
            p.rating,
            p.sold,
            pd.id AS detail_id,
            pd.description,
            pd.material,
            pd.brand,
            pd.category,
            pd.stock,
            pd.weight,
            pd.sizes,
            pd.shipping_info,
            pd.specifications,
            pd.image1,
            pd.image2,
            pd.image3,
            pd.image4
        FROM products p
        LEFT JOIN product_details pd ON p.id = pd.product_id
        WHERE p.id = ?
        LIMIT 1
    `;
    db.query(sql, [product_id], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Gagal mengambil detail produk' });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
        }
        const data = buildProductDetail(results[0]);
        res.json({ success: true, data });
    });
});

// POST - Create detail (hanya untuk tambah baru)
router.post('/', upload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
    { name: 'image3', maxCount: 1 },
    { name: 'image4', maxCount: 1 }
]), (req, res) => {
    const {
        product_id,
        description,
        material,
        brand,
        category,
        stock,
        weight,
        sizes,
        shipping_info,
        specifications
    } = req.body;

    if (!product_id) {
        return res.status(400).json({ success: false, message: 'Product ID wajib diisi' });
    }

    const img = (field) => req.files?.[field]?.[0]?.filename || null;

    // Cek apakah produk exist
    db.query(`SELECT id FROM products WHERE id = ?`, [product_id], (errCheckProduct, productRows) => {
        if (errCheckProduct) {
            console.error(errCheckProduct);
            return res.status(500).json({ success: false, message: 'Gagal cek produk' });
        }
        
        if (productRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Produk tidak ditemukan, buat produk terlebih dahulu' });
        }

        // Cek apakah detail sudah ada
        db.query(`SELECT id FROM product_details WHERE product_id = ?`, [product_id], (errCheck, detailRows) => {
            if (errCheck) {
                console.error(errCheck);
                return res.status(500).json({ success: false, message: 'Gagal cek detail produk' });
            }

            if (detailRows.length > 0) {
                // Jika sudah ada, return error - gunakan PUT untuk update
                return res.status(400).json({ success: false, message: 'Detail produk sudah ada, gunakan PUT untuk update' });
            }

            // INSERT detail baru
            const insertSql = `
                INSERT INTO product_details
                (product_id, description, material, brand, category, stock, weight,
                 sizes, shipping_info, specifications,
                 image1, image2, image3, image4)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            `;
            const values = [
                product_id, 
                description || '', 
                material || '', 
                brand || '', 
                category || '', 
                stock || 0, 
                weight || 0,
                sizes || '', 
                shipping_info || '', 
                specifications || '[]',
                img('image1'), 
                img('image2'), 
                img('image3'), 
                img('image4')
            ];
            db.query(insertSql, values, (errInsert) => {
                if (errInsert) {
                    console.error(errInsert);
                    return res.status(500).json({ success: false, message: 'Gagal tambah detail produk' });
                }
                res.json({ success: true, message: 'Berhasil tambah detail produk' });
            });
        });
    });
});

// ========== PERBAIKAN: PUT untuk UPDATE ==========
router.put('/:product_id', upload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
    { name: 'image3', maxCount: 1 },
    { name: 'image4', maxCount: 1 }
]), (req, res) => {
    const product_id = req.params.product_id;
    const {
        description,
        material,
        brand,
        category,
        stock,
        weight,
        sizes,
        shipping_info,
        specifications
    } = req.body;

    console.log('PUT request received for product_id:', product_id);
    console.log('Request body:', req.body);
    console.log('Files:', req.files);

    const img = (field) => req.files?.[field]?.[0]?.filename || null;

    // Pertama, cek apakah detail sudah ada
    db.query(`SELECT id FROM product_details WHERE product_id = ?`, [product_id], (errCheck, detailRows) => {
        if (errCheck) {
            console.error(errCheck);
            return res.status(500).json({ success: false, message: 'Gagal cek detail produk' });
        }

        if (detailRows.length === 0) {
            // Jika belum ada, INSERT baru
            console.log('Detail not found, inserting new record');
            const insertSql = `
                INSERT INTO product_details
                (product_id, description, material, brand, category, stock, weight,
                 sizes, shipping_info, specifications,
                 image1, image2, image3, image4)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            `;
            const values = [
                product_id, 
                description || '', 
                material || '', 
                brand || '', 
                category || '', 
                stock || 0, 
                weight || 0,
                sizes || '', 
                shipping_info || '', 
                specifications || '[]',
                img('image1'), 
                img('image2'), 
                img('image3'), 
                img('image4')
            ];
            db.query(insertSql, values, (errInsert) => {
                if (errInsert) {
                    console.error(errInsert);
                    return res.status(500).json({ success: false, message: 'Gagal tambah detail produk' });
                }
                res.json({ success: true, message: 'Berhasil tambah detail produk' });
            });
        } else {
            // Jika sudah ada, UPDATE
            console.log('Detail found, updating record');
            
            // Build dynamic SET clause untuk menghindari COALESCE jika tidak perlu
            let updateFields = [];
            let values = [];
            
            if (description !== undefined) {
                updateFields.push('description = ?');
                values.push(description || '');
            }
            if (material !== undefined) {
                updateFields.push('material = ?');
                values.push(material || '');
            }
            if (brand !== undefined) {
                updateFields.push('brand = ?');
                values.push(brand || '');
            }
            if (category !== undefined) {
                updateFields.push('category = ?');
                values.push(category || '');
            }
            if (stock !== undefined) {
                updateFields.push('stock = ?');
                values.push(stock || 0);
            }
            if (weight !== undefined) {
                updateFields.push('weight = ?');
                values.push(weight || 0);
            }
            if (sizes !== undefined) {
                updateFields.push('sizes = ?');
                values.push(sizes || '');
            }
            if (shipping_info !== undefined) {
                updateFields.push('shipping_info = ?');
                values.push(shipping_info || '');
            }
            if (specifications !== undefined) {
                updateFields.push('specifications = ?');
                values.push(specifications || '[]');
            }
            
            // Handle images
            if (img('image1')) {
                updateFields.push('image1 = ?');
                values.push(img('image1'));
            }
            if (img('image2')) {
                updateFields.push('image2 = ?');
                values.push(img('image2'));
            }
            if (img('image3')) {
                updateFields.push('image3 = ?');
                values.push(img('image3'));
            }
            if (img('image4')) {
                updateFields.push('image4 = ?');
                values.push(img('image4'));
            }
            
            if (updateFields.length === 0) {
                return res.status(400).json({ success: false, message: 'Tidak ada data yang diupdate' });
            }
            
            values.push(product_id);
            const updateSql = `UPDATE product_details SET ${updateFields.join(', ')} WHERE product_id = ?`;
            
            console.log('SQL:', updateSql);
            console.log('Values:', values);
            
            db.query(updateSql, values, (errUpdate) => {
                if (errUpdate) {
                    console.error(errUpdate);
                    return res.status(500).json({ success: false, message: 'Gagal update detail produk: ' + errUpdate.message });
                }
                res.json({ success: true, message: 'Berhasil update detail produk' });
            });
        }
    });
});

// DELETE
router.delete('/:product_id', (req, res) => {
    const product_id = req.params.product_id;
    
    db.query('SELECT image1, image2, image3, image4 FROM product_details WHERE product_id = ?', [product_id], (err, images) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Gagal mengambil data gambar' });
        }
        
        if (images.length > 0) {
            const imgFields = [images[0].image1, images[0].image2, images[0].image3, images[0].image4];
            imgFields.forEach(img => {
                if (img && fs.existsSync('uploads/product_details/' + img)) {
                    fs.unlinkSync('uploads/product_details/' + img);
                }
            });
        }
        
        db.query('DELETE FROM product_details WHERE product_id = ?', [product_id], (err) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: 'Gagal hapus detail produk' });
            }
            
            db.query('DELETE FROM products WHERE id = ?', [product_id], (err2) => {
                if (err2) {
                    console.error(err2);
                    return res.status(500).json({ success: false, message: 'Gagal hapus produk' });
                }
                res.json({ success: true, message: 'Berhasil hapus produk' });
            });
        });
    });
});

module.exports = router;