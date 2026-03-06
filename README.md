# GRNTH VAULT

A lightweight, self-hosted Markdown knowledge base with a modern UI. Built for teams and individuals who want a powerful, private note-taking experience that runs anywhere — on your own server, in Docker, or locally.

## Features

- **Markdown Editor** — Split-view editor with live preview and syntax highlighting
- **Collections** — Organize your knowledge into separate collections
- **File & Folder Management** — Create, rename, delete, and search files and folders
- **Code Blocks** — Syntax highlighting for 190+ languages with one-click copy
- **14 Themes** — Dark, Light, GitHub, Nord, Solarized, High Contrast, Dracula, Monokai, One Dark, Catppuccin, Gruvbox, Tokyo Night, and more
- **18 Accent Colors** — Customize the look to your preference
- **Focus Mode** — Distraction-free fullscreen writing
- **View Only Mode** — Hide the editor for a clean reading experience
- **Zoom Controls** — Zoom in/out and fit-to-window for comfortable reading
- **Scroll Sync** — Editor and preview scroll in sync
- **Auto-Save** — Changes are saved automatically after 1 second of inactivity
- **Image Paste** — Paste images directly into the editor
- **Task Lists** — Interactive checkbox support in markdown
- **Bookmarks** — Bookmark files and folders for quick access
- **Two-Factor Authentication** — Optional TOTP-based 2FA (Google Authenticator, Microsoft Authenticator, Bitwarden, etc.)
- **Auto-Logout** — Configurable session timeout after inactivity
- **Backup & Restore** — Encrypted data export/import with database snapshots
- **RBAC** — Role-based access control (admin, user, viewer)
- **Security Hardened** — Helmet headers, CORS control, rate limiting
- **Self-Hosted** — Your data stays on your server

## Quick Start

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose (recommended)
- [Node.js](https://nodejs.org/) v18+ (for running without Docker)

---

### Quick Setup from Docker Hub (Fastest)

No need to clone the repo. Just create a `docker-compose.yml`:

```yaml
services:
  grnth-vault:
    image: workbabulamani/grnth-vault:v1
    ports:
      - "3000:3000"
    volumes:
      - grnth-data:/app/data
      - grnth-uploads:/app/uploads
    environment:
      - JWT_SECRET=change-me-to-a-strong-secret
      - ADMIN_EMAIL=admin@admin.com
      - ADMIN_PASSWORD=admin123
      - ENCRYPTION_KEY=change-me-encryption-key
      - SESSION_TIMEOUT=30
      - ALLOW_SIGNUP=false
      - ALLOWED_ORIGINS=*
    restart: unless-stopped

volumes:
  grnth-data:
  grnth-uploads:
```

```bash
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) — done!

---

### Building from Source (Docker)

1. **Clone the repository**

   ```bash
   git clone https://github.com/workbabulamani/GRNTH_Vault.git
   cd GRNTH_Vault
   ```

2. **Create your environment file**

   ```bash
   cp .env-sample .env
   ```

   Edit `.env` and update the values — at minimum, change these:

   ```env
   JWT_SECRET=your-strong-random-secret-here
   ADMIN_PASSWORD=your-secure-password
   ENCRYPTION_KEY=your-strong-encryption-key
   ```

   See [Environment Variables](#environment-variables) below for all options.

3. **Start the application**

   ```bash
   docker compose up -d --build
   ```

4. **Access the app** at [http://localhost:3000](http://localhost:3000)

5. **Stop the application**

   ```bash
   docker compose down
   ```

> **Data Persistence:** The `data/` and `uploads/` directories are mounted as Docker volumes, so your files and database persist across container restarts.

---

### Running without Docker

1. **Clone the repository**

   ```bash
   git clone https://github.com/workbabulamani/GRNTH_Vault.git
   cd GRNTH_Vault
   ```

2. **Create your environment file**

   ```bash
   cp .env-sample .env
   ```

   Edit `.env` and update the values as needed (see [Environment Variables](#environment-variables)).

3. **Install and build**

   ```bash
   cd server && npm install && cd ..
   cd client && npm install && npm run build && cd ..
   cp -r client/dist/* server/public/
   ```

4. **Start the server**

   ```bash
   cd server && node index.js
   ```

5. **Access the app** at [http://localhost:3001](http://localhost:3001)

---

## Environment Variables

All configuration is done via the `.env` file. See `.env-sample` for a fully commented template.

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | `fallback-secret` | Secret key for JWT token signing. **Change in production!** |
| `PORT` | `3001` (local) / `3000` (Docker) | Server port |
| `DB_PATH` | `./data/md_viewer.db` | SQLite database file path |
| `UPLOAD_DIR` | `./uploads/images` | Directory for uploaded images |
| `ENCRYPTION_KEY` | `change-me` | Encryption key for server-side backups |
| `ADMIN_EMAIL` | `admin@admin.com` | Default admin email |
| `ADMIN_PASSWORD` | `admin123` | Default admin password. **Change in production!** |
| `SESSION_TIMEOUT` | `30` | Auto-logout timeout in minutes after inactivity |
| `ALLOW_SIGNUP` | `false` | Set to `true` to allow public registration |
| `ALLOWED_ORIGINS` | `*` | CORS origins (see below) |

### `ALLOWED_ORIGINS` Examples

```env
# Allow all (local/intranet)
ALLOWED_ORIGINS=*

# Single Cloudflare Tunnel domain
ALLOWED_ORIGINS=https://vault.yourdomain.com

# Cloudflare Tunnel + local network
ALLOWED_ORIGINS=https://vault.yourdomain.com,http://192.168.1.100:3000

# Port-forwarded with dynamic DNS
ALLOWED_ORIGINS=https://myvault.duckdns.org:3000
```

## Security

- **Helmet** — Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type)
- **Rate Limiting** — 10 requests/min on login/signup/2FA, 200 requests/min general API
- **CORS** — Configurable origin whitelist via `ALLOWED_ORIGINS`
- **2FA** — Optional TOTP-based two-factor authentication
- **Signup Control** — Disable public registration; admin creates users

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, CodeMirror 6 |
| Styling | Vanilla CSS (custom design system) |
| Backend | Node.js, Express |
| Database | SQLite (via better-sqlite3) |
| Auth | JWT + TOTP 2FA |
| Security | Helmet, express-rate-limit, CORS |
| Markdown | markdown-it, highlight.js |

## License

MIT
