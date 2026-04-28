<p align="center">
  <img src="src/templates/logo.svg" width="400" alt="Thread">
</p>

<p align="center">
  <strong>Every message is a commit. Visualize your Telegram group's contribution history.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/TypeScript-6.0.2-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/grammY-1.41.1-0088CC?style=flat-square&logo=telegram&logoColor=white" alt="grammY">
  <img src="https://img.shields.io/badge/Turso-0.14.0-4ACBD0?style=flat-square&logo=sqlite&logoColor=white" alt="Turso">
  <img src="https://img.shields.io/badge/Vitest-4.1.1-6E9F18?style=flat-square&logo=vitest&logoColor=white" alt="Vitest">
  <img src="https://img.shields.io/badge/Vercel-Deployed-000000?style=flat-square&logo=vercel&logoColor=white" alt="Vercel">
</p>

---

Thread visualizes your Telegram group chats as a contribution graph, tracking streaks, activity patterns, and who keeps the conversation alive. By treating every message as a "commit," it brings a developer-centric gamification layer to social interactions.

## 🚀 Key Features

- **Contribution Graphs**: GitHub-style activity visualization for each group member.
- **Streak Tracking**: Real-time tracking of current and longest message streaks.
- **Group Statistics**: Comprehensive aggregate stats via the `/stats` command.
- **Personal Insights**: Individual performance metrics accessible through `/mystats`.
- **Share Links**: `/stats` replies include a short URL that opens an interactive live dashboard in any browser.
- **Weekly Digests**: Automated summaries sent every Monday at 09:00 UTC.
- **Serverless Architecture**: Built for high availability and low latency on Vercel.

## 🤖 Bot Commands

Interact with Thread using the following commands:

- **`/stats`**: Generates a full activity dashboard for the current group chat, showing a contribution heat-map for top active members. The reply includes a short share link that opens an interactive dashboard in any browser.
- **`/stats @username`**: Displays a single member's activity card for the group, also with a share link.
- **`/mystats`**: Sends your personal activity card for the current group directly to your DMs (keeps the group chat clean!).
- **`/tldr`**: Shows a high-level overview of Thread's capabilities with quick-action buttons.
- **`/summon`**: Pings all human administrators in the group via mention.
- **`/issue <description>`**: Sends AI-summarized feedback directly to the Thread GitHub repository as a new issue.
- **`/chat <message>`**: Have a natural language conversation with the Thread Assistant — ask questions about features, commands, or how Thread works. The assistant is injected with live group context (current stats, your activity) so responses are specific to your group. Conversation history is preserved across messages. Use `/chat reset` to start fresh.
- **`/threadhelp`**: Displays a help message with all available commands and their usage.

## 🛠 Tech Stack

Thread is built on a modern, serverless-first stack:

### Core Logic
- **Framework**: [grammY](https://grammy.dev/) for robust Telegram bot interaction.
- **Language**: TypeScript for type-safe state and command handling.
- **Database**: [Turso](https://turso.tech/) (libSQL) for distributed, low-latency SQLite storage.
- **Validation**: [Zod](https://zod.dev/) for strict schema validation of environment and data.

### Rendering & Infrastructure
- **Graphics**: Puppeteer + Chromium for high-fidelity contribution graph rendering.
- **Deployment**: Vercel for serverless function hosting and automated cron jobs.
- **Logging**: Pino for high-performance, structured logging.

### Testing
- **Framework**: Vitest for fast, reliable unit and integration testing.
- **Coverage**: Comprehensive testing of commands, middleware, and database logic.

## 🌐 Landing Page

Thread includes a client-side landing page at `public/index.html` that lets anyone visualise Telegram group activity **without running the bot or sharing data with a server**.

### Purpose

The landing page is a standalone, zero-dependency HTML file that processes Telegram Desktop JSON exports entirely in the browser. It is served as the root URL of the Vercel deployment.

### Features

- **Navigation buttons**: fixed top-right nav links — the Telegram icon opens the live bot (`@thread_aruneemb_bot`) in a new tab; the GitHub icon links to the repository.
- **File upload**: drag-and-drop or click-to-browse a Telegram Desktop export (`.json`).
- **Demo mode**: try the dashboard instantly with synthetic data — no upload required.
- **Contribution graph**: GitHub-style activity heat-map per group member — defaults to a rolling 52-week view, with per-member year navigation (‹ / ›) to browse full calendar years.
- **Streak tracking**: current and all-time longest daily message streaks, updated in-place when switching years.
- **Sorting**: sort members by total messages, current streak, or longest streak.
- **PNG export**: download the full dashboard as a high-DPI image via html2canvas.
- **Share links**: the **Copy Link** button saves the current dashboard to the database and copies a short `/?s=TOKEN` URL to the clipboard. Anyone with the link can open the same dashboard without uploading a file.
- **Help tooltip**: hover the `?` icon next to "How it works:" for step-by-step instructions on exporting chat history from Telegram Desktop.
- **Dark mode**: automatic system-preference dark/light theme.
- **Mobile responsive**: readable and usable down to 375 px viewport width.

### Usage

1. Open `https://<your-deployment>.vercel.app/` in a browser.
2. In Telegram Desktop: open the group → ☰ → Export chat history → JSON format.
3. Drag the exported `.json` file onto the upload zone, or click to browse.
4. The dashboard renders immediately — no server round-trip occurs.
5. Optionally download the dashboard as a PNG using the **Download as PNG** button.
6. Optionally share the dashboard using the **Copy Link** button — this stores a snapshot in the database and copies a short URL to your clipboard.

### Privacy

Viewing and browsing the dashboard is **100% client-side** — the exported file is read by the browser's `FileReader` API, held in JavaScript memory, and discarded when the page is closed. No data is transmitted unless you explicitly click **Copy Link**, which stores a snapshot of the rendered dashboard in the Turso database so the share URL can be resolved later.

### Browser Compatibility

| Browser | Version | Status |
|---------|---------|--------|
| Chrome / Edge | 90+ | ✅ Fully supported |
| Firefox | 88+ | ✅ Fully supported |
| Safari | 14+ | ✅ Fully supported |
| Mobile Safari (iOS) | 14+ | ✅ Fully supported |
| Chrome for Android | 90+ | ✅ Fully supported |

### Live Demo

Visit the deployed landing page at the root URL of the Vercel project (link available once deployed).

---

## 📐 Roadmap

Thread is continuously evolving. Upcoming milestones include:

- **Web Dashboard**: A standalone visual interface for historical data exploration.
- **LLM Insights**: AI-powered summaries of chat themes and sentiment analysis (conversational assistant via `/chat` is live).
- **Custom Themes**: Pluggable color schemes for contribution graphs.
- **Extended Analytics**: Heatmaps for hour-by-hour activity patterns.
- **Multiple Platform Support**: Bringing contribution graphs to Discord and Slack.

## 🚦 Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/AruneemB/thread.git
cd thread
```

### 2. Local Setup
```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your TELEGRAM_BOT_TOKEN and TURSO_DATABASE_URL

# Run in development mode (polling)
npm run dev

# Run tests
npm test
```

### 3. Deployment (Vercel)
```bash
# Create Turso database
turso db create thread-bot

# Deploy to Vercel
vercel

# Set environment variables in Vercel dashboard:
# TELEGRAM_BOT_TOKEN, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, CRON_SECRET

# Configure webhook
VERCEL_URL=your-deployment.vercel.app npm run webhook:set
```

## 📂 Project Structure

```text
├── api/                     # Vercel Serverless Functions
│   ├── webhook.ts           # Main Telegram webhook entry point
│   ├── save.ts              # POST — saves a landing page snapshot, returns short URL
│   ├── data/
│   │   └── [token].ts       # GET — returns raw JSON for a landing page snapshot
│   ├── share/
│   │   └── [token].ts       # GET — serves interactive HTML dashboard (bot share links)
│   └── cron/
│       └── digest.ts        # Scheduled weekly digest (Mondays 09:00 UTC)
├── public/
│   └── index.html           # Self-contained landing page (client-side, no dependencies)
├── src/                     # Core application logic
│   ├── bot/                 # grammY bot setup and middleware
│   ├── commands/            # Bot command handlers (/stats, /mystats)
│   ├── db/                  # Database access layer (DAL)
│   ├── renderer/            # Graph rendering logic using Puppeteer
│   ├── templates/           # HTML/SVG templates for visualizations
│   └── utils/               # Logging and shared utility functions
├── vitest.config.ts         # Testing configuration
└── vercel.json              # Vercel deployment and cron configuration
```

---

<p align="center">
  <i>Every message is a commit.</i>
</p>
