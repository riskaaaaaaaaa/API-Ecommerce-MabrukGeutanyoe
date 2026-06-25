const express = require('express');
const axios = require('axios');
const router = express.Router();
const db = require('../config/db');

// ========== KONFIGURASI MIDTRANS ==========
const SERVER_KEY = 'Mid-server-M6EzvhG13r7AzT_OxoNJcJ8p';
const CLIENT_KEY = 'Mid-client-uafg0HV7RaxKexr0';
const IS_PRODUCTION = false; // Ganti ke false untuk sandbox

const API_URL = IS_PRODUCTION 
    ? 'https://api.midtrans.com' 
    : 'https://api.sandbox.midtrans.com';

function getBasicAuth() {
    const encoded = Buffer.from(`${SERVER_KEY}:`).toString('base64');
    return `Basic ${encoded}`;
}

// ========== CREATE TRANSACTION - MENDUKUNG BANK TRANSFER & QRIS ==========
router.post('/create-payment', async (req, res) => {
    try {
        const {
            orderId,
            amount,
            email,
            phoneNumber,
            customerName,
            paymentType  // 'bank_transfer' atau 'qris'
        } = req.body;

        if (!orderId || !amount) {
            return res.status(400).json({ success: false, message: 'orderId dan amount wajib' });
        }

        const midtransOrderId = `ORDER-${orderId}-${Date.now()}`;

        await db.promise().query(
            `INSERT INTO payment_mappings (order_id, midtrans_order_id) VALUES (?, ?) 
             ON DUPLICATE KEY UPDATE midtrans_order_id = ?`,
            [orderId, midtransOrderId, midtransOrderId]
        );

        // 🔥 PAYLOAD DASAR (sama untuk semua)
        let payload = {
            transaction_details: {
                order_id: midtransOrderId,
                gross_amount: parseInt(amount)
            },
            customer_details: {
                first_name: customerName || 'Customer',
                email: email || '',
                phone: phoneNumber || ''
            },
            item_details: [
                {
                    id: orderId.toString(),
                    price: parseInt(amount),
                    quantity: 1,
                    name: `Pembayaran Order #${orderId}`
                }
            ],
            callbacks: {
                finish: `${req.protocol}://${req.get('host')}/api/payment/finish`,
                error: `${req.protocol}://${req.get('host')}/api/payment/error`,
                pending: `${req.protocol}://${req.get('host')}/api/payment/pending`
            }
        };

        // 🔥 KONFIGURASI BERDASARKAN JENIS PEMBAYARAN
        if (paymentType === 'qris') {
            // ========== KONFIGURASI QRIS ==========
            payload.enabled_payments = ["other_qris"];  // Hanya QRIS universal
            payload.expiry = {
                duration: 15,
                unit: 'minutes'
            };

            await db.promise().query(
                `UPDATE orders SET payment_method = 'QRIS' WHERE id = ?`,
                [orderId]
            );

            console.log(`✅ MEMBUAT PEMBAYARAN QRIS untuk order ${orderId} (${IS_PRODUCTION ? 'PRODUCTION' : 'SANDBOX'})`);

        } else {
            // ========== KONFIGURASI BANK TRANSFER ==========
            payload.enabled_payments = [
                "bca_va",
                "bni_va",
                "bri_va",
                "mandiri_va",
                "permata_va",
                "cimb_va",
                "danamon_va",
                "bank_transfer"
            ];
            payload.expiry = {
                duration: 24,
                unit: 'hours'
            };

            await db.promise().query(
                `UPDATE orders SET payment_method = 'Bank Transfer' WHERE id = ?`,
                [orderId]
            );

            console.log(`✅ MEMBUAT PEMBAYARAN BANK TRANSFER untuk order ${orderId} (${IS_PRODUCTION ? 'PRODUCTION' : 'SANDBOX'})`);
        }

        // 🔥 PINDAHKAN KODEX AXIOS KE SINI (SETELAH PAYLOAD SIAP)
        const response = await axios.post(
            `${API_URL}/snap/v1/transactions`,
            payload,
            {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': getBasicAuth()
                }
            }
        );

        // 🔥 LOG RESPONSE DARI MIDTRANS
        console.log('📦 Response Midtrans:', JSON.stringify(response.data, null, 2));

        if (response.data && response.data.token) {
            await db.promise().query(
                `UPDATE orders SET snap_token = ? WHERE id = ?`,
                [response.data.token, orderId]
            );

            res.json({
                success: true,
                snapToken: response.data.token,
                paymentUrl: response.data.redirect_url,
                orderId: orderId,
                amount: amount,
                midtransOrderId: midtransOrderId,
                paymentType: paymentType || 'bank_transfer'
            });
        } else {
            throw new Error('Snap token tidak ditemukan');
        }
    } catch (error) {
        console.error('❌ Error Midtrans:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: error.response?.data?.error_messages?.[0] || error.message || 'Gagal membuat transaksi'
        });
    }
});

// ========== WEBHOOK ==========
router.post('/webhook', async (req, res) => {
    const notification = req.body;
    console.log('📨 Webhook diterima:', JSON.stringify(notification, null, 2));

    try {
        const { order_id, transaction_status, fraud_status, payment_type, va_numbers } = notification;

        if (!order_id) {
            return res.status(400).send('Bad request: no order_id');
        }

        const [mapping] = await db.promise().query(
            `SELECT order_id FROM payment_mappings WHERE midtrans_order_id = ?`,
            [order_id]
        );

        const actualOrderId = mapping[0]?.order_id;

        if (!actualOrderId) {
            console.error(`❌ Order not found for midtrans_order_id: ${order_id}`);
            return res.status(404).send('Order not found');
        }

        let orderStatus = 'pending';

        if (transaction_status === 'capture') {
            if (fraud_status === 'accept') {
                orderStatus = 'process';
            }
        } else if (transaction_status === 'settlement') {
            orderStatus = 'process';
        } else if (transaction_status === 'pending') {
            orderStatus = 'pending';
        } else if (transaction_status === 'deny' || transaction_status === 'cancel' || transaction_status === 'expire') {
            orderStatus = 'cancelled';
        } else if (transaction_status === 'refund') {
            orderStatus = 'refunded';
        }

        if (orderStatus === 'process') {
            if (va_numbers && va_numbers.length > 0) {
                const vaNumber = va_numbers[0].va_number;
                const vaBank = va_numbers[0].bank;
                await db.promise().query(
                    `UPDATE orders SET va_number = ?, va_bank = ? WHERE id = ?`,
                    [vaNumber, vaBank, actualOrderId]
                );
            }

            await db.promise().query(
                `UPDATE orders SET status = ?, payment_reference = ?, payment_type = ? WHERE id = ?`,
                [orderStatus, order_id, payment_type || 'bank_transfer', actualOrderId]
            );
            console.log(`✅ Order ${actualOrderId} status berubah menjadi '${orderStatus}' via webhook`);
        }

        res.status(200).json({ status_code: 200, message: 'OK' });

    } catch (error) {
        console.error('❌ Error processing webhook:', error);
        res.status(500).send('Internal server error');
    }
});

// ========== CEK STATUS TRANSAKSI ==========
router.post('/check-status', async (req, res) => {
    try {
        const { orderId } = req.body;

        if (!orderId) {
            return res.status(400).json({ success: false, message: 'orderId wajib' });
        }

        const [mapping] = await db.promise().query(
            `SELECT midtrans_order_id FROM payment_mappings WHERE order_id = ?`,
            [orderId]
        );

        const midtransOrderId = mapping[0]?.midtrans_order_id;

        if (!midtransOrderId) {
            return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan' });
        }

        const response = await axios.get(
            `${API_URL}/v2/${midtransOrderId}/status`,
            {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': getBasicAuth()
                }
            }
        );

        const statusData = response.data;
        let orderStatus = 'unknown';

        if (statusData.transaction_status === 'capture' || statusData.transaction_status === 'settlement') {
            if (statusData.fraud_status === 'accept' || !statusData.fraud_status) {
                orderStatus = 'process';
            } else {
                orderStatus = 'pending';
            }
        } else if (statusData.transaction_status === 'pending') {
            orderStatus = 'pending';
        } else if (statusData.transaction_status === 'deny' ||
            statusData.transaction_status === 'cancel' ||
            statusData.transaction_status === 'expire') {
            orderStatus = 'cancelled';
        } else {
            orderStatus = statusData.transaction_status;
        }

        let vaInfo = null;
        if (statusData.va_numbers && statusData.va_numbers.length > 0) {
            vaInfo = {
                bank: statusData.va_numbers[0].bank,
                va_number: statusData.va_numbers[0].va_number
            };
        }

        res.json({
            success: true,
            status: {
                order_id: orderId,
                midtrans_order_id: midtransOrderId,
                transaction_status: statusData.transaction_status,
                app_status: orderStatus,
                gross_amount: statusData.gross_amount,
                payment_type: statusData.payment_type,
                transaction_time: statusData.transaction_time,
                settlement_time: statusData.settlement_time,
                va_info: vaInfo,
                qr_string: statusData.qr_string || null
            }
        });

    } catch (error) {
        console.error('❌ Error cek status:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: error.response?.data?.error_messages?.[0] || 'Gagal cek status transaksi'
        });
    }
});

// ========== REDIRECT HANDLERS ==========
router.get('/finish', (req, res) => {
    const { order_id, status_code } = req.query;
    res.redirect(`${process.env.FRONTEND_URL || '/'}payment-success?order_id=${order_id}`);
});

router.get('/error', (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL || '/'}payment-error`);
});

router.get('/pending', (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL || '/'}payment-pending`);
});

// ========== CANCEL PAYMENT ==========
router.post('/cancel', async (req, res) => {
    try {
        const { orderId } = req.body;

        const [mapping] = await db.promise().query(
            `SELECT midtrans_order_id FROM payment_mappings WHERE order_id = ?`,
            [orderId]
        );

        const midtransOrderId = mapping[0]?.midtrans_order_id;

        if (!midtransOrderId) {
            return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan' });
        }

        const response = await axios.post(
            `${API_URL}/v2/${midtransOrderId}/cancel`,
            {},
            {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': getBasicAuth()
                }
            }
        );

        await db.promise().query(
            `UPDATE orders SET status = 'cancelled' WHERE id = ?`,
            [orderId]
        );

        res.json({ success: true, message: 'Transaksi berhasil dibatalkan', data: response.data });

    } catch (error) {
        console.error('❌ Error cancel:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: error.response?.data?.error_messages?.[0] || 'Gagal membatalkan transaksi'
        });
    }
});

module.exports = router;