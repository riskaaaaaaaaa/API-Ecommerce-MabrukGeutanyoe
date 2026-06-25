// const db = require('../config/db'); // Perbaiki path ini

// class Address {
//     static async getStoreAddress() {
//         return new Promise((resolve, reject) => {
//             db.query('SELECT * FROM store_address WHERE is_default = 1 LIMIT 1', (err, results) => {
//                 if (err) reject(err);
//                 resolve(results[0]);
//             });
//         });
//     }

//     static async getUserAddress(userId) {
//         return new Promise((resolve, reject) => {
//             db.query('SELECT * FROM user_addresses WHERE user_id = ? AND is_default = 1 LIMIT 1', [userId], (err, results) => {
//                 if (err) reject(err);
//                 resolve(results[0]);
//             });
//         });
//     }

//     static async saveUserAddress(userId, addressData) {
//         return new Promise((resolve, reject) => {
//             const query = `
//                 INSERT INTO user_addresses (user_id, address_label, recipient_name, phone, address, 
//                 city, province, postal_code, latitude, longitude, is_default)
//                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//                 ON DUPLICATE KEY UPDATE
//                 address_label = VALUES(address_label),
//                 recipient_name = VALUES(recipient_name),
//                 phone = VALUES(phone),
//                 address = VALUES(address),
//                 city = VALUES(city),
//                 province = VALUES(province),
//                 postal_code = VALUES(postal_code),
//                 latitude = VALUES(latitude),
//                 longitude = VALUES(longitude)
//             `;
            
//             db.query(query, [
//                 userId, addressData.address_label, addressData.recipient_name,
//                 addressData.phone, addressData.address, addressData.city,
//                 addressData.province, addressData.postal_code,
//                 addressData.latitude, addressData.longitude,
//                 addressData.is_default || 1
//             ], (err, result) => {
//                 if (err) reject(err);
//                 resolve(result);
//             });
//         });
//     }
// }

// module.exports = Address;