# SMG Equipment Stock

Static React frontend with Vercel Node.js API functions and MongoDB.

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` from `.env.example`:

   ```bash
   cp .env.example .env.local
   ```

3. Set these values:

   ```env
   MONGODB_URI=your_mongodb_atlas_connection_string
   MONGODB_DB=smg_stock
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=your-login-password
   AUTH_SECRET=long-random-secret
   ```

4. Run locally:

   ```bash
   npm run dev
   ```

5. Open the Vercel dev URL and log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Vercel Deploy

Add the same environment variables in Vercel Project Settings before deploying:

- `MONGODB_URI`
- `MONGODB_DB`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `AUTH_SECRET`

The frontend is served from the root static files. API routes are in `api/`:

- `GET /api/auth`
- `POST /api/auth`
- `DELETE /api/auth`
- `GET /api/purchase-entries`
- `POST /api/purchase-entries`
- `PUT /api/purchase-entries`
- `DELETE /api/purchase-entries?id=...`
- `GET /api/issue-entries`
- `POST /api/issue-entries`
- `PUT /api/issue-entries`
- `DELETE /api/issue-entries?id=...`
