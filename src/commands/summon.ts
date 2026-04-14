import { Composer } from "grammy";
import { logger } from "../utils/logger.js";

const log = logger.child({ module: "summon" });

export const summonComposer = new Composer();

/**
 * Creative command name: /summon
 * Description: Pings all administrators of the group.
 */
summonComposer.command("summon", async (ctx) => {
  if (ctx.chat.type === "private") {
    await ctx.reply("This command only works in groups!");
    return;
  }

  log.info({ chat_id: ctx.chat.id, user_id: ctx.from?.id }, "Summon command received");

  try {
    const admins = await ctx.getChatAdministrators();
    
    // Filter out bots and extract usernames or markdown mentions
    const adminMentions = admins
      .filter((admin) => !admin.user.is_bot)
      .map((admin) => {
        if (admin.user.username) {
          return `@${admin.user.username}`;
        }
        // Fallback to markdown mention if no username is available
        const firstName = admin.user.first_name.replace(/[_*[\]()]/g, "\\$&"); // Escape markdown characters
        return `[${firstName}](tg://user?id=${admin.user.id})`;
      });

    if (adminMentions.length === 0) {
      await ctx.reply("No human admins found to summon!");
      log.info({ chat_id: ctx.chat.id }, "No human admins found for summon");
      return;
    }

    const mentionString = adminMentions.join(" ");
    const responseText = `Pinging the admins\\.\\.\\.\n\n${mentionString}`;

    await ctx.reply(responseText, {
      parse_mode: "MarkdownV2",
    });
    
    log.info({ 
      chat_id: ctx.chat.id, 
      admin_count: adminMentions.length 
    }, "Summon successful");
  } catch (err) {
    log.error({ err, chat_id: ctx.chat.id }, "Summon command failed");
    await ctx.reply("Failed to summon the council. Ensure I have the necessary group permissions.");
  }
});
