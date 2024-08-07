import { Scenes } from "telegraf";
import prisma from "../../prisma/prisma";
import bot from "../core/bot";
import { keyboards } from "../utils/keyboards";
import { admin_keyboard } from "./start";

const scene = new Scenes.BaseScene("admin");

scene.hears("/start", async (ctx: any) => {
  return await ctx.scene.enter("start");
});

scene.hears("Statistika", async (ctx) => {
  const userId = ctx.from.id;

  try {
    const user = await prisma.user.findUnique({
      where: { telegram_id: userId.toString() },
    });

    if (!user || user.role !== "ADMIN") {
      return ctx.reply("Sizda bu ma'lumotlarni ko'rish uchun huquq yo'q.");
    }

    // Statistikani olish
    const [
      totalUsers,
      totalMerchants,
      totalChannels,
      totalSubscriptions,
      activeSubscriptions,
      totalRevenue,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "MERCHANT" } }),
      prisma.channel.count(),
      prisma.subscription.count(),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.subscription.aggregate({
        _sum: { price: true },
        where: { status: "ACTIVE" },
      }),
    ]);

    const message = `
📊 Tizim statistikasi:

👥 Foydalanuvchilar soni: ${totalUsers}
🛍️ Merchant foydalanuvchilar: ${totalMerchants}
📡 Kanallar soni: ${totalChannels}

📌 Obunalar:
   📝 Jami: ${totalSubscriptions}
   ✅ Faol: ${activeSubscriptions}

💰 Umumiy daromad: ${totalRevenue._sum.price || 0} so'm

📅 Sana: ${new Date().toLocaleString()}
    `;

    ctx.reply(message, {
      reply_markup: {
        keyboard: [[{ text: "Batafsil ma'lumot" }], [{ text: "Orqaga" }]],
        resize_keyboard: true,
      },
    });
  } catch (error) {
    console.error("Xatolik yuz berdi:", error);
    ctx.reply(
      "Statistikani olishda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring."
    );
  }
});

scene.hears("Batafsil ma'lumot", async (ctx) => {
  const userId = ctx.from.id;

  try {
    const user = await prisma.user.findUnique({
      where: { telegram_id: userId.toString() },
    });

    if (!user || user.role !== "ADMIN") {
      return ctx.reply("Sizda bu ma'lumotlarni ko'rish uchun huquq yo'q.");
    }

    // So'nggi 5 ta obunani olish
    const recentSubscriptions = await prisma.subscription.findMany({
      take: 5,
      orderBy: { created_at: "desc" },
      include: { user: true, channelBundle: true },
    });

    let message = "📋 So'nggi 5 ta obuna:\n\n";

    for (const sub of recentSubscriptions) {
      message += `👤 Foydalanuvchi: ${sub.user.username || sub.user.name}\n`;
      message += `📦 Paket: ${sub.channelBundle.name}\n`;
      message += `💲 Narx: ${sub.price} so'm\n`;
      message += `📅 Sana: ${sub.created_at.toLocaleString()}\n\n`;
    }

    // Top 3 merchant
    const topMerchants = await prisma.user.findMany({
      where: { role: "MERCHANT" },
      take: 3,
      orderBy: {
        subscriptions: {
          _count: "desc",
        },
      },
      include: {
        _count: {
          select: { subscriptions: true },
        },
      },
    });

    message += "🏆 Top 3 merchant:\n\n";

    for (const merchant of topMerchants) {
      message += `👤 ${merchant.username || merchant.name}\n`;
      message += `📊 Obunalar soni: ${merchant._count.subscriptions}\n\n`;
    }

    ctx.reply(message);
  } catch (error) {
    console.error("Xatolik yuz berdi:", error);
    ctx.reply(
      "Batafsil ma'lumotni olishda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring."
    );
  }
});

scene.hears("Orqaga", async (ctx) => {
  ctx.reply("Asosiy menyuga qaytish", keyboards(admin_keyboard));
});

const MERCHANTS_PER_PAGE = 10;

scene.hears("Merchantlar", async (ctx) => {
  await showMerchants(ctx, 1);
});

async function showMerchants(ctx: any, page: any) {
  const userId = ctx.from.id;

  try {
    const user = await prisma.user.findUnique({
      where: { telegram_id: userId.toString() },
    });

    if (!user || user.role !== "ADMIN") {
      return ctx.reply("Sizda bu ma'lumotlarni ko'rish uchun huquq yo'q.");
    }

    const skip = (page - 1) * MERCHANTS_PER_PAGE;
    const [merchants, totalMerchants] = await Promise.all([
      prisma.user.findMany({
        where: { role: "MERCHANT" },
        skip: skip,
        take: MERCHANTS_PER_PAGE,
        orderBy: { created_at: "desc" },
        include: {
          _count: {
            select: { subscriptions: true },
          },
        },
      }),
      prisma.user.count({ where: { role: "MERCHANT" } }),
    ]);

    if (merchants.length === 0) {
      return ctx.reply("Hozircha merchantlar mavjud emas.");
    }

    let message = `📊 Merchantlar ro'yxati (${page}-bet):\n\n`;

    merchants.forEach((merchant, index) => {
      message += `${skip + index + 1}. ${merchant.username || merchant.name}\n`;
      message += `   📅 Ro'yxatdan o'tgan: ${merchant.created_at.toLocaleDateString()}\n`;
      message += `   📊 Obunalar soni: ${merchant._count.subscriptions}\n\n`;
    });

    const totalPages = Math.ceil(totalMerchants / MERCHANTS_PER_PAGE);

    const keyboard = [
      ...merchants.map((m) => [
        { text: m.username || m.name, callback_data: `merchant:${m.id}` },
      ]),
      [],
    ];

    if (page > 1) {
      keyboard[keyboard.length - 1].push({
        text: "⬅️ Oldingi",
        callback_data: `merchants:${page - 1}`,
      });
    }
    if (page < totalPages) {
      keyboard[keyboard.length - 1].push({
        text: "Keyingi ➡️",
        callback_data: `merchants:${page + 1}`,
      });
    }

    keyboard.push([{ text: "Orqaga", callback_data: "back_to_admin_menu" }]);

    ctx.reply(message, {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  } catch (error) {
    console.error("Xatolik yuz berdi:", error);
    ctx.reply(
      "Ma'lumotlarni olishda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring."
    );
  }
}

// Callback query handler
bot.action(/^merchants:(\d+)$/, async (ctx) => {
  const page = parseInt(ctx.match.input.split(":")[1]);
  await showMerchants(ctx, page);
  ctx.answerCbQuery();
});

bot.action(/^merchant:/, async (ctx) => {
  const merchantId = ctx.match.input.split(":")[1];
  await showMerchantDetails(ctx, merchantId);
  ctx.answerCbQuery();
});

bot.action("back_to_admin_menu", async (ctx) => {
  // Admin menyusiga qaytish logikasi
  ctx.answerCbQuery();
});

async function showMerchantDetails(ctx: any, merchantId: string) {
  try {
    const merchant = await prisma.user.findUnique({
      where: { id: merchantId },
      include: {
        _count: {
          select: { subscriptions: true },
        },
        merchantWallet: true,
        ChannelBundle: {
          include: {
            channels: true,
          },
        },
      },
    });

    if (!merchant) {
      return ctx.editMessageText("Merchant topilmadi.");
    }

    let message = `👤 Merchant: ${merchant.username || merchant.name}\n`;
    message += `📅 Ro'yxatdan o'tgan: ${merchant.created_at.toLocaleDateString()}\n`;
    message += `📊 Obunalar soni: ${merchant._count.subscriptions}\n`;
    message += `💰 Wallet balansi: ${
      merchant.merchantWallet?.balance || 0
    } so'm\n\n`;

    message += "📦 Kanallar to'plamlari:\n";
    if (merchant.ChannelBundle && merchant.ChannelBundle.length > 0) {
      merchant.ChannelBundle.forEach((bundle, index) => {
        message += `\n${index + 1}. ${bundle.name}\n`;
        message += `   💲 Narxi: ${bundle.price} so'm\n`;
        message += `   ⏳ Davomiyligi: ${bundle.duration} kun\n`;
        message += `   📡 Kanallar soni: ${bundle.channels.length}\n`;
      });
    } else {
      message += "Hozircha kanallar to'plami mavjud emas.\n";
    }

    const keyboard = [
      [
        {
          text: "Kanallar to'plamlarini ko'rish",
          callback_data: `merchant_bundles:${merchantId}`,
        },
      ],
      [{ text: "Orqaga", callback_data: "merchants:1" }],
    ];

    ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  } catch (error) {
    console.error("Xatolik yuz berdi:", error);
    ctx.editMessageText(
      "Ma'lumotlarni olishda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring."
    );
  }
}
const BUNDLES_PER_PAGE = 5;
// Kanallar to'plamlarini ko'rish uchun yangi handler
bot.action(/^merchant_bundles:/, async (ctx) => {
  const merchantId = ctx.match.input.split(":")[1];
  await showMerchantBundles(ctx, merchantId);
  ctx.answerCbQuery();
});

async function showMerchantBundles(
  ctx: any,
  merchantId: string,
  page: number = 1
) {
  try {
    const skip = (page - 1) * BUNDLES_PER_PAGE;

    const merchant = await prisma.user.findUnique({
      where: { id: merchantId },
      include: {
        ChannelBundle: {
          skip,
          take: BUNDLES_PER_PAGE,
          include: {
            channels: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        _count: {
          select: { ChannelBundle: true },
        },
      },
    });

    if (!merchant) {
      return ctx.editMessageText("Merchant topilmadi.");
    }

    let message = `👤 ${
      merchant.username || merchant.name
    } ning kanallar to'plamlari (${page}-bet):\n\n`;

    if (merchant.ChannelBundle && merchant.ChannelBundle.length > 0) {
      merchant.ChannelBundle.forEach((bundle, index) => {
        message += `📦 ${skip + index + 1}. ${bundle.name}\n`;
        message += `   💲 Narxi: ${bundle.price} so'm\n`;
        message += `   ⏳ Davomiyligi: ${bundle.duration} kun\n`;
        message += `   📡 Kanallar:\n`;
        bundle.channels.forEach((channel, channelIndex) => {
          message += `      ${channelIndex + 1}. ${channel.name}\n`;
        });
        message += "\n";
      });
    } else {
      message += "Ushbu sahifada kanallar to'plami mavjud emas.\n";
    }

    const totalBundles = merchant._count.ChannelBundle;
    const totalPages = Math.ceil(totalBundles / BUNDLES_PER_PAGE);

    const keyboard = [];

    // Pagination buttons
    if (totalPages > 1) {
      const paginationRow = [];
      if (page > 1) {
        paginationRow.push({
          text: "⬅️ Oldingi",
          callback_data: `merchant_bundles:${merchantId}:${page - 1}`,
        });
      }
      if (page < totalPages) {
        paginationRow.push({
          text: "Keyingi ➡️",
          callback_data: `merchant_bundles:${merchantId}:${page + 1}`,
        });
      }
      keyboard.push(paginationRow);
    }

    keyboard.push([
      {
        text: "Merchant ma'lumotlariga qaytish",
        callback_data: `merchant:${merchantId}`,
      },
    ]);
    keyboard.push([
      {
        text: "Merchantlar ro'yxatiga qaytish",
        callback_data: "merchants:1",
      },
    ]);

    ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  } catch (error) {
    console.error("Xatolik yuz berdi:", error);
    ctx.editMessageText(
      "Ma'lumotlarni olishda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring."
    );
  }
}

// Update the action handler to include the page number
bot.action(/^merchant_bundles:(\w+):(\d+)$/, async (ctx) => {
  const [, merchantId, page] = ctx.match.input.split(":");
  await showMerchantBundles(ctx, merchantId, parseInt(page));
  ctx.answerCbQuery();
});

// Update the initial merchant bundles action to start from page 1
bot.action(/^merchant_bundles:(\w+)$/, async (ctx) => {
  const merchantId = ctx.match.input.split(":")[1];
  await showMerchantBundles(ctx, merchantId, 1);
  ctx.answerCbQuery();
});
export default scene;
