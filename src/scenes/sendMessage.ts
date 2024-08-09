import { Scenes } from "telegraf";
import prisma from "../../prisma/prisma";

const scene = new Scenes.BaseScene("sendMessage");

scene.hears("/start", async (ctx: any) => {
  return await ctx.scene.enter("start");
});

scene.action("send_to_all", async (ctx: any) => {
  ctx.scene.state.sendMode = "all";
  await ctx.editMessageText(
    "Barcha foydalanuvchilarga yuboriladigan xabarni kiriting:"
  );
});

scene.action("send_to_one", async (ctx: any) => {
  ctx.scene.state.sendMode = "one";
  await ctx.editMessageText(
    "Xabar yuboriladigan foydalanuvchining Telegram ID'sini kiriting:"
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
      await ctx.reply("Endi foydalanuvchining Telegram ID'sini kiriting:");
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
        `Error sending message to user ${user.telegram_id}:`,
        error
      );
      failCount++;
    }
  }

  await ctx.reply(
    `Xabar yuborish yakunlandi:\n✅ Muvaffaqiyatli: ${successCount}\n❌ Muvaffaqiyatsiz: ${failCount}`
  );
  ctx.scene.state = {};
}
async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendMessageToOne(ctx: any, message: string, userId: string) {
  try {
    await ctx.telegram.sendMessage(userId, message);
    await ctx.reply("Xabar muvaffaqiyatli yuborildi.");
  } catch (error) {
    console.error(`Error sending message to user ${userId}:`, error);
    await ctx.reply(
      "Xabar yuborishda xatolik yuz berdi. Foydalanuvchi ID'sini tekshiring va qaytadan urinib ko'ring."
    );
  }
  ctx.scene.state = {};
}

// Xavfsizlik uchun, faqat ma'lum foydalanuvchilar (adminlar) uchun ruxsat berish
function isAdmin(userId: string) {
  // Bu yerda admin foydalanuvchilar ro'yxatini tekshirish kerak
  const adminIds = ["ADMIN_ID_1", "ADMIN_ID_2"]; // Admin ID'larini kiriting
  return adminIds.includes(userId);
}

export default scene;
