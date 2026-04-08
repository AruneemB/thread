<p align="center">
  <img src="src/templates/logo.svg" width="600" alt="Thread logo">
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
- **Weekly Digests**: Automated summaries sent every Monday at 09:00 UTC.
- **Serverless Architecture**: Built for high availability and low latency on Vercel.

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

## 📐 Roadmap

Thread is continuously evolving. Upcoming milestones include:

- **Web Dashboard**: A standalone visual interface for historical data exploration.
- **LLM Insights**: AI-powered summaries of chat themes and sentiment analysis.
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
├── api/                # Vercel Serverless Functions (Webhooks & Cron)
│   ├── webhook.ts      # Main Telegram webhook entry point
│   └── cron/           # Scheduled jobs (Weekly digest)
├── src/                # Core application logic
│   ├── bot/            # grammY bot setup and middleware
│   ├── commands/       # Bot command handlers (/stats, /mystats)
│   ├── db/             # Database access layer (DAL)
│   ├── renderer/       # Graph rendering logic using Puppeteer
│   ├── templates/      # HTML/SVG templates for visualizations
│   └── utils/          # Logging and shared utility functions
├── vitest.config.ts    # Testing configuration
└── vercel.json         # Vercel deployment and cron configuration
```

---

<p align="center">
  <i>Every message is a commit.</i>
</p>
