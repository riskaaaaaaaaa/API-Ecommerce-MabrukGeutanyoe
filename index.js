// const express = require('express');
// const app = express();
// // Server listening
// app.listen(8000, '0.0.0.0', () => {
//     console.log('Server running on http://0.0.0.0:8000');
// });
const app = require('./app');

app.listen(8000, '0.0.0.0', () => {
    console.log('Server running on http://0.0.0.0:8000');
});