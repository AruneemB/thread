module.exports = {
  apps: [
    {
      name: "thread",
      script: "dist/index.js",
      env: {
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
        DATABASE_PATH: process.env.DATABASE_PATH,
        LOG_LEVEL: process.env.LOG_LEVEL,
      },
    },
  ],
};
