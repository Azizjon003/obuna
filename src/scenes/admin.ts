import { Markup, Scenes } from "telegraf";
import prisma from "../../prisma/prisma";

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

scene.hears("To'plamlar ro'yxati", async (ctx) => {
  await showBundles(ctx, 1); // 1-sahifadan boshlaymiz
});

scene.hears("To'lovlar ro'yhati", async (ctx) => {});

// Pagination uchun action
scene.action(/^bundles_page_(\d+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  await showBundles(ctx, page);
  await ctx.answerCbQuery();
});

const USERS_PER_PAGE = 10; // Har bir sahifadagi foydalanuvchilar soni

scene.hears("Foydalanuvchilar ro'yxati", async (ctx) => {
  await showUsersList(ctx, 1); // 1-sahifadan boshlaymiz
});

scene.action(/^users_list_page_(\d+)$/, async (ctx: any) => {
  const page = parseInt(ctx.match[1]);
  await showUsersList(ctx, page);
  await ctx.answerCbQuery();
});

async function showUsersList(ctx: any, page: number) {
  const totalUsers = await prisma.user.count();
  const activeSubscriptions = await prisma.subscription.count({
    where: { status: "ACTIVE" },
  });
  const totalTransactions = await prisma.transaction.count({
    where: { status: "COMPLETED" },
  });

  const users = await prisma.user.findMany({
    skip: (page - 1) * USERS_PER_PAGE,
    take: USERS_PER_PAGE,
    orderBy: { created_at: "desc" },
    include: {
      subscriptions: {
        where: { status: "ACTIVE" },
      },
      transactions: {
        where: { status: "COMPLETED" },
      },
    },
  });

  let text = "📊 Foydalanuvchilar statistikasi:\n\n";
  text += `👥 Jami foydalanuvchilar: ${totalUsers}\n`;
  text += `🔔 Faol obunalar: ${activeSubscriptions}\n`;
  text += `💳 Jami to'lovlar: ${totalTransactions}\n\n`;
  text += "👤 Foydalanuvchilar ro'yxati:\n\n";

  for (const [index, user] of users.entries()) {
    const userNumber = (page - 1) * USERS_PER_PAGE + index + 1;
    text += `${userNumber}. ${user.name || user.telegram_id}\n`;
    text += `   📅 Ro'yxatdan o'tgan sana: ${user.created_at.toLocaleDateString()}\n`;
    text += `   💳 To'lovlar soni: ${user.transactions.length}\n\n`;
  }

  const totalPages = Math.ceil(totalUsers / USERS_PER_PAGE);
  const paginationKeyboard = [];

  if (page > 1) {
    paginationKeyboard.push(
      Markup.button.callback("⬅️ Oldingi", `users_list_page_${page - 1}`)
    );
  }
  if (page < totalPages) {
    paginationKeyboard.push(
      Markup.button.callback("Keyingi ➡️", `users_list_page_${page + 1}`)
    );
  }

  const keyboard = Markup.inlineKeyboard([
    [...paginationKeyboard],
    [Markup.button.callback("🔙 Orqaga", "back_to_start")],
  ]);

  if (ctx.updateType === "callback_query") {
    await ctx.editMessageText(text, keyboard);
  } else {
    await ctx.reply(text, keyboard);
  }
}

scene.action("back_to_start", async (ctx: any) => {
  await ctx.scene.enter("start");
  await ctx.answerCbQuery();
});

const TRANSACTIONS_PER_PAGE = 10; // Har bir sahifadagi tranzaksiyalar soni

scene.hears("To'lovlar ro'yxati", async (ctx) => {
  await showTransactionsList(ctx, 1); // 1-sahifadan boshlaymiz
});

scene.action(/^transactions_list_page_(\d+)$/, async (ctx: any) => {
  const page = parseInt(ctx.match[1]);
  await showTransactionsList(ctx, page);
  await ctx.answerCbQuery();
});

async function showTransactionsList(ctx: any, page: number) {
  const totalTransactions = await prisma.transaction.count();
  const activeTransactions = await prisma.transaction.count({
    where: { status: "PENDING" },
  });
  const completedTransactions = await prisma.transaction.count({
    where: { status: "COMPLETED" },
  });

  const transactions = await prisma.transaction.findMany({
    skip: (page - 1) * TRANSACTIONS_PER_PAGE,
    take: TRANSACTIONS_PER_PAGE,
    orderBy: { created_at: "desc" },
    include: {
      user: true,
    },
  });

  let text = "💳 To'lovlar statistikasi:\n\n";
  text += `📊 Jami to'lovlar: ${totalTransactions}\n`;
  text += `✅ Faol to'lovlar: ${activeTransactions}\n`;
  text += `🏁 Yakunlangan to'lovlar: ${completedTransactions}\n\n`;
  text += "🧾 To'lovlar ro'yxati:\n\n";

  for (const [index, transaction] of transactions.entries()) {
    const transactionNumber = (page - 1) * TRANSACTIONS_PER_PAGE + index + 1;
    text += `${transactionNumber}. ID: ${transaction.id}\n`;
    text += `   👤 Foydalanuvchi: ${
      transaction.user.name || transaction.user.telegram_id
    }\n`;
    text += `   💰 Summa: ${transaction.amount} so'm\n`;
    text += `   📅 Sana: ${transaction.created_at.toLocaleString()}\n`;
    text += `   📊 Holat: ${
      transaction.status === "COMPLETED"
        ? "✅ Faol"
        : transaction.status === "PENDING"
        ? "✴️ Kutilmoqda"
        : "❌ Bekor qilingan"
    }\n\n`;
  }

  const totalPages = Math.ceil(totalTransactions / TRANSACTIONS_PER_PAGE);
  const paginationKeyboard = [];

  if (page > 1) {
    paginationKeyboard.push(
      Markup.button.callback("⬅️ Oldingi", `transactions_list_page_${page - 1}`)
    );
  }
  if (page < totalPages) {
    paginationKeyboard.push(
      Markup.button.callback("Keyingi ➡️", `transactions_list_page_${page + 1}`)
    );
  }

  const keyboard = Markup.inlineKeyboard([
    [...paginationKeyboard],
    [Markup.button.callback("🔙 Orqaga", "back_to_start")],
  ]);

  if (ctx.updateType === "callback_query") {
    await ctx.editMessageText(text, keyboard);
  } else {
    await ctx.reply(text, keyboard);
  }
}

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

  console.log(bundleId, "bundleId");

  ctx.session.bundleId = bundleId;
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
        role: "ADMIN",
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
      const inlineKeyboard = [
        [
          Markup.button.callback(
            "➕ Yangi to'plam yaratish",
            "create_new_bundle"
          ),
        ],
      ];
      return ctx.reply(
        "Sizda hali to'plamlar mavjud emas. Yangi to'plam yaratish uchun 'Yangi to'plam' tugmasini bosing.",
        Markup.inlineKeyboard(inlineKeyboard)
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

scene.hears("Xabar yuborish", async (ctx: any) => {
  await ctx.reply(
    "Xabar yuborish turini tanlang:",
    Markup.inlineKeyboard([
      [Markup.button.callback("Barcha foydalanuvchilarga", "send_to_all")],
      [Markup.button.callback("Alohida foydalanuvchiga", "send_to_one")],
      [Markup.button.callback("🔙 Orqaga", "back_to_start")],
    ])
  );

  ctx.scene.enter("sendMessage");
});

// Xabar yuborish tugmasini faqat adminlar ko'rishi uchun

export default scene;
