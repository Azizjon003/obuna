import { Markup, Scenes } from "telegraf";
import prisma from "../../prisma/prisma";
import bot from "../core/bot";
import { keyboards } from "../utils/keyboards";
import { merchant_keyboard } from "./start";

const scene = new Scenes.BaseScene("merchant");

// Merchant user uchun statistika ko'rsatish
scene.hears("Foydalanuvchilar ro'yxati", async (ctx) => {
  const merchantUserId = String(ctx.from.id);
  await showMerchantStatistics(ctx, merchantUserId); // 1-sahifadan boshlaymiz
});

async function showMerchantStatistics(ctx: any, merchantUserId: string) {
  const ITEMS_PER_PAGE = 10;

  try {
    const merchantUser = await prisma.user.findFirst({
      where: {
        telegram_id: String(merchantUserId),
        role: "MERCHANT",
      },
    });

    if (!merchantUser) {
      return ctx.reply("Siz merchant user emassiz");
    }

    const channelBundles = await prisma.channelBundle.findMany({
      where: {
        merchantUserId: merchantUser.id,
      },
      include: {
        subscriptions: {
          include: {
            user: true,
          },
        },
      },
    });

    if (channelBundles.length === 0) {
      return ctx.reply("Sizda hali to'plamlar mavjud emas");
    }

    let totalSubscribers = 0;
    let activeSubscribers = 0;
    let totalRevenue = 0;

    channelBundles.forEach((bundle) => {
      totalSubscribers += bundle.subscriptions.length;
      activeSubscribers += bundle.subscriptions.filter(
        (sub) => sub.status === "ACTIVE"
      ).length;
      totalRevenue +=
        bundle.subscriptions.filter((sub) => sub.status === "ACTIVE").length *
        bundle.price;
    });

    let text = "📊 Umumiy statistika:\n\n";
    text += `📦 To'plamlar soni: ${channelBundles.length}\n`;
    text += `👥 Jami obunchilar: ${totalSubscribers}\n`;
    text += `✅ Faol obunchilar: ${activeSubscribers}\n`;
    text += `💰 Jami daromad: ${totalRevenue} so'm\n\n`;

    ctx.reply(text);
  } catch (error) {
    console.error("Error in showMerchantStatistics:", error);
    ctx.reply("Xatolik yuz berdi");
  }
}

// To'plamlar ro'yxatini ko'rsatish
scene.hears("To'plamlar ro'yxati", async (ctx) => {
  await showBundles(ctx, 1); // 1-sahifadan boshlaymiz
});

scene.hears("To'lovlar ro'yhati", async (ctx) => {
  const userId = ctx.from.id;

  try {
    const user = await prisma.user.findUnique({
      where: { telegram_id: userId.toString() },
      include: { merchantWallet: true },
    });

    if (!user || user.role !== "MERCHANT") {
      return ctx.reply("Sizda bu amalni bajarish uchun huquq yo'q.");
    }

    if (!user.merchantWallet) {
      // Merchant uchun wallet yaratish
      await prisma.merchantWallet.create({
        data: {
          merchantUserId: user.id,
        },
      });
      return ctx.reply(
        "Sizning hisobingiz yaratildi. Iltimos, qaytadan urinib ko'ring."
      );
    }

    // Wallet balansini olish
    const wallet = await prisma.merchantWallet.findUnique({
      where: { merchantUserId: user.id },
    });

    if (!wallet) {
      return ctx.reply("Qaytadan botni ishlatib ko'ring");
    }

    let message = `Joriy balans: ${wallet.balance} so'm\n\n`;
    message +=
      "Pulni yechib olish uchun so'rov yuborish uchun 'Pul yechish' tugmasini bosing.";

    ctx.reply(message, {
      reply_markup: {
        keyboard: [
          [{ text: "Pul yechish" }, { text: "Tarixni ko'rish" }],
          [{ text: "Orqaga" }],
        ],
        resize_keyboard: true,
      },
    });
  } catch (error) {
    console.error("Xatolik yuz berdi:", error);
    ctx.reply("Xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring.");
  }
});

scene.hears("Pul yechish", async (ctx) => {
  const userId = ctx.from.id;

  try {
    const user = await prisma.user.findUnique({
      where: { telegram_id: userId.toString() },
      include: { merchantWallet: true },
    });

    if (!user || user.role !== "MERCHANT" || !user.merchantWallet) {
      return ctx.reply("Sizda bu amalni bajarish uchun huquq yo'q.");
    }

    const wallet = user.merchantWallet;

    if (!wallet) {
      return ctx.reply("Qayta botni ishga tushuring");
    }
    if (wallet.balance <= 0) {
      return ctx.reply("Yechib olish uchun mablag' mavjud emas.");
    }

    // Yangi pul yechish so'rovini yaratish
    const withdrawalRequest = await prisma.withdrawalRequest.create({
      data: {
        walletId: wallet.id,
        amount: wallet.balance,
      },
    });

    // Walletdan balansni nolga tushirish
    await prisma.merchantWallet.update({
      where: { id: wallet.id },
      data: { balance: 0 },
    });

    // Adminga xabar yuborish
    const adminTelegramId = "ADMIN_TELEGRAM_ID";
    bot.telegram.sendMessage(
      adminTelegramId,
      `Yangi pul yechish so'rovi:\n\nMerchant: ${
        user.name || user.username
      }\nMiqdor: ${withdrawalRequest.amount} so'm`
    );

    ctx.reply(
      `So'rovingiz qabul qilindi. ${withdrawalRequest.amount} so'm miqdoridagi to'lov tez orada amalga oshiriladi.`
    );
  } catch (error) {
    console.error("Xatolik yuz berdi:", error);
    ctx.reply("Xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring.");
  }
});

scene.hears("Tarixni ko'rish", async (ctx) => {
  const userId = ctx.from.id;

  try {
    const user = await prisma.user.findUnique({
      where: { telegram_id: userId.toString() },
      include: { merchantWallet: true },
    });

    if (!user || user.role !== "MERCHANT" || !user.merchantWallet) {
      return ctx.reply("Sizda bu amalni bajarish uchun huquq yo'q.");
    }

    // So'nggi 10 ta pul yechish so'rovlarini olish
    const withdrawalRequests = await prisma.withdrawalRequest.findMany({
      where: { walletId: user.merchantWallet.id },
      orderBy: { created_at: "desc" },
      take: 10,
    });

    if (withdrawalRequests.length === 0) {
      return ctx.reply("📜 Hozircha pul yechish tarixi mavjud emas.");
    }

    let message = "📊 Pul yechish tarixi:\n\n";

    withdrawalRequests.forEach((request, index) => {
      const statusEmoji = {
        PENDING: "⏳",
        COMPLETED: "✅",
        FAILED: "❌",
      }[request.status];

      message += `${index + 1}. ${statusEmoji} ${request.amount} so'm\n`;
      message += `   📅 Sana: ${request.created_at.toLocaleString()}\n`;
      message += `   🏷️ Status: ${getStatusText(request.status)}\n\n`;
    });

    const currentBalance = user.merchantWallet.balance;
    message += `\n💰 Joriy balans: ${currentBalance} so'm`;

    ctx.reply(message, {
      reply_markup: {
        keyboard: [
          [{ text: "To'lovlar ro'yhati" }],
          [{ text: "Pul yechish" }],
          [{ text: "Orqaga" }],
        ],
        resize_keyboard: true,
      },
    });
  } catch (error) {
    console.error("Xatolik yuz berdi:", error);
    ctx.reply("Xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring.");
  }
});

function getStatusText(status: string) {
  switch (status) {
    case "PENDING":
      return "Kutilmoqda";
    case "COMPLETED":
      return "Bajarildi";
    case "FAILED":
      return "Rad etildi";
    default:
      return "Noma'lum";
  }
}
scene.hears("Orqaga", async (ctx) => {
  ctx.reply("Bosh menyu", keyboards(merchant_keyboard));
});

// Pagination uchun action
scene.action(/^bundles_page_(\d+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  await showBundles(ctx, page);
  await ctx.answerCbQuery();
});

// To'plam ma'lumotlarini ko'rish
scene.action(/^view_bundle_/, async (ctx: any) => {
  console.log(ctx.update.callback_query.data, "nimadir");
  const bundleId = ctx.update.callback_query.data.split("_")[2];

  try {
    const bundle = await prisma.channelBundle.findUnique({
      where: { id: bundleId },
      include: { channels: true },
    });

    if (!bundle) {
      return ctx.answerCbQuery("To'plam topilmadi");
    }

    const botUsername = ctx.botInfo?.username || ctx.me;
    const shareUrl = `https://t.me/${botUsername}?start=${bundle.id}`;
    let text = `📦 To'plam: ${bundle.name}\n\n`;
    text += `💰 Narx: ${bundle.price} so'm\n`;
    text += `📝 Tavsif: ${bundle.description || "Mavjud emas"}\n\n`;
    text += `Kanallarga qo'shilish uchun url ${shareUrl}\n`; //share url
    text += `📢 Kanallar (${bundle.channels.length}):\n`;
    bundle.channels.forEach((channel, index) => {
      text += `${index + 1}. ${channel.name} - ${channel.telegram_id}\n`;
    });

    const inlineKeyboard = [
      [Markup.button.callback("✏️ Tahrirlash", `edit_bundle_${bundleId}`)],
      [Markup.button.callback("🗑️ O'chirish", `delete_bundle_${bundleId}`)],
      [Markup.button.callback("⬅️ Orqaga", "back_to_bundles")],
    ];

    await ctx.editMessageText(text, Markup.inlineKeyboard(inlineKeyboard));
    await ctx.answerCbQuery();
  } catch (error) {
    console.error("Error in view_bundle:", error);
    await ctx.answerCbQuery(
      "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
    );
  }
});

// To'plamni tahrirlash
scene.action(/^edit_bundle_/, async (ctx: any) => {
  console.log(ctx.update.callback_query.data, "edit nimadir");
  const bundleId = ctx.update.callback_query.data.split("_")[2];
  ctx.scene.enter("editBundle", { bundleId });
  await ctx.answerCbQuery();
});

// Yangi to'plam yaratish
scene.action("create_new_bundle", async (ctx: any) => {
  ctx.scene.enter("createBundle");
  await ctx.answerCbQuery();
});

// To'plamni o'chirish
scene.action(/^delete_bundle_/, async (ctx: any) => {
  const bundleId = ctx.update.callback_query.data.split("_")[2];

  try {
    await prisma.channelBundle.delete({
      where: { id: bundleId },
    });

    await ctx.answerCbQuery("To'plam muvaffaqiyatli o'chirildi");
    await showBundles(ctx, 1);
  } catch (error) {
    console.error("Error in delete_bundle:", error);
    await ctx.answerCbQuery(
      "To'plamni o'chirishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
    );
  }
});

// Orqaga qaytish
scene.action("back_to_bundles", async (ctx) => {
  await showBundles(ctx, 1);
  await ctx.answerCbQuery();
});
export async function showBundles(ctx: any, page: number) {
  const ITEMS_PER_PAGE = 5;
  const merchantUserId = ctx.from.id;

  try {
    const merchantUser = await prisma.user.findFirst({
      where: {
        telegram_id: String(merchantUserId),
        role: "MERCHANT",
      },
    });

    if (!merchantUser) {
      return ctx.reply("Siz merchant user emassiz");
    }

    const totalBundles = await prisma.channelBundle.count({
      where: { merchantUserId: merchantUser.id },
    });

    const bundles = await prisma.channelBundle.findMany({
      where: { merchantUserId: merchantUser.id },
      skip: (page - 1) * ITEMS_PER_PAGE,
      take: ITEMS_PER_PAGE,
      include: { channels: true },
    });

    if (bundles.length === 0 && page === 1) {
      return ctx.reply(
        "Sizda hali to'plamlar mavjud emas. Yangi to'plam yaratish uchun 'Yangi to'plam' tugmasini bosing.",
        Markup.keyboard([["Yangi to'plam yaratish"], ["Orqaga"]]).resize()
      );
    }

    let text = "📦 Sizning to'plamlaringiz:\n\n";
    const inlineKeyboard = [];

    bundles.forEach((bundle, index) => {
      text += `${(page - 1) * ITEMS_PER_PAGE + index + 1}. ${bundle.name}\n`;
      text += `   💰 Narx: ${bundle.price} so'm\n`;
      text += `   📢 Kanallar soni: ${bundle.channels.length}\n\n`;

      inlineKeyboard.push([
        Markup.button.callback(`🔍 Ko'rish`, `view_bundle_${bundle.id}`),
        Markup.button.callback(`✏️ Tahrirlash`, `edit_bundle_${bundle.id}`),
      ]);
    });

    // Pagination tugmalari
    const paginationButtons = [];
    if (page > 1) {
      paginationButtons.push(
        Markup.button.callback("⬅️ Oldingi", `bundles_page_${page - 1}`)
      );
    }
    if (page * ITEMS_PER_PAGE < totalBundles) {
      paginationButtons.push(
        Markup.button.callback("Keyingi ➡️", `bundles_page_${page + 1}`)
      );
    }
    if (paginationButtons.length > 0) {
      inlineKeyboard.push(paginationButtons);
    }

    // Yangi to'plam yaratish tugmasi
    inlineKeyboard.push([
      Markup.button.callback("➕ Yangi to'plam yaratish", "create_new_bundle"),
    ]);

    await ctx.reply(text, Markup.inlineKeyboard(inlineKeyboard));
  } catch (error) {
    console.error("Error in showBundles:", error);
    await ctx.reply("Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.");
  }
}

// To'plam yaratish scenesi

// To'plamni tahrirlash scenesi

// Scenalarni qo'shish

export default scene;
