# GoSmall — URL Shortener

> **GoSmall** is a fast, minimal URL shortener built with Go and Redis. Paste any long link, generate a short one in milliseconds — with a custom alias or auto-generated code. Secured with Google OAuth and credential-based login. Clean cyberpunk UI, instant redirects, and a personal compression log. Make every link smaller.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
  - [URL Shortening Algorithm](#url-shortening-algorithm)
  - [Authentication System](#authentication-system)
  - [API Reference](#api-reference)
  - [Data Storage in Redis](#data-storage-in-redis)
- [Prerequisites](#prerequisites)
- [Setup & Running](#setup--running)
  - [Step 1 — Redis](#step-1--start-redis)
  - [Step 2 — Go Backend](#step-2--start-the-go-backend)
  - [Step 3 — React Frontend](#step-3--start-the-react-frontend)
- [Google OAuth Setup](#google-oauth-setup)
- [Environment Variables](#environment-variables)
- [Testing the API](#testing-the-api)
- [Running Tests](#running-tests)
- [Inspecting Redis Data](#inspecting-redis-data)
- [Security Notes](#security-notes)
- [Built By](#built-by)

---

## Features

- **Instant URL shortening** — SHA-256 + Base58 encoding generates an 8-character short code in microseconds
- **Custom aliases** — choose your own short code (e.g. `localhost:9808/my-portfolio`) instead of an auto-generated one
- **Google OAuth 2.0** — one-click sign-in via Google, user profile stored in Redis
- **Email + Password auth** — traditional signup/login with bcrypt-hashed passwords (cost factor 12)
- **Persistent user accounts** — all users stored permanently in Redis, no expiry
- **URL history log** — last 10 shortened links shown in-session per user
- **Cyberpunk UI** — built with React + Vite, Orbitron & Share Tech Mono fonts, animated neon aesthetic
- **Collision-safe aliases** — duplicate alias detection before saving
- **Graceful error handling** — no server crashes on bad input or missing Redis keys
- **CORS configured** — React dev server (port 3000) and Go backend (port 9808) work together seamlessly

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend language | Go 1.13+ |
| HTTP framework | Gin (`github.com/gin-gonic/gin`) |
| Database | Redis (via `github.com/go-redis/redis/v8`) |
| Password hashing | bcrypt (`golang.org/x/crypto/bcrypt`) |
| Short URL encoding | SHA-256 + Base58 (`github.com/itchyny/base58-go`) |
| Frontend framework | React 18 |
| Frontend build tool | Vite 6 |
| Authentication | Google OAuth 2.0 (GSI) + custom credentials |
| Styling | Pure CSS with CSS variables, Google Fonts |

---

## Project Structure

```
go-shortener-wm-master/
│
├── main.go                          # Entry point — Gin router, CORS, route wiring
├── go.mod                           # Go module definition and dependencies
├── go.sum                           # Dependency checksums (auto-generated)
├── .gitignore                       # Excludes node_modules, .env, Redis dumps, binaries
│
├── handler/
│   └── handlers.go                  # All HTTP handlers:
│                                    #   CreateShortUrl, HandleShortUrlRedirect
│                                    #   Register, Login, GoogleAuth
│
├── shortener/
│   ├── shorturl_generator.go        # SHA-256 + Base58 short link generator
│   └── shorturl_generator_test.go   # Unit tests for the generator
│
├── store/
│   ├── store_service.go             # Redis client init + all read/write functions
│   │                                #   URL: SaveUrlMapping, RetrieveInitialUrl, AliasExists
│   │                                #   User: SaveUser, GetUser, UserExists
│   └── store_service_test.go        # Integration tests (requires live Redis)
│
└── frontend/
    ├── index.html                   # Root HTML — loads Google GSI script, fonts
    ├── package.json                 # npm dependencies (React, Vite)
    ├── vite.config.js               # Dev server on :3000, proxies /api → :9808
    └── src/
        ├── main.jsx                 # React root mount
        ├── App.jsx                  # Entire app: AuthPage, MainApp, all components
        ├── App.css                  # All styles — cyberpunk theme, animations
        └── index.css                # CSS variables — colors, fonts, dark background
```

---

## How It Works

### URL Shortening Algorithm

When you submit a long URL, the backend runs this pipeline:

```
long_url + user_id
       │
       ▼
  SHA-256 hash (32 bytes)
       │
       ▼
  Convert to uint64 (big.Int)
       │
       ▼
  Base58 encode (Bitcoin alphabet)
       │
       ▼
  Take first 8 characters  →  e.g. "jTa4L57P"
```

The result is stored in Redis as:
```
KEY:   "jTa4L57P"
VALUE: "https://your-original-very-long-url.com/..."
TTL:   6 hours
```

When someone visits `localhost:9808/jTa4L57P`, the server looks up the key in Redis and issues a `302` redirect to the original URL.

**Custom aliases** bypass the algorithm entirely — the alias you type becomes the Redis key directly, after checking it doesn't already exist.

---

### Authentication System

GoSmall supports two sign-in methods that both end up creating a user record in Redis:

#### Google OAuth 2.0
1. User clicks the Google button on the login page
2. Google's GSI library opens a popup and the user authenticates with Google
3. Google returns a signed JWT (credential) to the frontend
4. The frontend decodes the JWT payload (base64) to extract `name`, `email`, `picture`, `sub`
5. These are sent to `POST /auth/google` on the backend
6. The backend upserts a `UserRecord` into Redis under the key `user:<email>`
7. The user object is returned and stored in React state — the app unlocks

#### Email + Password
1. **Sign Up** — user fills username, email, password, confirm password
2. Frontend sends to `POST /auth/register`
3. Backend validates inputs, checks the email isn't already registered
4. Password is hashed with `bcrypt` at cost factor 12 — the raw password is never stored
5. A `UserRecord` is saved to Redis permanently (no TTL)
6. **Login** — user submits email + password to `POST /auth/login`
7. Backend fetches the stored record, calls `bcrypt.CompareHashAndPassword()`
8. On match, returns the user object — the app unlocks

#### What's stored per user in Redis
```json
{
  "email":      "shaurya@gmail.com",
  "username":   "Shaurya",
  "password":   "$2a$12$...(bcrypt hash)...",
  "name":       "Shaurya Sharma",
  "picture":    "https://lh3.googleusercontent.com/...",
  "provider":   "password",
  "created_at": 1748300000
}
```
- `provider` is `"google"` or `"password"` — used to prevent cross-provider login confusion
- Google users have an empty `password` field (they never set one)
- Password users have an empty `picture` field unless set manually

---

### API Reference

All endpoints run on `http://localhost:9808`. The frontend proxies `/api/*` → `/*` so calls go through `/api/...` from React.

#### Auth Endpoints

| Method | Route | Body | Description |
|---|---|---|---|
| `POST` | `/auth/register` | `{ username, email, password }` | Create a new account |
| `POST` | `/auth/login` | `{ email, password }` | Login with credentials |
| `POST` | `/auth/google` | `{ name, email, picture, sub }` | Upsert a Google user |

**Register — success response:**
```json
{
  "message": "Account created successfully",
  "user": {
    "email": "shaurya@gmail.com",
    "username": "Shaurya",
    "name": "Shaurya",
    "provider": "password"
  }
}
```

**Login — error responses:**
```json
{ "error": "No account found with this email" }
{ "error": "Incorrect password" }
{ "error": "This account uses Google sign-in. Please use the Google button." }
```

#### URL Endpoints

| Method | Route | Body | Description |
|---|---|---|---|
| `GET` | `/` | — | Health check |
| `POST` | `/create-short-url` | `{ long_url, user_id, custom_alias? }` | Generate a short URL |
| `GET` | `/:shortUrl` | — | Redirect to original URL |

**Create short URL — request:**
```json
{
  "long_url": "https://www.example.com/very/long/path?query=param",
  "user_id": "shaurya@gmail.com",
  "custom_alias": "my-link"
}
```

**Create short URL — success response:**
```json
{
  "message": "short url created successfully",
  "short_url": "http://localhost:9808/my-link"
}
```

**Create short URL — error responses:**
```json
{ "error": "Alias must be between 3 and 30 characters" }
{ "error": "This alias is already taken, please choose another" }
{ "error": "Alias can only contain letters, numbers, hyphens and underscores" }
```

---

### Data Storage in Redis

GoSmall uses a single Redis database (DB 0) with two types of keys:

| Key pattern | Type | TTL | Contains |
|---|---|---|---|
| `jTa4L57P` | String | 6 hours | Original URL |
| `my-custom-alias` | String | 6 hours | Original URL |
| `user:email@example.com` | String (JSON) | None (permanent) | UserRecord JSON |

---

## Prerequisites

Install all of these before running the project:

| Tool | Min Version | Download |
|---|---|---|
| Go | 1.13 | https://golang.org/dl/ |
| Node.js | 16 | https://nodejs.org/ |
| Redis | Any | https://redis.io/download/ |
| Git | Any | https://git-scm.com/ |
| Docker *(optional, for Redis)* | Any | https://www.docker.com/ |

---

## Setup & Running

Three things must run simultaneously — each in its own terminal window.

### Step 1 — Start Redis

**Option A: Docker (easiest)**
```bash
docker run -d -p 6379:6379 --name gosmall-redis redis
```

**Option B: Locally installed Redis**
```bash
# Linux / Mac
redis-server

# Windows (if installed via MSI or WSL)
redis-server
```

**Verify Redis is alive:**
```bash
redis-cli ping
# Expected: PONG
```

---

### Step 2 — Start the Go Backend

```bash
# Navigate to project root
cd go-shortener-wm-master

# Download all Go dependencies (first time only)
go mod download

# Run the server
go run main.go
```

**Expected output:**
```
Redis started successfully: pong message = {PONG}
[GIN-debug] [WARNING] Creating an Engine instance with the Logger and Recovery middleware already attached.
[GIN-debug] POST   /auth/register
[GIN-debug] POST   /auth/login
[GIN-debug] POST   /auth/google
[GIN-debug] POST   /create-short-url
[GIN-debug] GET    /:shortUrl
[GIN-debug] Listening and serving HTTP on :9808
```

The Go server is now live at **http://localhost:9808**

---

### Step 3 — Start the React Frontend

```bash
# In a new terminal, navigate to the frontend folder
cd go-shortener-wm-master/frontend

# Install npm packages (first time only)
npm install

# Start the Vite dev server
npm run dev
```

**Expected output:**
```
  VITE v6.x.x  ready in Xms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

Open **http://localhost:3000** in your browser. You'll see the GoSmall login page.

---

## Google OAuth Setup

The Google sign-in button requires a real OAuth Client ID from Google. Without it, the button renders but clicking it won't open a popup.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. `GoSmall`)
3. Navigate to **APIs & Services → OAuth consent screen**
   - Choose **External**, fill in app name and contact email
4. Navigate to **APIs & Services → Credentials**
   - Click **+ CREATE CREDENTIALS → OAuth client ID**
   - Application type: **Web application**
   - Under **Authorized JavaScript origins** add:
     - `http://localhost:3000` (development)
     - Your production domain when deployed
5. Copy the generated **Client ID** (looks like `xxxx.apps.googleusercontent.com`)
6. Open `frontend/src/App.jsx` and paste it on line 5:

```js
const GOOGLE_CLIENT_ID = "your-client-id.apps.googleusercontent.com"
```

7. Restart the React dev server

---

## Environment Variables

Currently the Google Client ID is hardcoded in `App.jsx`. For production, move it to an environment variable:

**`frontend/.env`** (create this file — already gitignored):
```
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

**`frontend/src/App.jsx`** — replace the hardcoded string:
```js
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
```

**`frontend/.env.example`** (safe to commit — no real values):
```
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
```

---

## Testing the API

You can hit the API directly without using the UI. Use **PowerShell** on Windows:

**Health check:**
```powershell
Invoke-RestMethod -Uri "http://localhost:9808/"
```

**Register a new account:**
```powershell
Invoke-RestMethod -Uri "http://localhost:9808/auth/register" `
  -Method POST -ContentType "application/json" `
  -Body '{"username":"shaurya","email":"shaurya@gmail.com","password":"secret123"}'
```

**Login:**
```powershell
Invoke-RestMethod -Uri "http://localhost:9808/auth/login" `
  -Method POST -ContentType "application/json" `
  -Body '{"email":"shaurya@gmail.com","password":"secret123"}'
```

**Create a short URL:**
```powershell
Invoke-RestMethod -Uri "http://localhost:9808/create-short-url" `
  -Method POST -ContentType "application/json" `
  -Body '{"long_url":"https://www.google.com","user_id":"shaurya@gmail.com"}'
```

**Create with a custom alias:**
```powershell
Invoke-RestMethod -Uri "http://localhost:9808/create-short-url" `
  -Method POST -ContentType "application/json" `
  -Body '{"long_url":"https://www.google.com","user_id":"shaurya@gmail.com","custom_alias":"my-link"}'
```

**Use the short link:**
Open `http://localhost:9808/my-link` in your browser — it redirects to Google.

---

## Running Tests

```bash
# Run all tests
go test ./...

# Unit tests only — no Redis needed
go test ./shortener/...

# Integration tests — Redis must be running
go test ./store/...

# Verbose output for debugging
go test -v ./...
```

The unit tests in `shortener/` verify that the SHA-256 + Base58 algorithm always produces the same output for the same input. The integration tests in `store/` write to and read from a live Redis instance, so Redis must be running when you execute them.

---

## Inspecting Redis Data

Once users sign up and URLs are created, you can inspect all stored data directly:

```bash
# Open Redis CLI
redis-cli

# See every key in the database
KEYS *

# List only user records
KEYS user:*

# List only short URL records (everything that isn't a user)
KEYS *
# (URL keys have no prefix — they look like "jTa4L57P" or "my-link")

# Read a specific user record
GET user:shaurya@gmail.com

# Read a short URL mapping
GET jTa4L57P

# Check the TTL remaining on a short URL (in seconds)
TTL jTa4L57P

# Count total keys
DBSIZE

# Delete a specific key
DEL user:shaurya@gmail.com

# Wipe everything (careful — deletes all data)
FLUSHDB
```

---

## Security Notes

| Topic | Current status | Notes |
|---|---|---|
| Password storage | bcrypt, cost 12 | Safe for production |
| Google tokens | Decoded client-side (JWT payload) | Acceptable for this architecture |
| HTTPS | Not configured | Required before going live — use a reverse proxy (Nginx, Caddy) |
| Redis auth | No password set | Set `requirepass` in `redis.conf` before deploying |
| URL TTL | 6 hours | Increase in `store/store_service.go` → `CacheDuration` constant |
| Rate limiting | Not implemented | Add Gin middleware before deploying publicly |

---

## Built By

**Shaurya Sharma** — [github.com/ShauryaaSharma](https://github.com/ShauryaaSharma)
