# ReSell Hub Server

REST API for the ReSell Hub second-hand marketplace. Built with Express, MongoDB, JWT and Firebase Admin.

## Setup

```bash
npm install
cp .env.example .env   # then fill in your own values
npm run dev
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with nodemon |
| `npm start` | Start with node |
| `npm test` | Run the API smoke test (server must be running) |

## Authentication

1. Client logs in with Firebase.
2. Client sends the Firebase ID token to `POST /api/users/sync`.
3. Server verifies it and returns a JWT.
4. Send the JWT as `Authorization: Bearer <token>` on protected routes.

Roles (`buyer`, `seller`, `admin`) are read from the database on every protected request.

## Endpoints

### Users
| Method | Path | Auth |
|---|---|---|
| POST | `/api/users/sync` | Firebase token |
| GET | `/api/users/me` | JWT |
| PATCH | `/api/users/me` | JWT |

### Products
| Method | Path | Auth |
|---|---|---|
| GET | `/api/products` | Public (query: `search`, `category`, `sort`, `page`, `limit`) |
| GET | `/api/products/my` | JWT |
| GET | `/api/products/:id` | Public (approved only) |
| POST | `/api/products` | Seller / Admin |
| PATCH | `/api/products/:id` | Owner |
| DELETE | `/api/products/:id` | Owner |

### Wishlist
| Method | Path | Auth |
|---|---|---|
| GET | `/api/wishlist` | JWT |
| POST | `/api/wishlist/:productId` | JWT |
| DELETE | `/api/wishlist/:productId` | JWT |

### Orders
| Method | Path | Auth |
|---|---|---|
| POST | `/api/orders` | JWT |
| GET | `/api/orders/my-orders` | JWT |
| GET | `/api/orders/seller-orders` | JWT |
| GET | `/api/orders/:id` | Buyer or seller of the order |
| PATCH | `/api/orders/:id/cancel` | Buyer |
| PATCH | `/api/orders/:id/status` | Seller |

## Security

Helmet headers, rate limiting (300 requests / 15 min on `/api`), restricted CORS, input validation and escaped search patterns.