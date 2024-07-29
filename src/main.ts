require("dotenv").config();
import { Context, Middleware } from "telegraf";
import { SceneContext } from "telegraf/typings/scenes";
import prisma from "../prisma/prisma";
import bot from "./core/bot";
import session from "./core/session";
import stage from "./scenes/index";
import botStart from "./utils/startBot";

bot.use(session);

const middleware: Middleware<Context | SceneContext> = (ctx: any, next) => {
  ctx?.session ?? (ctx.session = {});
};

bot.use(stage.middleware());

bot.use((ctx: any, next) => {
  console.log("next", ctx?.session);
  return next();
});

bot.start(async (ctx: any) => {
  return await ctx.scene.enter("start");
});

bot.hears(
  ["Yangi Taqdimot", "Balans", "Do'stlarimni taklif qilish", "Bosh menyu"], //  commandlar bot o'chib qolgan vaziyatda user qayta startni  bosganda javob berish uchun
  async (ctx: any) => {
    ctx.reply("Nomalum buyruq.Qayta /start buyrug'ini bosing");
  }
);

bot.on("chat_join_request", async (ctx) => {
  console.log("chat_join_request", ctx.chatJoinRequest);
  const invitedLink = String(
    ctx.chatJoinRequest.invite_link?.invite_link || "nimadir"
  );
  const userId = ctx.chatJoinRequest.from.id;
  const user = await prisma.user.findFirst({
    where: {
      telegram_id: String(userId),
    },
  });

  if (!user) {
    return;
  }

  const invitedLinkData = await prisma.invitedLink.findFirst({
    where: {
      link: invitedLink,
    },
  });

  if (!invitedLinkData) {
    return;
  }

  await ctx.approveChatJoinRequest(Number(ctx.chatJoinRequest.from.id));

  await prisma.invitedLink.update({
    where: {
      id: invitedLinkData.id,
    },
    data: {
      isActive: false,
    },
  });

  const invitedLinks = await prisma.invitedLink.findMany({
    where: {
      user_id: user.id,
      isActive: true,
    },
  });

  if (invitedLinks.length === 0) {
    await ctx.telegram.sendMessage(
      user.telegram_id,
      "Ro'yhatdagi hamma kanallarga obuna bo'ldingiz"
    );
  }
});

bot.catch(async (err: any, ctx) => {
  const userId = ctx?.from?.id;
  if (userId) {
    await bot.telegram.sendMessage(
      userId,
      "Xatolik yuz berdi. Iltimos qayta urinib ko'ring\n /start buyrug'ini bosib qayta urunib ko'ring"
    );
  }

  console.log(err);
  console.log(`Ooops, encountered an error for ${ctx}`, err);
});
botStart(bot);

process.on("uncaughtException", (error) => {
  console.log("Ushlanmagan istisno:", error, "Sabab:", new Date());
});

process.on("unhandledRejection", (reason, promise) => {
  console.log("Ushlanmagan rad etilgan va'da:", promise, "Sabab:", new Date());
});
