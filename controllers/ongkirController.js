// const rajaongkir = require('../services/rajaongkir');

// // Get semua provinsi
// async function getProvinces(req, res) {
//   try {
//     const provinces = await rajaongkir.getProvinces();
//     res.json({ success: true, data: provinces });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// }

// // Get kota (bisa filter by province_id)
// async function getCities(req, res) {
//   try {
//     const { province_id } = req.query;
//     const cities = await rajaongkir.getCities(province_id);
//     res.json({ success: true, data: cities });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// }

// // Cek ongkir
// async function checkOngkir(req, res) {
//   try {
//     const { origin, destination, weight, courier } = req.body;
    
//     // Validasi input
//     if (!origin || !destination || !weight || !courier) {
//       return res.status(400).json({ 
//         success: false, 
//         message: 'origin, destination, weight, courier wajib diisi' 
//       });
//     }

//     const result = await rajaongkir.checkOngkir(origin, destination, weight, courier);
    
//     res.json({ 
//       success: true, 
//       data: {
//         courier: result.name,
//         costs: result.costs.map(cost => ({
//           service: cost.service,
//           description: cost.description,
//           cost: cost.cost[0].value,
//           etd: cost.cost[0].etd
//         }))
//       }
//     });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// }

// module.exports = { getProvinces, getCities, checkOngkir };