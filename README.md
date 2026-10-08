# Taskboard — Task Management Web App

Full-stack task manager with user authentication, task CRUD, real-time updates (WebSockets) and a responsive UI.

## Stack
- **Backend:** Node.js (22.5+), Express, built-in `node:sqlite` database
- **Auth:** bcryptjs (password hashing) + JSON Web Tokens
- **Real-time:** `ws` WebSocket server
- **Frontend:** HTML, CSS, vanilla JavaScript (no build step)

## Run it
```bash
npm install
cp .env.example .env     # Windows: copy .env.example .env  (then set JWT_SECRET)
npm start
```
Open http://localhost:3000, create an account, and add tasks. Open the app in two tabs to see changes sync live.

## Project structure
```
task-manager/
├── server.js            # Express app + HTTP/WebSocket server
├── src/
│   ├── db.js            # SQLite connection and schema
│   ├── auth.js          # JWT sign/verify + requireAuth middleware
│   ├── realtime.js      # WebSocket connections, per-user broadcast
│   └── routes/
│       ├── auth.js      # register, login, me
│       └── tasks.js     # task CRUD
└── public/
    ├── index.html       # Auth screen, board, task dialog
    ├── style.css        # Responsive styles
    └── app.js           # API calls, rendering, WebSocket client
```

## API
All `/api/tasks` routes require `Authorization: Bearer <token>`.

| Method | Route | Purpose |
|---|---|---|
| POST | /api/auth/register | Create account `{ name, email, password }` |
| POST | /api/auth/login | Log in `{ email, password }` |
| GET | /api/auth/me | Current user |
| GET | /api/tasks | List tasks (`?status=&priority=&q=`) |
| POST | /api/tasks | Create task |
| GET | /api/tasks/:id | Get one task |
| PUT | /api/tasks/:id | Update task (partial updates allowed) |
| DELETE | /api/tasks/:id | Delete task |

Task fields: `title` (required), `description`, `status` (`todo` / `in_progress` / `done`), `priority` (`low` / `medium` / `high`), `due_date` (`YYYY-MM-DD`).

## Authorization
Every task query is filtered by the logged-in user's id, so a user can only read, edit or delete their own tasks. WebSocket events are sent only to the owner's connections.

## Deploying
Set `JWT_SECRET` and `PORT` as environment variables on your host. The SQLite file (`tasks.db`) needs persistent disk, so choose a host with a persistent volume (for example Render or Railway) rather than a serverless platform.
