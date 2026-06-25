const axios = require('axios');

const API_KEY = '4U40AcYD8c68a8599f41822d0fVxnTbf';
const BASE_URL = 'https://rajaongkir.komerce.id/api/v1';

async function testAPI() {
    console.log('=== TEST API KOMERCE ===\n');
    
    // Test 1: Get provinces
    try {
        console.log('1. Testing GET provinces...');
        const provinces = await axios.get(`${BASE_URL}/destination/province`, {
            headers: { key: API_KEY }
        });
        console.log('✅ Provinces OK, jumlah:', provinces.data.data?.length);
        const sampleProvince = provinces.data.data[0];
        console.log('Contoh provinsi:', sampleProvince);
        console.log('Field yang tersedia:', Object.keys(sampleProvince));
        console.log('ID provinsi:', sampleProvince.province_id || sampleProvince.id);
        console.log('---\n');
    } catch (err) {
        console.log('❌ Provinces failed:', err.message);
    }
    
    // Test 2: Get cities dengan berbagai format
    const testProvinceId = 12; // DKI Jakarta
    
    const endpoints = [
        `/destination/city/${testProvinceId}`,
        `/destination/city?province_id=${testProvinceId}`,
        `/destination/cities/${testProvinceId}`,
        `/city/${testProvinceId}`
    ];
    
    for (const endpoint of endpoints) {
        try {
            console.log(`2. Testing GET ${endpoint}...`);
            const cities = await axios.get(`${BASE_URL}${endpoint}`, {
                headers: { key: API_KEY }
            });
            console.log(`✅ ${endpoint} OK`);
            console.log('Response:', JSON.stringify(cities.data, null, 2).substring(0, 500));
            break;
        } catch (err) {
            console.log(`❌ ${endpoint} failed:`, err.response?.data?.meta?.message || err.message);
        }
    }
}

testAPI();