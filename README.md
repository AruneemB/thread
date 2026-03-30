<p align="center">
  <img src="src/templates/logo.svg" width="380" alt="Thread" />
</p>

<p align="center"><em>Every message is a commit.</em></p>

Thread visualizes your Telegram group chats as a contribution graph, tracking streaks, activity patterns, and who keeps the conversation alive.

## Features

- **Contribution Graphs**: GitHub-style activity visualization for each member
- **Streak Tracking**: Current and longest message streaks
- **Group Statistics**: Aggregate stats with `/stats` command
- **Personal Insights**: Individual stats with `/mystats` command
- **Weekly Digests**: Automated weekly summaries sent to active chats (Mondays at 09:00 UTC)

## Prerequisites

- Node.js 20 or higher
- npm (comes with Node.js)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/thread.git
   cd thread
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` and add your Telegram bot token:
   ```
   TELEGRAM_BOT_TOKEN=your_token_here
   ```

## Build & Run

Build the project:
```bash
npm run build
```

Run the bot:
```bash
npm start
```

Or use PM2 for production:
```bash
pm2 start pm2.config.js
```

## Available Commands

| Command | Description |
|---------|-------------|
| `/stats` | Show contribution graph and activity for all group members |
| `/stats @username` | Show stats for a specific member |
| `/mystats` | Show your personal statistics |
| `/threadhelp` | Display help information |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | (required) | Your Telegram bot token from [@BotFather](https://t.me/botfather) |
| `DATABASE_PATH` | `./thread.db` | SQLite database file path |
| `LOG_LEVEL` | `info` | Logging level (`debug`, `info`, `warn`, `error`) |
| `RENDER_TIMEOUT_MS` | `15000` | Playwright render timeout in milliseconds |
| `STATS_COOLDOWN_SECONDS` | `600` | Cooldown between stats requests (per user) |
| `WEEKLY_DIGEST_ENABLED` | `true` | Enable/disable weekly digest job |
