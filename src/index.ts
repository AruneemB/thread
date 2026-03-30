import "dotenv/config";
import { bot } from "./bot/bot.js";
import { startScheduler } from "./scheduler/scheduler.js";

bot.start();
startScheduler(bot);
