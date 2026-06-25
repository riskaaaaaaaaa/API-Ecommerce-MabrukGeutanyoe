// const axios = require('axios');

// // 🔑 API Key langsung ditulis di sini
// const API_KEY = "4U40AcYD8c68a8599f41822d0fVxnTbf";  // Ganti dengan API key asli Anda
// const BASE_URL = "https://api.rajaongkir.com/starter";

// const rajaongkir = axios.create({
//   baseURL: BASE_URL,
//   headers: { key: API_KEY }
// });

// // Get semua provinsi
// async function getProvinces() {
//   const response = await rajaongkir.get('/province');
//   return response.data.rajaongkir.results;
// }

// // Get kota berdasarkan ID provinsi (opsional)
// async function getCities(provinceId = null) {
//   const params = provinceId ? { province: provinceId } : {};
//   const response = await rajaongkir.get('/city', { params });
//   return response.data.rajaongkir.results;
// }

// // Cek ongkir
// async function checkOngkir(origin, destination, weight, courier) {
//   const response = await rajaongkir.post('/cost', {
//     origin,
//     destination,
//     weight,
//     courier
//   });
//   return response.data.rajaongkir.results[0];
// }

// module.exports = { getProvinces, getCities, checkOngkir };