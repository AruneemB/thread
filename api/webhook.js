"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const grammy_1 = require("grammy");
const bot_js_1 = require("../src/bot/bot.js");
exports.default = (0, grammy_1.webhookCallback)(bot_js_1.bot, "std/http");
//# sourceMappingURL=webhook.js.map