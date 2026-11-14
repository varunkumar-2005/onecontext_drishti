# Run OneContext locally on Windows

The default ports `8000` and `5173` may already be occupied. The commands below
use `8001` for the API and `5174` for Vite so they can run alongside existing
OneContext processes. Run each section in a separate PowerShell window and
leave both windows open.

## Backend

From a PowerShell window:

```powershell
Set-Location C:\Users\Suresh\Desktop\one_mem\onecontext
$bytes = New-Object byte[] 48
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$env:AUTH_SECRET = [Convert]::ToBase64String($bytes)
$rng.Dispose()
$env:ARENA_DEV_SIMULATOR = "1"
& .\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8001 --no-access-log
```

The random signing secret is process-local and is not written to a file. Keep
this backend process running; tokens issued by it are valid only while using
this process and secret. Access logging is disabled because the browser's
EventSource carries its signed token in the stream URL. Required Hindsight and
Groq settings are read from the repository's existing `.env` file.

Backend URLs:

- Health: `http://127.0.0.1:8001/health`
- API docs: `http://127.0.0.1:8001/docs`

## Frontend

Open a second PowerShell window:

```powershell
Set-Location C:\Users\Suresh\Desktop\one_mem\onecontext\frontend
$env:VITE_API_URL = "http://127.0.0.1:8001"
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Keep this process running. Open `http://127.0.0.1:5174/`.

## Open the authenticated World

1. On the Team Room page, enter a **Project Name** and optionally a room name.
   Upload a Markdown task list, enter an HTTPS GitHub repository URL, or both.
   Task files are limited to 1 MB; headings and checklist items are parsed by
   the server into quests. `##` headings define phases; a task list without
   phase headings is split into four or five ordered phases. The default task
   reward is 100 XP (editable from 10 to 500); task lines may also include
   `(xp: N)`, `@assignee`, and `due: YYYY-MM-DD`.
2. Select **Create Project, Quests & World**. The app creates a project and an
   Arena session, imports task titles through the host-only Arena API, and
   builds repository districts from GitHub paths only. Repository file contents
   are not fetched. The browser stores the signed Arena token and session ID in
   local storage; do not copy a token into source code or share it.
3. The app opens Arena. Use **World** in the top navigation, or navigate to
   `http://127.0.0.1:5174/world`. The World screen uses the stored session ID
   and signed token for API calls and its SSE connection.

The Team Room's **Join with a Code** joins collaboration chat. To join its Arena
session, teammates must also use the Arena join code displayed in Arena. Arena
quest and repository imports require the signed host token. Imported quests
remain unverified until a server-verified event or audited host approval.
The authenticated `GET /arena/sessions/{session_id}/roadmap` endpoint returns
phase-linked quests, locks, progress, stars, and achievements. The
`POST /arena/sessions/{session_id}/quests/{quest_id}/approve` endpoint is for
host-approval quests only, is audit-logged, and rejects self-approval. The
existing folder Code Map is separate from phases; its folders are not quest
destinations.

The session join code is displayed by Arena and can be shared with another
local participant. It expires according to `SESSION_JOIN_CODE_TTL_HOURS`.

## Live path-only watcher

Run the watcher from the repository root in another PowerShell window. Use the
signed token for a joined Arena member and the session ID shown by Arena. The
watcher prompts for confirmation before sending metadata-only events:

```powershell
Set-Location C:\Users\Suresh\Desktop\one_mem\onecontext
& .\.venv\Scripts\python.exe .\scripts\onecontext_watch.py --server http://127.0.0.1:8001 --session <SESSION_ID> --token <SIGNED_ARENA_TOKEN> --repo . --interval 5
```

Do not put real token values in checked-in files or command transcripts. The
optional simulator API is intended only for local development and its events
are labeled `SIMULATED`.
