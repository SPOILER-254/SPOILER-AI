# SPOILER AI — Powered by SPOILER-TECH

**ONE AI. ALL YOUR SOCIALS. TOTAL CONTROL.**

SPOILER AI is a production-ready, multi-tenant social media AI automation platform featuring real-time WebSocket inbox synchronization, WhatsApp Business Cloud API, Meta Instagram/Messenger & Telegram Bot API webhooks, Gemini-powered multilingual replies (English, Swahili, Sheng), ReplyImg multimodal image analysis, a visual no-code workflow builder, M-Pesa Daraja & Stripe billing, TOTP 2FA, and an encrypted Operator API Credentials Vault.

---

## 1. Installation & Local Development

Requires **Node.js >= 22.14.0**.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env`:
   - `GEMINI_API_KEY`: Required server-side for the Universal AI Reply Engine and ReplyImg.
   - `SESSION_SECRET` & `TOKEN_ENCRYPTION_KEY`: 32+ character secrets for session signing and AES-256-GCM encryption.
   - `ADMIN_PASSCODE`: Secret passcode required to elevate the first administrator account.
   - `APP_URL`: Public HTTPS URL for webhooks and OAuth callbacks.
3. Start the full-stack server on port `3000`:
   ```bash
   npm run dev
   ```
4. Build and run in production:
   ```bash
   npm run build
   npm start
   ```

---

## 2. Production Deployment on Render (HTTPS + Persistent Disk)

`render.yaml` is pre-configured for one-click Blueprint deployment:

1. Push this repository to GitHub/GitLab.
2. In Render Dashboard, select **New + -> Blueprint** and connect the repository (`render.yaml`).
3. Render automatically provisions:
   - Node 22 Web Service (`npm install && npm run build`, `npm start`)
   - Auto-generated `SESSION_SECRET` and `TOKEN_ENCRYPTION_KEY`
   - Persistent Disk mounted at `/var/data` (`DATA_DIR=/var/data`) for SQLite + uploaded media
   - Health check at `/api/health`
   - Public HTTPS URL automatically exposed via `RENDER_EXTERNAL_URL` (SPOILER AI automatically detects `https://<your-app>.onrender.com`).
4. Enter your secret values when prompted: `GEMINI_API_KEY` and `ADMIN_PASSCODE`.
5. Once live, sign up, activate Admin Role in **Account & 2FA**, and enter any private third-party credentials (Meta, M-Pesa, Stripe, Resend, X/TikTok/YouTube OAuth) in **Admin -> API Credentials Vault**.

---

## 3. Production Deployment on Railway (Dockerfile + Persistent Volume)

`railway.json` and `Dockerfile` are ready for Railway deployment:

1. Push this repository to GitHub.
2. In Railway, click **New Project -> Deploy from GitHub Repo**.
3. Attach a **Volume** mounted at `/data` (matches default `DATA_DIR=/data` in `Dockerfile`).
4. Add required Variables in Railway **Service -> Variables**:
   - `GEMINI_API_KEY`
   - `SESSION_SECRET` (32+ random characters)
   - `TOKEN_ENCRYPTION_KEY` (32+ random characters)
   - `ADMIN_PASSCODE`
5. Generate a public HTTPS domain in **Settings -> Networking -> Generate Domain**. Railway exposes `RAILWAY_PUBLIC_DOMAIN`, which SPOILER AI automatically converts to `https://<your-domain>` for all OAuth and webhook URLs.

---

## 4. Database & Security Architecture

- Relational SQLite (`${DATA_DIR}/spoiler.db`, WAL mode, `busy_timeout = 5000`, foreign keys enforced) with automatic startup migrations in `server/db.ts`.
- AES-256-GCM encryption at rest (`server/crypto.ts`) for all social OAuth/API tokens and the Admin **API Credentials Vault** (`server/credentials.ts`).
- `GEMINI_API_KEY` is read strictly from server environment variables and never exposed to any client route or form.
- Production email delivery uses Resend HTTPS (`RESEND_API_KEY`, `EMAIL_FROM`); verification/reset codes are never disclosed unauthenticated in `NODE_ENV=production`.
