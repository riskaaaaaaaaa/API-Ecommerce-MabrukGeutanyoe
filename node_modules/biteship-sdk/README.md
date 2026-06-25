# Biteship SDK

[![npm version](https://img.shields.io/npm/v/biteship-sdk.svg)](https://www.npmjs.com/package/biteship-sdk)
[![npm downloads](https://img.shields.io/npm/dm/biteship-sdk.svg)](https://www.npmjs.com/package/biteship-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

A TypeScript SDK for interacting with the Biteship API. This SDK provides a clean, type-safe interface for all Biteship API endpoints.

## Features

- ✅ **Full TypeScript Support** - Complete type definitions for all API requests and responses
- ✅ **Modular Architecture** - Clean, organized service classes for each API group
- ✅ **Comprehensive Coverage** - Supports all Biteship API endpoints (Rates, Couriers, Locations, Maps, Draft Orders, Orders, Tracking)
- ✅ **Well Tested** - Includes both unit tests and integration tests
- ✅ **Easy to Use** - Simple, intuitive API design
- ✅ **Error Handling** - Proper error handling with typed error responses

## Installation

```bash
npm install biteship-sdk
```

## Quick Start

```typescript
import { Biteship } from 'biteship-sdk';

const biteship = new Biteship({
  apiKey: 'your-api-key-here',
});

// Get shipping rates
const rates = await biteship.rates.getRates({
  origin_postal_code: 12530,
  destination_postal_code: 10110,
  couriers: 'jne,sicepat',
  items: [
    {
      name: 'Product Name',
      value: 100000,
      quantity: 1,
      length: 10,
      width: 10,
      height: 10,
      weight: 1000,
    },
  ],
});
```

## Configuration

```typescript
const biteship = new Biteship({
  apiKey: 'your-api-key-here', // Required
  baseUrl: 'https://api.biteship.com', // Optional, defaults to production API
  timeout: 30000, // Optional, defaults to 30000ms
});
```

## API Reference

### Rates API

Get shipping rates for different couriers.

```typescript
// By postal code
const rates = await biteship.rates.getRates({
  origin_postal_code: 12530,
  destination_postal_code: 10110,
  couriers: 'jne,sicepat,paxel',
  items: [
    {
      name: 'Product',
      value: 100000,
      quantity: 1,
      length: 10,
      width: 10,
      height: 10,
      weight: 1000,
    },
  ],
});

// By area ID
const ratesByArea = await biteship.rates.getRates({
  origin_area_id: 'IDNP6IDNC148IDND836IDZ12410',
  destination_area_id: 'IDNP6IDNC148IDND836IDZ12430',
  couriers: 'jne,sicepat',
  items: [/* ... */],
});

// By coordinates
const ratesByCoords = await biteship.rates.getRates({
  origin_latitude: -6.291974,
  origin_longitude: 106.801207,
  destination_latitude: -6.288941,
  destination_longitude: 106.806473,
  couriers: 'grab,gojek',
  items: [/* ... */],
});
```

### Couriers API

Get list of available couriers.

```typescript
const couriers = await biteship.couriers.list();
console.log(couriers.couriers); // Array of available couriers
```

### Locations API

Manage origin and destination locations.

```typescript
// Create a location
const location = await biteship.locations.create({
  name: 'Warehouse',
  contact_name: 'John Doe',
  contact_phone: '08123456789',
  address: 'Jl. Example No. 123',
  postal_code: 10110,
  type: 'origin',
  latitude: -6.232123121,
  longitude: 102.22189911,
});

// Get a location
const locationData = await biteship.locations.get('location-id');

// Update a location
const updated = await biteship.locations.update('location-id', {
  name: 'Updated Warehouse Name',
});

// Delete a location
await biteship.locations.delete('location-id');
```

### Maps API

Search for areas/locations.

```typescript
const areas = await biteship.maps.getAreas({
  countries: 'ID',
  input: 'Jakarta Selatan',
  type: 'single',
});
```

### Draft Orders API

Create and manage draft orders before confirming them.

```typescript
// Create a draft order
const draftOrder = await biteship.draftOrders.create({
  origin_contact_name: 'Amir',
  origin_contact_phone: '081234567890',
  origin_address: 'Plaza Senayan',
  origin_postal_code: 12440,
  destination_contact_name: 'John Doe',
  destination_contact_phone: '088888888888',
  destination_address: 'Lebak Bulus MRT',
  destination_postal_code: 12950,
  delivery_type: 'now',
  items: [
    {
      name: 'Product',
      value: 165000,
      quantity: 1,
      length: 10,
      width: 10,
      height: 10,
      weight: 200,
    },
  ],
});

// Get a draft order
const order = await biteship.draftOrders.get('draft-order-id');

// Update courier
await biteship.draftOrders.update('draft-order-id', {
  courier_company: 'sicepat',
  courier_type: 'reg',
});

// Update location
await biteship.draftOrders.update('draft-order-id', {
  origin_coordinate: {
    latitude: -6.1751,
    longitude: 106.8650,
  },
  destination_coordinate: {
    latitude: -6.2115,
    longitude: 106.8452,
  },
});

// Get rates for draft order
const rates = await biteship.draftOrders.getRates('draft-order-id');

// Confirm draft order (convert to order)
const confirmedOrder = await biteship.draftOrders.confirm('draft-order-id');

// Delete draft order
await biteship.draftOrders.delete('draft-order-id');
```

### Orders API

Create and manage orders.

```typescript
// Create an order
const order = await biteship.orders.create({
  origin_contact_name: 'Amir',
  origin_contact_phone: '081234567890',
  origin_address: 'Plaza Senayan',
  origin_postal_code: 12440,
  destination_contact_name: 'John Doe',
  destination_contact_phone: '088888888888',
  destination_address: 'Lebak Bulus MRT',
  destination_postal_code: 12950,
  courier_company: 'jne',
  courier_type: 'reg',
  delivery_type: 'now',
  items: [
    {
      name: 'Product',
      value: 165000,
      quantity: 1,
      length: 10,
      width: 10,
      height: 10,
      weight: 200,
    },
  ],
});

// Create order with cash on delivery
const codOrder = await biteship.orders.create({
  // ... same as above
  destination_cash_on_delivery: 500000,
  destination_cash_on_delivery_type: '7_days',
});

// Get an order
const orderData = await biteship.orders.get('order-id');

// Cancel an order
await biteship.orders.cancel('order-id');
```

### Tracking API

Track shipments.

```typescript
// Track by order ID
const tracking = await biteship.tracking.getById('order-id');

// Track by waybill ID and courier code
const trackingByWaybill = await biteship.tracking.getByWaybill(
  '0123082100003094',
  'sicepat'
);
```

## TypeScript Support

This SDK is written in TypeScript and provides full type definitions. All request and response types are exported for your convenience:

```typescript
import {
  RatesRequest,
  RatesResponse,
  CreateOrderRequest,
  OrderResponse,
  // ... and more
} from 'biteship-sdk';
```

## Error Handling

The SDK throws errors for API failures. Always wrap API calls in try-catch blocks:

```typescript
try {
  const rates = await biteship.rates.getRates(/* ... */);
} catch (error) {
  console.error('Error getting rates:', error.message);
  // error.status contains HTTP status code
  // error.data contains API error response
}
```

## Testing

### Unit Tests

Run unit tests with Jest:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Generate coverage report:

```bash
npm run test:coverage
```

### Integration Tests

Integration tests test against the live Biteship API. These tests require a valid API key from your test environment.

**Setup:**

1. Set the `BITESHIP_API_KEY` environment variable with your test API key:

```bash
# Linux/Mac
export BITESHIP_API_KEY=your-test-api-key-here

# Windows (PowerShell)
$env:BITESHIP_API_KEY="your-test-api-key-here"

# Windows (CMD)
set BITESHIP_API_KEY=your-test-api-key-here
```

2. Optionally set a custom base URL (defaults to production):

```bash
export BITESHIP_BASE_URL=https://api.biteship.com
```

**Run Integration Tests:**

```bash
npm run test:integration
```

Run integration tests in watch mode:

```bash
npm run test:integration:watch
```

**Note:** Integration tests will create real resources (locations, orders, etc.) in your test environment. The tests include cleanup logic, but you should monitor your test environment to ensure proper cleanup.

## Development

Build the project:

```bash
npm run build
```

## Repository

- **GitHub**: [https://github.com/aqualaguna/biteship-sdk](https://github.com/aqualaguna/biteship-sdk)
- **NPM**: [https://www.npmjs.com/package/biteship-sdk](https://www.npmjs.com/package/biteship-sdk)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

MIT

## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/aqualaguna/biteship-sdk).

