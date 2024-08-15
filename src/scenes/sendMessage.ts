import { Scenes } from "telegraf";
import prisma from "../../prisma/prisma";

const scene = new Scenes.BaseScene("sendMessage");

scene.hears("/start", async (ctx: any) => {
  return await ctx.scene.enter("start");
});

scene.action("send_to_all", async (ctx: any) => {
  ctx.scene.state.sendMode = "all";
  await ctx.editMessageText(
    "Введите сообщение для отправки всем пользователям:"
  );
});

scene.action("send_to_one", async (ctx: any) => {
  ctx.scene.state.sendMode = "one";
  await ctx.editMessageText(
    "Введите Telegram ID пользователя, которому нужно отправить сообщение:"
  );
});

scene.on("text", async (ctx: any) => {
  if (ctx.scene.state.sendMode === "all") {
    await sendMessageToAll(ctx, ctx.message.text);
  } else if (ctx.scene.state.sendMode === "one") {
    if (ctx.scene.state.waitingForUserId) {
      await sendMessageToOne(
        ctx,
        ctx.scene.state.messageText,
        ctx.message.text
      );
    } else {
      ctx.scene.state.waitingForUserId = true;
      ctx.scene.state.messageText = ctx.message.text;
      await ctx.reply("Теперь введите Telegram ID пользователя:");
    }
  }
});

async function sendMessageToAll(ctx: any, message: any) {
  const users = await prisma.user.findMany();
  let successCount = 0;
  let failCount = 0;

  for (const user of users) {
    try {
      await ctx.telegram.sendMessage(user.telegram_id, message);
      successCount++;
      await sleep(1000);
    } catch (error) {
      console.error(
        `Ошибка отправки сообщения пользователю ${user.telegram_id}:`,
        error
      );
      failCount++;
    }
  }

  await ctx.reply(
    `Отправка сообщений завершена:\n✅ Успешно: ${successCount}\n❌ Неудачно: ${failCount}`
  );
  ctx.scene.state = {};
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendMessageToOne(ctx: any, message: string, userId: string) {
  try {
    await ctx.telegram.sendMessage(userId, message);
    await ctx.reply("Сообщение успешно отправлено.");
  } catch (error) {
    console.error(`Ошибка отправки сообщения пользователю ${userId}:`, error);
    await ctx.reply(
      "Произошла ошибка при отправке сообщения. Проверьте ID пользователя и попробуйте снова."
    );
  }
  ctx.scene.state = {};
}

// Для безопасности, разрешить доступ только определенным пользователям (админам)
function isAdmin(userId: string) {
  // Здесь нужно проверить список администраторов
  const adminIds = ["ADMIN_ID_1", "ADMIN_ID_2"]; // Введите ID администраторов
  return adminIds.includes(userId);
}

export default scene;
