import { Composer, InputFile } from "grammy";
import { getDailyCountsForUser, computeStreaks, getTotalMessages } from "../logic/stats.js";
import { renderer, type DashboardData } from "../renderer/renderer.js";
import { buildMemberData, formatDateRange } from "./stats.js";

export const mystatsComposer = new Composer();

mystatsComposer.command("mystats", async (ctx) => {
  if (!ctx.from) return;

  const chatId = String(ctx.chat.id);
  const userId = String(ctx.from.id);
  const firstName = ctx.from.first_name;
  const groupName = ctx.chat.title ?? "Group Chat";

  const total = getTotalMessages(chatId, userId);
  if (total === 0) {
    await ctx.reply("I don't have any stats for you in this chat yet.");
    return;
  }

  const dailyCounts = getDailyCountsForUser(chatId, userId, 52);
  const streaks = computeStreaks(dailyCounts);
  const memberData = buildMemberData(
    { user_id: userId, first_name: firstName, totalCount: total },
    dailyCounts,
    streaks,
    total,
  );

  const dashboardData: DashboardData = {
    groupName,
    dateRange: formatDateRange(),
    sortBy: "messages",
    members: [memberData],
  };

  let png: Buffer;
  try {
    png = await renderer.render(dashboardData);
  } catch {
    await ctx.reply("Something went wrong generating your stats.");
    return;
  }

  try {
    await ctx.api.sendPhoto(ctx.from.id, new InputFile(png, "thread-stats.png"), {
      caption: `Thread — your activity in ${groupName}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Forbidden")) {
      await ctx.reply("Send me a DM first so I can reply privately.");
    } else {
      await ctx.reply("Something went wrong sending your stats.");
    }
  }
});
