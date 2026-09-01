# GREED.exe

> Collect. Risk. Fight. Steal. Bank. Meltdown. Repeat.

A real-time multiplayer browser arena game. Players collect glowing BITS, bank them before getting knocked around, and compete through a chaotic **SERVER MELTDOWN** finale every round.

---

## Quick Start (Local Development)

You need two terminals — one for the server, one for the client.

### 1. Server

```bash
cd server
npm install
npm run dev
```

Server starts on `http://localhost:3000`.  
Health check: `http://localhost:3000/health`

### 2. Client

```bash
cd client
npm install
npm run dev
```

Client starts on `http://localhost:5173`.

Open **two or more browser tabs** at `http://localhost:5173` to test multiplayer locally.

### Environment Variables

The client needs to know where the server is.

**Local development** — no setup needed. It defaults to `ws://localhost:3000`.

**Production** — set `VITE_SERVER_URL` in Netlify's environment variables (see below).

Copy the example env file if you want to customise locally:

```bash
cp client/.env.example client/.env.local
```

---

## Project Structure

```
GREED-exe/
├── shared/                   # Shared between client and server
│   ├── constants.js          # All game config values
│   └── messages.js           # Network message protocol
│
├── server/                   # Node.js game server (deploy to Render)
│   ├── server.js             # Entry point
│   ├── networking/
│   │   └── ConnectionManager.js
│   ├── rooms/
│   │   ├── RoomManager.js
│   │   └── GameRoom.js
│   ├── players/
│   │   ├── Player.js
│   │   └── PlayerManager.js
│   ├── bits/
│   │   └── BitManager.js
│   ├── combat/
│   │   └── CombatManager.js
│   ├── upgrades/
│   │   ├── UpgradeDefinitions.js
│   │   └── UpgradeManager.js
│   ├── game/
│   │   ├── RoundManager.js
│   │   └── MeltdownManager.js
│   └── persistence/
│       └── PlayerRepository.js
│
└── client/                   # Three.js browser client (deploy to Netlify)
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.js
        ├── Game.js
        ├── networking/
        ├── player/
        ├── world/
        ├── combat/
        ├── effects/
        ├── audio/
        └── ui/
```

---

## Deploying to Render (Server)

### Manual deploy via Render dashboard

1. Push this repository to GitHub.
2. Go to [render.com](https://render.com) → **New → Web Service**.
3. Connect your GitHub repository.
4. Configure the service:

| Setting | Value |
|---|---|
| **Name** | `greed-exe` (or any name you like) |
| **Root Directory** | `server` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | Free (or paid for better performance) |

5. No environment variables are required for a basic deployment.
   - `PORT` is set automatically by Render.
6. Click **Deploy**. Render will give you a URL like:
   ```
   https://greed-exe.onrender.com
   ```
7. Verify it works:
   ```
   https://greed-exe.onrender.com/health
   ```
   Expected response:
   ```json
   { "status": "ok", "rooms": 1, "players": 0 }
   ```

### Blueprint deploy (one-click)

A `render.yaml` Blueprint file is included in the root. You can use it to deploy with:

```
render blueprint apply
```

or by connecting it in the Render dashboard under **Blueprints**.

### Notes on Render free tier

- Free services **spin down after ~15 minutes of inactivity**. The first connection after a cold start may take 20–30 seconds.
- The client handles this gracefully — it shows **"WAKING SERVER..."** and retries automatically. Players don't need to refresh.
- For a production game with real players, upgrade to a paid Render instance to avoid cold starts.

---

## Deploying to Netlify (Client)

### Option A — Netlify CLI

```bash
cd client
npm run build
npx netlify deploy --prod --dir=dist
```

### Option B — Netlify dashboard

1. Go to [netlify.com](https://netlify.com) → **Add new site → Import from Git**.
2. Connect your repository.
3. Configure the build settings:

| Setting | Value |
|---|---|
| **Base directory** | `client` |
| **Build command** | `npm run build` |
| **Publish directory** | `client/dist` |

4. Add the environment variable **before** building:

| Variable | Value |
|---|---|
| `VITE_SERVER_URL` | `wss://greed-exe.onrender.com` |

   > Replace `greed-exe.onrender.com` with your actual Render service URL.
   > The prefix **must** be `wss://` (WebSocket Secure) for production.

5. Deploy. Netlify will build and publish automatically.

A `netlify.toml` config file is included in the `client/` folder — Netlify will pick it up automatically.

---

## Testing Multiplayer

### Local (two tabs)

1. Start both server and client (see Quick Start above).
2. Open `http://localhost:5173` in **Tab 1** — enter a name and join.
3. Open `http://localhost:5173` in **Tab 2** — enter a different name and join.
4. Both players should see each other. Move around, collect BITS, attack.

### Production (two devices or tabs)

1. Deploy server to Render, client to Netlify.
2. Set `VITE_SERVER_URL=wss://your-render-url.onrender.com` in Netlify.
3. Open the Netlify URL in two browser tabs or on two devices.

### Verifying the success scenario

Run through this checklist to confirm everything works:

- [ ] Player A and B both see each other in the arena
- [ ] Player A collects BITS — Player B can see the count change
- [ ] Player A walks into a bank zone — banking bar appears
- [ ] Player B attacks Player A — knockback fires, bits scatter on death
- [ ] Player B collects the dropped BITS — becomes Most Wanted
- [ ] Meltdown countdown reaches 0 — MELTDOWN begins
- [ ] Round ends — results screen shows rankings and awards
- [ ] GREED button appears — jackpot/bust animation plays
- [ ] Next round starts without refreshing the page

---

## Environment Variables Reference

### Server (`server/`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP/WS port. Set automatically by Render. |

### Client (`client/`)

| Variable | Default | Description |
|---|---|---|
| `VITE_SERVER_URL` | `ws://localhost:3000` | WebSocket URL of the game server. Use `wss://` in production. |

---

## Upgrading Persistence

The game ships with an **in-memory** player store (`server/persistence/PlayerRepository.js`). This means player stats and CHIPS are lost when the server restarts.

To add real persistence:

1. Create a PostgreSQL database (e.g. on [Neon](https://neon.tech) or [Railway](https://railway.app)).
2. Run the schema in the comment block at the bottom of `PlayerRepository.js`.
3. Replace the in-memory `Map` with `pg` Pool queries — the interface (`getProfile`, `upsertProfile`, `updateProfile`, `getLeaderboard`) stays identical.
4. Add `DATABASE_URL` as an environment variable in Render.

---

## Controls

| Key | Action |
|---|---|
| `WASD` | Move |
| Mouse | Look around |
| Left click | Attack |
| `Space` | Jump |
| `Shift` | Sprint |
| `F` or `Q` | Dash |
| Walk into bank zone | Auto-bank held BITS |
| `Esc` | Release mouse cursor |

---

## Architecture Notes

- **Server-authoritative**: The server controls all scoring, BIT pickups, banking, combat, timers, and upgrades. The client only renders and sends inputs.
- **No audio files**: All sounds are synthesised with the Web Audio API. The game works with zero asset downloads.
- **No database required**: Guest IDs are stored in `localStorage`. Full account persistence can be added later without changing the network protocol.
- **Multiple rooms**: The server supports up to 12 players per room and automatically creates new rooms as needed.
