"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const scheduler_js_1 = require("../../src/scheduler/scheduler.js");
async function handler(req, res) {
    // Vercel Cron sends Authorization header with CRON_SECRET
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    try {
        await (0, scheduler_js_1.runWeeklyDigest)();
        return res.status(200).json({ ok: true });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ error: message });
    }
}
//# sourceMappingURL=digest.js.map