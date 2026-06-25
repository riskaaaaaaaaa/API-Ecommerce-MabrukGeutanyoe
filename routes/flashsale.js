const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { createNotification, sendPushNotification } = require('./notifications');

// Helper untuk mendapatkan base URL
function getBaseUrl(req) {
    return `${req.protocol}://${req.get('host')}`;
}

// ================= FUNGSI KIRIM NOTIFIKASI FLASH SALE =================
async function sendFlashSaleNotification(productName, discountPercent, flashPrice, durationHours, productImage) {
    try {
        // Ambil semua user email dari MySQL
        const users = await new Promise((resolve, reject) => {
            db.query('SELECT id, email FROM users', (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });
        
        let successCount = 0;
        
        // Format pesan notifikasi
        const title = `⚡ FLASH SALE! ${discountPercent}% OFF`;
        const message = `${productName} hanya ${formatRupiah(flashPrice)}! Berlaku ${durationHours} jam. Buruan!`;
        
        for (const user of users) {
            try {
                // Simpan ke database notifikasi
                await createNotification(
                    user.id,
                    title,
                    message,
                    'promo',
                    null,
                    null,
                    productImage
                );
                
                // Kirim push notification via FCM
                await sendPushNotification(
                    user.email,
                    title,
                    message,
                    { type: 'flashsale', discount: discountPercent.toString() }
                );
                successCount++;
            } catch (notifError) {
                console.error(`Gagal kirim notif ke user ${user.id}:`, notifError);
            }
        }
        
        console.log(`✅ Notifikasi flash sale dikirim ke ${successCount} user`);
        return successCount;
    } catch (error) {
        console.error('Error sendFlashSaleNotification:', error);
        return 0;
    }
}

// Format Rupiah helper
function formatRupiah(number) {
    return 'Rp ' + parseInt(number).toLocaleString('id-ID');
}

// ================= GET FLASH SALE =================
router.get('/', (req, res) => {
    const sql = `
        SELECT
            fs.id,
            fs.product_id,
            fs.discount_percent,
            fs.flash_price,
            fs.duration_hours,
            fs.created_at,

            p.name,
            p.price,
            p.old_price,
            p.rating,
            p.sold,
            
            pd.image1 AS image,

            TIMESTAMPDIFF(
                SECOND,
                NOW(),
                DATE_ADD(
                    fs.created_at,
                    INTERVAL fs.duration_hours HOUR
                )
            ) AS remaining_seconds

        FROM flash_sales fs

        JOIN products p
        ON fs.product_id = p.id
        
        LEFT JOIN product_details pd
        ON p.id = pd.product_id

        WHERE
            DATE_ADD(
                fs.created_at,
                INTERVAL fs.duration_hours HOUR
            ) > NOW()

        ORDER BY fs.id DESC
    `;

    db.query(sql, (err, result) => {
        if (err) {
            console.error('Error fetch flash sale:', err);
            return res.status(500).json({ error: err.message });
        }

        const baseUrl = getBaseUrl(req);
        const data = result.map(item => {
            return {
                id: item.id,
                product_id: item.product_id,
                name: item.name,
                image: item.image 
                    ? `${baseUrl}/uploads/product_details/${item.image}` 
                    : null,
                original_price: item.price,
                flash_price: item.flash_price,
                discount_percent: item.discount_percent,
                rating: item.rating,
                sold: item.sold,
                duration_hours: item.duration_hours,
                remaining_seconds: item.remaining_seconds > 0 ? item.remaining_seconds : 0
            };
        });

        res.json(data);
    });
});

// ================= CREATE FLASH SALE =================
router.post('/', async (req, res) => {
    const {
        product_id,
        discount_percent,
        duration_hours
    } = req.body;

    if (!product_id || !discount_percent || !duration_hours) {
        return res.status(400).json({ 
            message: 'product_id, discount_percent, dan duration_hours wajib diisi' 
        });
    }

    db.query(
        `SELECT p.*, pd.weight, pd.stock, pd.image1 
         FROM products p 
         LEFT JOIN product_details pd ON p.id = pd.product_id 
         WHERE p.id = ?`,
        [product_id],
        async (err, productResult) => {
            if (err) {
                console.error('Error check product:', err);
                return res.status(500).json({ error: err.message });
            }

            if (productResult.length === 0) {
                return res.status(404).json({
                    message: 'Produk tidak ditemukan'
                });
            }

            const product = productResult[0];
            const originalPrice = parseFloat(product.price);
            const flashPrice = originalPrice - (originalPrice * discount_percent / 100);

            // Cek apakah sudah ada flash sale aktif untuk produk ini
            const checkSql = `
                SELECT id FROM flash_sales 
                WHERE product_id = ? 
                AND DATE_ADD(created_at, INTERVAL duration_hours HOUR) > NOW()
            `;
            
            db.query(checkSql, [product_id], async (err, existing) => {
                if (err) {
                    console.error('Error check existing flash sale:', err);
                    return res.status(500).json({ error: err.message });
                }
                
                if (existing.length > 0) {
                    return res.status(400).json({ 
                        message: 'Produk ini sudah memiliki flash sale aktif' 
                    });
                }

                const sql = `
                    INSERT INTO flash_sales
                    (product_id, discount_percent, flash_price, duration_hours)
                    VALUES (?, ?, ?, ?)
                `;

                db.query(
                    sql,
                    [product_id, discount_percent, flashPrice, duration_hours],
                    async (err, result) => {
                        if (err) {
                            console.error('Error insert flash sale:', err);
                            return res.status(500).json({ error: err.message });
                        }

                        // ========== KIRIM NOTIFIKASI FLASH SALE ==========
                        const productImage = product.image1 ? `/uploads/product_details/${product.image1}` : null;
                        const notifCount = await sendFlashSaleNotification(
                            product.name,
                            discount_percent,
                            flashPrice,
                            duration_hours,
                            productImage
                        );
                        
                        console.log(`✅ Flash sale created, notification sent to ${notifCount} users`);

                        res.json({
                            success: true,
                            message: `Flash sale berhasil dibuat. Notifikasi dikirim ke ${notifCount} pengguna.`,
                            id: result.insertId,
                            notificationSent: notifCount
                        });
                    }
                );
            });
        }
    );
});

// ================= UPDATE FLASH SALE (DIPERBAIKI) =================
router.put('/:id', async (req, res) => {
    const {
        product_id,
        discount_percent,
        duration_hours
    } = req.body;
    
    const flashSaleId = req.params.id;

    console.log('=== UPDATE FLASH SALE ===');
    console.log('ID:', flashSaleId);
    console.log('Body:', req.body);

    if (!product_id || !discount_percent || !duration_hours) {
        return res.status(400).json({ 
            message: 'Semua field wajib diisi' 
        });
    }

    // ✅ Cek apakah flash sale dengan ID ini ada
    db.query('SELECT * FROM flash_sales WHERE id = ?', [flashSaleId], async (err, existingFlashSale) => {
        if (err) {
            console.error('Error check flash sale:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (existingFlashSale.length === 0) {
            return res.status(404).json({ message: 'Flash sale tidak ditemukan' });
        }

        console.log('Existing flash sale:', existingFlashSale[0]);

        // ✅ Cek apakah produk (yang baru dipilih) sudah memiliki flash sale aktif LAIN
        const checkSql = `
            SELECT fs.id, fs.product_id 
            FROM flash_sales fs
            WHERE fs.product_id = ? 
            AND fs.id != ?
            AND DATE_ADD(fs.created_at, INTERVAL fs.duration_hours HOUR) > NOW()
        `;
        
        db.query(checkSql, [product_id, flashSaleId], async (err, otherSales) => {
            if (err) {
                console.error('Error check other flash sales:', err);
                return res.status(500).json({ error: err.message });
            }
            
            console.log('Other active flash sales for this product:', otherSales.length);
            
            if (otherSales.length > 0) {
                return res.status(400).json({ 
                    message: 'Produk ini sudah memiliki flash sale aktif lainnya' 
                });
            }

            // ✅ PERBAIKAN: Ambil data dari products JOIN product_details
            const getProductSql = `
                SELECT 
                    p.price, 
                    p.name,
                    pd.image1 
                FROM products p 
                LEFT JOIN product_details pd ON p.id = pd.product_id 
                WHERE p.id = ?
            `;
            
            db.query(getProductSql, [product_id], async (err, productResult) => {
                if (err) {
                    console.error('Error get product:', err);
                    return res.status(500).json({ error: err.message });
                }

                if (productResult.length === 0) {
                    return res.status(404).json({ message: 'Produk tidak ditemukan' });
                }

                const originalPrice = parseFloat(productResult[0].price);
                const flashPrice = originalPrice - (originalPrice * discount_percent / 100);

                console.log('Original price:', originalPrice);
                console.log('Flash price:', flashPrice);

                // ✅ UPDATE flash sale (tanpa mengubah created_at)
                const sql = `
                    UPDATE flash_sales
                    SET 
                        product_id = ?,
                        discount_percent = ?,
                        flash_price = ?,
                        duration_hours = ?
                    WHERE id = ?
                `;

                db.query(
                    sql,
                    [product_id, discount_percent, flashPrice, duration_hours, flashSaleId],
                    async (err, result) => {
                        if (err) {
                            console.error('Error update flash sale:', err);
                            return res.status(500).json({ error: err.message });
                        }
                        
                        console.log('Update affected rows:', result.affectedRows);

                        // Optional: Kirim notifikasi jika diskon berubah
                        let notifCount = 0;
                        const oldDiscount = existingFlashSale[0].discount_percent;
                        
                        if (oldDiscount !== discount_percent) {
                            const productImage = productResult[0].image1 ? `/uploads/product_details/${productResult[0].image1}` : null;
                            notifCount = await sendFlashSaleNotification(
                                productResult[0].name,
                                discount_percent,
                                flashPrice,
                                duration_hours,
                                productImage
                            );
                        }

                        res.json({
                            success: true,
                            message: `Flash sale berhasil diupdate${notifCount > 0 ? `. Notifikasi dikirim ke ${notifCount} pengguna.` : ''}`,
                            notificationSent: notifCount
                        });
                    }
                );
            });
        });
    });
});

// ================= DELETE =================
router.delete('/:id', (req, res) => {
    db.query(
        'DELETE FROM flash_sales WHERE id = ?',
        [req.params.id],
        (err, result) => {
            if (err) {
                console.error('Error delete flash sale:', err);
                return res.status(500).json({ error: err.message });
            }
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Flash sale tidak ditemukan' });
            }

            res.json({
                success: true,
                message: 'Flash sale berhasil dihapus'
            });
        }
    );
});

module.exports = router;