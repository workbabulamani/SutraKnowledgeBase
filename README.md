# GRNTH VAULT

A lightweight, self-hosted Markdown knowledge base with a modern UI. Built for teams and individuals who want an Obsidian-like experience that runs anywhere — on your own server, in Docker, or locally.

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

### Running with Docker (Recommended)

1. **Clone the repository**

   ```bash
   git clone https://github.com/workbabulamani/GRNTH_Vault.git
   cd GRNTH_Vault
   ```

2. **Configure environment**

   Edit `docker-compose.yml` or `.env`:

   ```yaml
   environment:
     - JWT_SECRET=your-strong-secret-here
     - ADMIN_EMAIL=admin@example.com
     - ADMIN_PASSWORD=your-secure-password
     - SESSION_TIMEOUT=30
     - ALLOW_SIGNUP=false
     - ALLOWED_ORIGINS=*
   ```

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

1. **Clone and install**

   ```bash
   git clone https://github.com/workbabulamani/GRNTH_Vault.git
   cd GRNTH_Vault

   cd server && npm install && cd ..
   cd client && npm install && npm run build && cd ..
   cp -r client/dist/* server/public/
   ```

2. **Configure environment**

   Edit `.env` in the project root:

   ```env
   JWT_SECRET=your-strong-secret-here
   PORT=3001
   DB_PATH=./data/md_viewer.db
   UPLOAD_DIR=./uploads/images
   ENCRYPTION_KEY=change-me-use-a-strong-key
   ADMIN_EMAIL=admin@admin.com
   ADMIN_PASSWORD=admin123
   SESSION_TIMEOUT=30
   ALLOW_SIGNUP=false
   ALLOWED_ORIGINS=*
   ```

3. **Start the server**

   ```bash
   cd server && node index.js
   ```

---

## Environment Variables

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
| `ALLOWED_ORIGINS` | `*` | CORS origins — `*` for all, or comma-separated domains (e.g. `https://vault.example.com,http://192.168.1.5:3001`) |

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
