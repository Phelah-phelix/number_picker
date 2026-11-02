# Number Picker

## Deploy to Render with Neon

The app runs as two Render services: an Express API and a Vite static site. Neon provides the PostgreSQL database.

### 1. Secure the database connection

If a database password has been shared in chat, rotate it in Neon before deploying. Do not put database credentials in source files or commit them to Git.

### 2. Create the database tables

In the Neon SQL Editor, run the statements from [`server/schema.sql`](./server/schema.sql). If the tables already exist, run the file again to add the leader-reset authorization column before deploying the updated API.

### 3. Deploy the API

In Render, create a **Web Service** connected to this repository:

- Root Directory: `server`
- Build Command: `npm ci`
- Start Command: `npm start`
- Environment variable `DATABASE_URL`: the new Neon connection string, copied directly from Neon

After deployment, check `https://YOUR-API.onrender.com/api/health`.

### 4. Deploy the client

Create a **Static Site** connected to the same repository:

- Root Directory: `client`
- Build Command: `npm ci && npm run build`
- Publish Directory: `dist`
- Environment variable `VITE_API_URL`: `https://YOUR-API.onrender.com` (no trailing slash)

The Vite environment variable is applied at build time. Redeploy the static site after changing it.

### 5. Restrict API access to the site

After the static site is deployed, set the API service's `CLIENT_URL` environment variable to the exact public Render Static Site URL, with no trailing slash. This enables CORS for that site. Redeploy the API after setting it.

The Vite proxy in [`client/vite.config.js`](./client/vite.config.js) is only for local development.

Group leaders can reset all participant selections. The reset authorization key is returned only when a group is created and stored in the leader's browser session; keep it private. Groups created before adding this feature do not have a reset key and must be recreated to use leader resets.
