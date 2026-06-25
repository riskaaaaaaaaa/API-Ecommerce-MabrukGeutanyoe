const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/db'); // Sesuaikan path dengan lokasi db.js

// 🔑 API Key
const RAJAONGKIR_API_KEY = '4U40AcYD8c68a8599f41822d0fVxnTbf';
const RAJAONGKIR_BASE_URL = 'https://rajaongkir.komerce.id/api/v1';

// Helper request
const rajaOngkirRequest = async (endpoint, method = 'GET', data = null, isForm = false) => {
    const url = `${RAJAONGKIR_BASE_URL}${endpoint}`;
    const headers = { 
        key: RAJAONGKIR_API_KEY,
        'Content-Type': method === 'POST' && isForm ? 'application/x-www-form-urlencoded' : 'application/json'
    };
    
    let config = { method, url, headers };
    if (method === 'POST' && data) config.data = data;
    
    try {
        const response = await axios(config);
        return response.data;
    } catch (error) {
        console.error('API Error:', error.response?.status, error.response?.data || error.message);
        throw error;
    }
};

// ========== 1. GET PROVINSI ==========
router.get('/provinces', async (req, res) => {
    try {
        const result = await rajaOngkirRequest('/destination/province');
        if (result?.data) return res.json(result.data);
        res.json([]);
    } catch (error) {
        res.status(500).json({ error: 'Gagal mengambil provinsi' });
    }
});

// ========== 2. GET KOTA ==========
router.get('/cities/:province_id', async (req, res) => {
    const { province_id } = req.params;
    
    if (!province_id) {
        return res.status(400).json({ error: 'province_id wajib diisi' });
    }
    
    try {
        const result = await rajaOngkirRequest(`/destination/city/${province_id}`);
        
        if (result?.data && Array.isArray(result.data)) {
            const cities = result.data.map(city => ({
                city_id: city.id,
                city_name: city.name,
                zip_code: city.zip_code,
                type: 'Kota'
            }));
            return res.json(cities);
        }
        
        res.json([]);
    } catch (error) {
        console.error(`Gagal mengambil kota untuk provinsi ${province_id}:`, error.message);
        res.status(500).json({ error: 'Gagal mengambil data kota' });
    }
});

// ========== 3. CEK ONGKIR ==========
router.post('/cost', async (req, res) => {
    const { origin, destination, weight, courier } = req.body;
    
    if (!origin || !destination || !weight || !courier) {
        return res.status(400).json({ error: 'Semua field wajib diisi' });
    }

    const params = new URLSearchParams();
    params.append('origin', origin);
    params.append('destination', destination);
    params.append('weight', weight);
    params.append('courier', courier.toLowerCase());

    try {
        const result = await rajaOngkirRequest('/calculate/domestic-cost', 'POST', params, true);
        res.json(result.data);
    } catch (error) {
        res.status(500).json({ error: 'Gagal menghitung ongkir' });
    }
});

// ========== 4. STORE ADDRESS MANAGEMENT (ADMIN) ==========

// Get store address (active)
router.get('/store-address', async (req, res) => {
    try {
        const query = 'SELECT * FROM store_addresses WHERE is_active = TRUE LIMIT 1';
        db.query(query, (err, results) => {
            if (err) {
                console.error('Error get store address:', err);
                return res.status(500).json({ error: 'Gagal mengambil alamat toko' });
            }
            
            if (results.length > 0) {
                res.json(results[0]);
            } else {
                res.json(null);
            }
        });
    } catch (error) {
        console.error('Error get store address:', error);
        res.status(500).json({ error: 'Gagal mengambil alamat toko' });
    }
});

// Update or create store address
router.post('/store-address', async (req, res) => {
    const { province_id, province_name, city_id, city_name, postal_code, address_detail } = req.body;
    
    if (!province_id || !province_name || !city_id || !city_name || !address_detail) {
        return res.status(400).json({ error: 'Semua field wajib diisi' });
    }
    
    try {
        // Deactivate all existing addresses
        const deactivateQuery = 'UPDATE store_addresses SET is_active = FALSE';
        db.query(deactivateQuery, (err) => {
            if (err) {
                console.error('Error deactivating addresses:', err);
                return res.status(500).json({ error: 'Gagal menyimpan alamat' });
            }
            
            // Insert new address
            const insertQuery = `INSERT INTO store_addresses 
                (province_id, province_name, city_id, city_name, postal_code, address_detail, is_active) 
                VALUES (?, ?, ?, ?, ?, ?, TRUE)`;
            
            db.query(insertQuery, [province_id, province_name, city_id, city_name, postal_code || '', address_detail], (err, result) => {
                if (err) {
                    console.error('Error inserting address:', err);
                    return res.status(500).json({ error: 'Gagal menyimpan alamat' });
                }
                
                res.json({ success: true, id: result.insertId });
            });
        });
    } catch (error) {
        console.error('Error save store address:', error);
        res.status(500).json({ error: 'Gagal menyimpan alamat toko' });
    }
});

// ========== 5. USER ADDRESS MANAGEMENT ==========

// Get user addresses
router.get('/user-addresses/:user_id', async (req, res) => {
    const { user_id } = req.params;
    
    if (!user_id) {
        return res.status(400).json({ error: 'user_id wajib diisi' });
    }
    
    try {
        const query = 'SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC';
        db.query(query, [user_id], (err, results) => {
            if (err) {
                console.error('Error get user addresses:', err);
                return res.status(500).json({ error: 'Gagal mengambil alamat pengguna' });
            }
            res.json(results);
        });
    } catch (error) {
        console.error('Error get user addresses:', error);
        res.status(500).json({ error: 'Gagal mengambil alamat pengguna' });
    }
});

// Save user address
router.post('/user-addresses', async (req, res) => {
    const { user_id, name, phone, province_id, province_name, city_id, city_name, postal_code, address_detail, is_default } = req.body;
    
    if (!user_id || !name || !phone || !province_id || !city_id || !address_detail) {
        return res.status(400).json({ error: 'Field wajib: user_id, name, phone, province_id, city_id, address_detail' });
    }
    
    try {
        // If this is default, remove default from other addresses
        if (is_default) {
            const removeDefaultQuery = 'UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?';
            db.query(removeDefaultQuery, [user_id], (err) => {
                if (err) {
                    console.error('Error removing default:', err);
                    return res.status(500).json({ error: 'Gagal menyimpan alamat' });
                }
                
                insertUserAddress();
            });
        } else {
            insertUserAddress();
        }
        
        function insertUserAddress() {
            const insertQuery = `INSERT INTO user_addresses 
                (user_id, name, phone, province_id, province_name, city_id, city_name, postal_code, address_detail, is_default) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            
            db.query(insertQuery, [user_id, name, phone, province_id, province_name, city_id, city_name, postal_code || '', address_detail, is_default || false], (err, result) => {
                if (err) {
                    console.error('Error inserting user address:', err);
                    return res.status(500).json({ error: 'Gagal menyimpan alamat pengguna' });
                }
                res.json({ success: true, id: result.insertId });
            });
        }
    } catch (error) {
        console.error('Error save user address:', error);
        res.status(500).json({ error: 'Gagal menyimpan alamat pengguna' });
    }
});

// Update user address
router.put('/user-addresses/:id', async (req, res) => {
    const { id } = req.params;
    const { name, phone, province_id, province_name, city_id, city_name, postal_code, address_detail, is_default } = req.body;
    
    try {
        // Get user_id first
        const getUserQuery = 'SELECT user_id FROM user_addresses WHERE id = ?';
        db.query(getUserQuery, [id], (err, userResult) => {
            if (err || userResult.length === 0) {
                return res.status(404).json({ error: 'Alamat tidak ditemukan' });
            }
            
            const user_id = userResult[0].user_id;
            
            // If setting as default, remove default from others
            if (is_default) {
                db.query('UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?', [user_id], (err) => {
                    if (err) {
                        console.error('Error updating default:', err);
                        return res.status(500).json({ error: 'Gagal update alamat' });
                    }
                    performUpdate();
                });
            } else {
                performUpdate();
            }
            
            function performUpdate() {
                const updateQuery = `UPDATE user_addresses SET 
                    name = ?, phone = ?, province_id = ?, province_name = ?, 
                    city_id = ?, city_name = ?, postal_code = ?, address_detail = ?, is_default = ?
                    WHERE id = ?`;
                
                db.query(updateQuery, [name, phone, province_id, province_name, city_id, city_name, postal_code, address_detail, is_default, id], (err) => {
                    if (err) {
                        console.error('Error updating address:', err);
                        return res.status(500).json({ error: 'Gagal update alamat' });
                    }
                    res.json({ success: true });
                });
            }
        });
    } catch (error) {
        console.error('Error update user address:', error);
        res.status(500).json({ error: 'Gagal update alamat pengguna' });
    }
});

// Delete user address
router.delete('/user-addresses/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const deleteQuery = 'DELETE FROM user_addresses WHERE id = ?';
        db.query(deleteQuery, [id], (err, result) => {
            if (err) {
                console.error('Error delete user address:', err);
                return res.status(500).json({ error: 'Gagal menghapus alamat' });
            }
            res.json({ success: true });
        });
    } catch (error) {
        console.error('Error delete user address:', error);
        res.status(500).json({ error: 'Gagal menghapus alamat' });
    }
});

// ========== 6. CEK ONGKIR WITH SAVE ==========
router.post('/calculate-and-save', async (req, res) => {
    const { user_id, user_address_id, weight, courier } = req.body;
    
    if (!user_id || !user_address_id || !weight || !courier) {
        return res.status(400).json({ error: 'Semua field wajib diisi: user_id, user_address_id, weight, courier' });
    }
    
    try {
        // Get store address (active)
        const getStoreQuery = 'SELECT * FROM store_addresses WHERE is_active = TRUE LIMIT 1';
        db.query(getStoreQuery, async (err, storeAddr) => {
            if (err || storeAddr.length === 0) {
                return res.status(400).json({ error: 'Alamat toko belum diatur' });
            }
            
            // Get user address
            const getUserAddrQuery = 'SELECT * FROM user_addresses WHERE id = ? AND user_id = ?';
            db.query(getUserAddrQuery, [user_address_id, user_id], async (err, userAddr) => {
                if (err || userAddr.length === 0) {
                    return res.status(400).json({ error: 'Alamat user tidak ditemukan' });
                }
                
                // Calculate shipping cost
                const params = new URLSearchParams();
                params.append('origin', storeAddr[0].city_id);
                params.append('destination', userAddr[0].city_id);
                params.append('weight', weight);
                params.append('courier', courier.toLowerCase());
                
                try {
                    const result = await rajaOngkirRequest('/calculate/domestic-cost', 'POST', params, true);
                    
                    // Save to database
                    if (result?.data && Array.isArray(result.data)) {
                        for (const item of result.data) {
                            if (item.costs && Array.isArray(item.costs)) {
                                for (const service of item.costs) {
                                    const costValue = service.cost?.[0]?.value || 0;
                                    const etd = service.cost?.[0]?.etd || '-';
                                    
                                    const insertQuery = `INSERT INTO shipping_checks 
                                        (user_id, store_address_id, user_address_id, weight, courier, service, cost, estimated_day) 
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
                                    
                                    await new Promise((resolve, reject) => {
                                        db.query(insertQuery, [user_id, storeAddr[0].id, user_address_id, weight, courier.toLowerCase(), service.service, costValue, etd], (err) => {
                                            if (err) reject(err);
                                            else resolve();
                                        });
                                    });
                                }
                            }
                        }
                    }
                    
                    res.json(result.data);
                    
                } catch (error) {
                    console.error('Error calculating shipping:', error);
                    res.status(500).json({ error: 'Gagal menghitung ongkir' });
                }
            });
        });
    } catch (error) {
        console.error('Error calculate and save:', error);
        res.status(500).json({ error: 'Gagal menghitung ongkir' });
    }
});

// Get shipping history for user
router.get('/shipping-history/:user_id', async (req, res) => {
    const { user_id } = req.params;
    
    if (!user_id) {
        return res.status(400).json({ error: 'user_id wajib diisi' });
    }
    
    try {
        const query = `SELECT 
            sc.*, 
            sa.city_name as store_city,
            sa.address_detail as store_address,
            ua.name as receiver_name,
            ua.phone as receiver_phone,
            ua.city_name as destination_city,
            ua.address_detail as destination_address
            FROM shipping_checks sc
            JOIN store_addresses sa ON sc.store_address_id = sa.id
            JOIN user_addresses ua ON sc.user_address_id = ua.id
            WHERE sc.user_id = ?
            ORDER BY sc.created_at DESC
            LIMIT 20`;
        
        db.query(query, [user_id], (err, results) => {
            if (err) {
                console.error('Error get shipping history:', err);
                return res.status(500).json({ error: 'Gagal mengambil history' });
            }
            res.json(results);
        });
    } catch (error) {
        console.error('Error get shipping history:', error);
        res.status(500).json({ error: 'Gagal mengambil history' });
    }
});

// ========== 7. TEST ENDPOINT ==========
router.get('/test/:province_id', async (req, res) => {
    const { province_id } = req.params;
    
    try {
        const provinces = await rajaOngkirRequest('/destination/province');
        const citiesResult = await rajaOngkirRequest(`/destination/city/${province_id}`);
        
        res.json({
            status: 'OK',
            api_working: true,
            province_sample: provinces?.data?.[0] || null,
            cities_found: citiesResult?.data?.length || 0,
            cities_sample: citiesResult?.data?.slice(0, 3) || []
        });
    } catch (error) {
        res.json({
            status: 'ERROR',
            message: error.message
        });
    }
});

// ========== 5. USER ADDRESS MANAGEMENT (TAMBAHAN) ==========

// Save user address (TAMBAHKAN endpoint ini)
router.post('/user-addresses', async (req, res) => {
    const { user_id, name, phone, province_id, province_name, city_id, city_name, postal_code, address_detail, is_default } = req.body;
    
    if (!user_id || !name || !phone || !province_id || !city_id || !address_detail) {
        return res.status(400).json({ error: 'Field wajib: user_id, name, phone, province_id, city_id, address_detail' });
    }
    
    try {
        // If this is default, remove default from other addresses
        if (is_default) {
            await new Promise((resolve, reject) => {
                db.query('UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?', [user_id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }
        
        const insertQuery = `INSERT INTO user_addresses 
            (user_id, name, phone, province_id, province_name, city_id, city_name, postal_code, address_detail, is_default) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        db.query(insertQuery, [user_id, name, phone, province_id, province_name, city_id, city_name, postal_code || '', address_detail, is_default || false], (err, result) => {
            if (err) {
                console.error('Error inserting user address:', err);
                return res.status(500).json({ error: 'Gagal menyimpan alamat pengguna' });
            }
            res.json({ success: true, id: result.insertId });
        });
    } catch (error) {
        console.error('Error save user address:', error);
        res.status(500).json({ error: 'Gagal menyimpan alamat pengguna' });
    }
});

// ========== 6. CEK ONGKIR WITH SAVE (TAMBAHKAN endpoint ini) ==========
router.post('/calculate-and-save', async (req, res) => {
    const { user_id, user_address_id, weight, courier } = req.body;
    
    if (!user_id || !user_address_id || !weight || !courier) {
        return res.status(400).json({ error: 'Semua field wajib diisi: user_id, user_address_id, weight, courier' });
    }
    
    try {
        // Get store address (active)
        const getStoreQuery = 'SELECT * FROM store_addresses WHERE is_active = TRUE LIMIT 1';
        db.query(getStoreQuery, async (err, storeAddr) => {
            if (err || storeAddr.length === 0) {
                return res.status(400).json({ error: 'Alamat toko belum diatur' });
            }
            
            // Get user address
            const getUserAddrQuery = 'SELECT * FROM user_addresses WHERE id = ? AND user_id = ?';
            db.query(getUserAddrQuery, [user_address_id, user_id], async (err, userAddr) => {
                if (err || userAddr.length === 0) {
                    return res.status(400).json({ error: 'Alamat user tidak ditemukan' });
                }
                
                // Calculate shipping cost
                const params = new URLSearchParams();
                params.append('origin', storeAddr[0].city_id);
                params.append('destination', userAddr[0].city_id);
                params.append('weight', weight);
                params.append('courier', courier.toLowerCase());
                
                try {
                    const result = await rajaOngkirRequest('/calculate/domestic-cost', 'POST', params, true);
                    
                    // Save to database
                    if (result?.data && Array.isArray(result.data)) {
                        for (const item of result.data) {
                            if (item.costs && Array.isArray(item.costs)) {
                                for (const service of item.costs) {
                                    const costValue = service.cost?.[0]?.value || 0;
                                    const etd = service.cost?.[0]?.etd || '-';
                                    
                                    const insertQuery = `INSERT INTO shipping_checks 
                                        (user_id, store_address_id, user_address_id, weight, courier, service, cost, estimated_day) 
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
                                    
                                    await new Promise((resolve, reject) => {
                                        db.query(insertQuery, [user_id, storeAddr[0].id, user_address_id, weight, courier.toLowerCase(), service.service, costValue, etd], (err) => {
                                            if (err) reject(err);
                                            else resolve();
                                        });
                                    });
                                }
                            }
                        }
                    }
                    
                    res.json(result.data);
                    
                } catch (error) {
                    console.error('Error calculating shipping:', error);
                    res.status(500).json({ error: 'Gagal menghitung ongkir' });
                }
            });
        });
    } catch (error) {
        console.error('Error calculate and save:', error);
        res.status(500).json({ error: 'Gagal menghitung ongkir' });
    }
});

// ========== 8. ADMIN - GET ALL USER ADDRESSES ==========
router.get('/admin/user-addresses', async (req, res) => {
    try {
        const query = `
            SELECT ua.*, 
            COUNT(CASE WHEN ua.is_default = 1 THEN 1 END) as default_count
            FROM user_addresses ua
            GROUP BY ua.id
            ORDER BY ua.created_at DESC
        `;
        
        db.query(query, (err, results) => {
            if (err) {
                console.error('Error get all user addresses:', err);
                return res.status(500).json({ error: 'Gagal mengambil data alamat' });
            }
            res.json(results);
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Gagal mengambil data alamat' });
    }
});

// ========== 9. ADMIN - GET USER ADDRESSES BY USER ID ==========
router.get('/admin/user-addresses/:user_id', async (req, res) => {
    const { user_id } = req.params;
    
    try {
        const query = 'SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC';
        db.query(query, [user_id], (err, results) => {
            if (err) {
                console.error('Error get user addresses by user:', err);
                return res.status(500).json({ error: 'Gagal mengambil data alamat' });
            }
            res.json(results);
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Gagal mengambil data alamat' });
    }
});

// ========== 10. ADMIN - DELETE USER ADDRESS ==========
router.delete('/admin/user-addresses/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const deleteQuery = 'DELETE FROM user_addresses WHERE id = ?';
        db.query(deleteQuery, [id], (err, result) => {
            if (err) {
                console.error('Error delete user address:', err);
                return res.status(500).json({ error: 'Gagal menghapus alamat' });
            }
            res.json({ success: true, message: 'Alamat berhasil dihapus' });
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Gagal menghapus alamat' });
    }
});

// ========== 11. ADMIN - UPDATE USER ADDRESS ==========
router.put('/admin/user-addresses/:id', async (req, res) => {
    const { id } = req.params;
    const { name, phone, province_id, province_name, city_id, city_name, address_detail, postal_code, is_default } = req.body;
    
    try {
        // Get user_id first
        const getUserQuery = 'SELECT user_id FROM user_addresses WHERE id = ?';
        db.query(getUserQuery, [id], (err, userResult) => {
            if (err || userResult.length === 0) {
                return res.status(404).json({ error: 'Alamat tidak ditemukan' });
            }
            
            const user_id = userResult[0].user_id;
            
            // If setting as default, remove default from others
            if (is_default) {
                db.query('UPDATE user_addresses SET is_default = FALSE WHERE user_id = ?', [user_id], (err) => {
                    if (err) {
                        console.error('Error updating default:', err);
                        return res.status(500).json({ error: 'Gagal update alamat' });
                    }
                    performUpdate();
                });
            } else {
                performUpdate();
            }
            
            function performUpdate() {
                const updateQuery = `UPDATE user_addresses SET 
                    name = ?, phone = ?, province_id = ?, province_name = ?, 
                    city_id = ?, city_name = ?, address_detail = ?, postal_code = ?, is_default = ?
                    WHERE id = ?`;
                
                db.query(updateQuery, [name, phone, province_id, province_name, city_id, city_name, address_detail, postal_code || '', is_default, id], (err) => {
                    if (err) {
                        console.error('Error updating address:', err);
                        return res.status(500).json({ error: 'Gagal update alamat' });
                    }
                    res.json({ success: true, message: 'Alamat berhasil diupdate' });
                });
            }
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Gagal update alamat' });
    }
});

// ========== GET ALL STORE ADDRESSES ==========
router.get('/store-addresses', async (req, res) => {
    try {
        const query = 'SELECT * FROM store_addresses ORDER BY is_active DESC, created_at DESC';
        db.query(query, (err, results) => {
            if (err) {
                console.error('Error get store addresses:', err);
                return res.status(500).json({ error: 'Gagal mengambil data alamat' });
            }
            res.json(results);
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Gagal mengambil data alamat' });
    }
});

// ========== UPDATE STORE ADDRESS ==========
router.put('/store-addresses/:id', async (req, res) => {
    const { id } = req.params;
    const { province_id, province_name, city_id, city_name, postal_code, address_detail } = req.body;
    
    try {
        const updateQuery = `UPDATE store_addresses SET 
            province_id = ?, province_name = ?, city_id = ?, city_name = ?, 
            postal_code = ?, address_detail = ? WHERE id = ?`;
        
        db.query(updateQuery, [province_id, province_name, city_id, city_name, postal_code, address_detail, id], (err, result) => {
            if (err) {
                console.error('Error updating store address:', err);
                return res.status(500).json({ error: 'Gagal update alamat' });
            }
            res.json({ success: true, message: 'Alamat berhasil diupdate' });
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Gagal update alamat' });
    }
});

// ========== DELETE STORE ADDRESS ==========
router.delete('/store-addresses/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        // Check if this is the active address
        const checkQuery = 'SELECT is_active FROM store_addresses WHERE id = ?';
        db.query(checkQuery, [id], (err, results) => {
            if (err) {
                console.error('Error checking address:', err);
                return res.status(500).json({ error: 'Gagal menghapus alamat' });
            }
            
            if (results.length > 0 && results[0].is_active === 1) {
                return res.status(400).json({ error: 'Tidak dapat menghapus alamat yang sedang aktif. Jadikan alamat lain sebagai aktif terlebih dahulu.' });
            }
            
            const deleteQuery = 'DELETE FROM store_addresses WHERE id = ?';
            db.query(deleteQuery, [id], (err, result) => {
                if (err) {
                    console.error('Error deleting store address:', err);
                    return res.status(500).json({ error: 'Gagal menghapus alamat' });
                }
                res.json({ success: true, message: 'Alamat berhasil dihapus' });
            });
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Gagal menghapus alamat' });
    }
});

// ========== SET ACTIVE STORE ADDRESS ==========
router.put('/store-addresses/:id/set-active', async (req, res) => {
    const { id } = req.params;
    
    try {
        // Deactivate all
        await new Promise((resolve, reject) => {
            db.query('UPDATE store_addresses SET is_active = FALSE', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        // Activate selected
        db.query('UPDATE store_addresses SET is_active = TRUE WHERE id = ?', [id], (err, result) => {
            if (err) {
                console.error('Error setting active address:', err);
                return res.status(500).json({ error: 'Gagal mengatur alamat aktif' });
            }
            res.json({ success: true, message: 'Alamat aktif berhasil diubah' });
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Gagal mengatur alamat aktif' });
    }
});

// ========== GENERATE AWB (No Resi) ==========
router.post('/generate-awb', async (req, res) => {
    const { order_id, courier, service, weight, origin_city_id, destination_city_id } = req.body;
    
    if (!order_id || !courier || !service) {
        return res.status(400).json({ error: 'Data tidak lengkap' });
    }
    
    try {
        // 🔥 Untuk pengembangan: Generate nomor resi dummy
        // Nanti jika pakai pro, ganti dengan call API real ke RajaOngkir
        
        const awbNumber = generateDummyAwbNumber(courier);
        
        // Simpan ke database
        const updateQuery = `
            UPDATE orders 
            SET awb_number = ?, tracking_status = 'shipped'
            WHERE id = ?
        `;
        
        db.query(updateQuery, [awbNumber, order_id], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Gagal menyimpan no resi' });
            }
            
            res.json({
                success: true,
                awb_number: awbNumber,
                courier: courier,
                service: service,
                message: 'No resi berhasil dibuat'
            });
        });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Gagal generate no resi' });
    }
});

// Fungsi generate dummy AWB (UNTUK PENGEMBANGAN)
function generateDummyAwbNumber(courier) {
    const prefix = {
        'jne': 'JNE',
        'pos': 'POS',
        'tiki': 'TIKI'
    }[courier.toLowerCase()] || 'SHIP';
    
    const random = Math.floor(Math.random() * 1000000000);
    const date = Date.now().toString().slice(-6);
    
    return `${prefix}${date}${random.toString().slice(0, 6)}`;
}

// ========== TRACKING PENGIRIMAN ==========
router.get('/tracking/:awb_number', async (req, res) => {
    const { awb_number } = req.params;
    
    if (!awb_number) {
        return res.status(400).json({ error: 'No resi wajib diisi' });
    }
    
    try {
        // 🔥 Untuk development: Return tracking dummy
        // Nanti jika pakai pro, panggil API tracking RajaOngkir
        
        const trackingData = generateDummyTracking(awb_number);
        
        res.json(trackingData);
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Gagal melacak pengiriman' });
    }
});

// Fungsi generate tracking dummy (UNTUK PENGEMBANGAN)
function generateDummyTracking(awbNumber) {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    return {
        success: true,
        awb_number: awbNumber,
        status: 'IN_TRANSIT',
        courier: awbNumber.startsWith('JNE') ? 'JNE' : (awbNumber.startsWith('POS') ? 'POS' : 'TIKI'),
        service: 'REG',
        origin: 'Jakarta Pusat, DKI Jakarta',
        destination: 'Surabaya, Jawa Timur',
        weight: '1 kg',
        estimated_delivery: new Date(now.setDate(now.getDate() + 2)).toISOString().split('T')[0],
        history: [
            {
                date: now.toISOString(),
                status: 'Dikirim dari pusat sortir',
                location: 'Jakarta Pusat',
                description: 'Paket telah dikirim dari pusat sortir Jakarta'
            },
            {
                date: yesterday.toISOString(),
                status: 'Dalam perjalanan',
                location: 'Cikarang, Jawa Barat',
                description: 'Paket sedang dalam perjalanan menuju kota tujuan'
            },
            {
                date: twoDaysAgo.toISOString(),
                status: 'Paket telah diterima oleh kurir',
                location: 'Jakarta Selatan',
                description: 'Paket telah diterima oleh kurir cabang Jakarta'
            }
        ]
    };
}

// ================= UPDATE AWB (No Resi) =================
router.put('/:id/awb', async (req, res) => {
    const { id } = req.params;
    const { awb_number, courier, service } = req.body;
    
    if (!awb_number) {
        return res.status(400).json({ success: false, message: 'No resi wajib diisi' });
    }
    
    try {
        const sql = `UPDATE orders SET awb_number = ?, shipping_method = ?, status = 'shipped' WHERE id = ?`;
        db.query(sql, [awb_number, `${courier} ${service}`, id], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: 'Gagal update no resi' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
            }
            res.json({ success: true, message: 'No resi berhasil ditambahkan', awb_number });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ================= TRACKING ORDER =================
router.get('/:id/tracking', async (req, res) => {
    const { id } = req.params;
    
    try {
        // Cek apakah order memiliki no resi
        const orderSql = `SELECT awb_number, shipping_method, status FROM orders WHERE id = ?`;
        db.query(orderSql, [id], async (err, orderRows) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            if (orderRows.length === 0) {
                return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
            }
            
            const order = orderRows[0];
            
            if (!order.awb_number) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'No resi belum tersedia. Pesanan masih diproses.' 
                });
            }
            
            // Panggil API tracking
            try {
                const trackingResponse = await fetch(`http://localhost:8000/api/ongkir/tracking/${order.awb_number}`);
                const trackingData = await trackingResponse.json();
                
                res.json({
                    success: true,
                    order_id: id,
                    awb_number: order.awb_number,
                    shipping_method: order.shipping_method,
                    tracking: trackingData
                });
            } catch (trackingErr) {
                // Fallback ke data dummy
                res.json({
                    success: true,
                    order_id: id,
                    awb_number: order.awb_number,
                    shipping_method: order.shipping_method,
                    tracking: {
                        status: order.status,
                        message: 'Data tracking akan tersedia dalam beberapa jam'
                    }
                });
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/generate-awb', (req, res) => {
    const { order_id, courier, service, weight, origin_city_id, destination_city_id } = req.body;
    
    // Generate nomor resi dummy (untuk development)
    const prefix = courier.toUpperCase();
    const randomNum = Math.floor(Math.random() * 10000000000);
    const awbNumber = `${prefix}${randomNum}`;
    
    res.json({
        success: true,
        awb_number: awbNumber,
        courier: courier,
        service: service,
        message: 'No resi berhasil digenerate'
    });
});

module.exports = router;