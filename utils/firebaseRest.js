// utils/firebaseRest.js
const axios = require('axios');

const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY; // Set di .env

async function signInWithEmailPassword(email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`;
  try {
    const response = await axios.post(url, {
      email,
      password,
      returnSecureToken: true,
    });
    return response.data; // berisi idToken, localId, email, dll.
  } catch (error) {
    const errorMessage = error.response?.data?.error?.message || 'Authentication failed';
    throw new Error(errorMessage);
  }
}

module.exports = { signInWithEmailPassword };