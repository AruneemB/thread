import "dotenv/config";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

logger.info("Thread starting...");
