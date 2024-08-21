import { Markup, Scenes } from "telegraf";
import prisma from "../../prisma/prisma";
import bot from "../core/bot";
const ExcelJS = require("exceljs");
const scene = new Scenes.BaseScene("admin");

scene.hears("/start", async (ctx: any) => {
  return await ctx.scene.enter("start");
});

scene.hears("Назад", async (ctx: any) => {
  return await ctx.scene.enter("start");
});
scene.hears("Статистика", async (ctx) => {
  const userId = ctx.from.id;

  try {
    const user = await prisma.user.findUnique({
      where: { telegram_id: userId.toString() },
    });

    if (!user || user.role !== "ADMIN") {
      return ctx.reply("У вас нет прав для просмотра этой информации.");
    }

    // Получение статистики
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
📊 Статистика системы:

👥 Количество пользователей: ${totalUsers}
🛍️ Пользователей-мерчантов: ${totalMerchants}
📡 Количество каналов: ${totalChannels}

📌 Подписки:
   📝 Всего: ${totalSubscriptions}
   ✅ Активных: ${activeSubscriptions}

💰 Общий доход: ${totalRevenue._sum.price || 0} сум

📅 Дата: ${new Date().toLocaleString()}
    `;

    ctx.reply(message, {
      reply_markup: {
        keyboard: [[{ text: "Подробная информация" }], [{ text: "Назад" }]],
        resize_keyboard: true,
      },
    });
  } catch (error) {
    console.error("Произошла ошибка:", error);
    ctx.reply(
      "Произошла ошибка при получении статистики. Пожалуйста, попробуйте позже."
    );
  }
});

scene.hears("Подробная информация", async (ctx) => {
  const userId = ctx.from.id;

  try {
    const user = await prisma.user.findUnique({
      where: { telegram_id: userId.toString() },
    });

    if (!user || user.role !== "ADMIN") {
      return ctx.reply("У вас нет прав для просмотра этой информации.");
    }

    // Получение последних 5 подписок
    const recentSubscriptions = await prisma.subscription.findMany({
      take: 5,
      orderBy: { created_at: "desc" },
      include: { user: true, channelBundle: true },
    });

    let message = "📋 Последние 5 подписок:\n\n";

    for (const sub of recentSubscriptions) {
      message += `👤 Пользователь: ${sub.user.username || sub.user.name}\n`;
      message += `📦 Пакет: ${sub.channelBundle.name}\n`;
      message += `💲 Цена: ${sub.price} сум\n`;
      message += `📅 Дата: ${sub.created_at.toLocaleString()}\n\n`;
    }

    // Топ 3 мерчанта
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

    ctx.reply(message);
  } catch (error) {
    console.error("Произошла ошибка:", error);
    ctx.reply(
      "Произошла ошибка при получении подробной информации. Пожалуйста, попробуйте позже."
    );
  }
});

scene.hears("Список пакетов", async (ctx) => {
  await showBundles(ctx, 1); // Начинаем с 1-й страницы
});

bot.hears("Список платежей", async (ctx) => {
  try {
    // To'lov qilingan tranzaksiyalarni olish
    const completedTransactions = await prisma.transaction.findMany({
      where: {
        status: "COMPLETED",
      },
      include: {
        user: true,
        subscription: {
          include: {
            channelBundle: true,
          },
        },
      },
    });

    // Excel fayl yaratish
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Completed Payments");

    // Ustunlar qo'shish
    worksheet.columns = [
      { header: "Transaction ID", key: "id", width: 36 },
      { header: "User", key: "user", width: 20 },
      { header: "Amount", key: "amount", width: 15 },
      { header: "Channel Bundle", key: "channelBundle", width: 30 },
      { header: "Date", key: "date", width: 20 },
    ];

    // Ma'lumotlarni Excel fayliga yozish
    completedTransactions.forEach((transaction) => {
      worksheet.addRow({
        id: transaction.id,
        user:
          transaction.user.name ||
          transaction.user.username ||
          transaction.user.telegram_id,
        amount: transaction.amount,
        channelBundle: transaction.subscription.channelBundle.name,
        date: transaction.created_at.toLocaleString(),
      });
    });

    // Excel faylini saqlash
    const buffer = await workbook.xlsx.writeBuffer();

    // Faylni foydalanuvchiga yuborish
    await ctx.replyWithDocument(
      {
        source: buffer,
        filename: "completed_payments.xlsx",
      },
      {
        caption: "To'lov qilingan tranzaksiyalar ro'yxati",
      }
    );
  } catch (error) {
    console.error("Error generating payments report:", error);
    await ctx.reply(
      "Hisobot tayyorlashda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring."
    );
  }
});
// Действие для пагинации
scene.action(/^bundles_page_(\d+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  await showBundles(ctx, page);
  await ctx.answerCbQuery();
});

const USERS_PER_PAGE = 10; // Количество пользователей на каждой странице

scene.hears("Список пользователей", async (ctx) => {
  await showUsersList(ctx, 1); // Начинаем с 1-й страницы
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

  let text = "📊 Статистика пользователей:\n\n";
  text += `👥 Всего пользователей: ${totalUsers}\n`;
  text += `🔔 Активные подписки: ${activeSubscriptions}\n`;
  text += `💳 Всего платежей: ${totalTransactions}\n\n`;
  text += "👤 Список пользователей:\n\n";

  for (const [index, user] of users.entries()) {
    const userNumber = (page - 1) * USERS_PER_PAGE + index + 1;
    text += `${userNumber}. ${user.name || user.telegram_id}\n`;
    text += `   📅 Дата регистрации: ${user.created_at.toLocaleDateString()}\n`;
    text += `   💳 Количество платежей: ${user.transactions.length}\n\n`;
  }

  const totalPages = Math.ceil(totalUsers / USERS_PER_PAGE);
  const paginationKeyboard = [];

  if (page > 1) {
    paginationKeyboard.push(
      Markup.button.callback("⬅️ Предыдущая", `users_list_page_${page - 1}`)
    );
  }
  if (page < totalPages) {
    paginationKeyboard.push(
      Markup.button.callback("Следующая ➡️", `users_list_page_${page + 1}`)
    );
  }

  const keyboard = Markup.inlineKeyboard([
    [...paginationKeyboard],
    [Markup.button.callback("🔙 Назад", "back_to_start")],
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

const TRANSACTIONS_PER_PAGE = 10; // Количество транзакций на каждой странице

scene.hears("Список платежей", async (ctx) => {
  await showTransactionsList(ctx, 1); // Начинаем с 1-й страницы
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

  let text = "💳 Статистика платежей:\n\n";
  text += `📊 Всего платежей: ${totalTransactions}\n`;
  text += `✅ Активные платежи: ${activeTransactions}\n`;
  text += `🏁 Завершенные платежи: ${completedTransactions}\n\n`;
  text += "🧾 Список платежей:\n\n";

  for (const [index, transaction] of transactions.entries()) {
    const transactionNumber = (page - 1) * TRANSACTIONS_PER_PAGE + index + 1;
    text += `${transactionNumber}. ID: ${transaction.id}\n`;
    text += `   👤 Пользователь: ${
      transaction.user.name || transaction.user.telegram_id
    }\n`;
    text += `   💰 Сумма: ${transaction.amount} сум\n`;
    text += `   📅 Дата: ${transaction.created_at.toLocaleString()}\n`;
    text += `   📊 Статус: ${
      transaction.status === "COMPLETED"
        ? "✅ Активный"
        : transaction.status === "PENDING"
        ? "✴️ Ожидает"
        : "❌ Отменен"
    }\n\n`;
  }

  const totalPages = Math.ceil(totalTransactions / TRANSACTIONS_PER_PAGE);
  const paginationKeyboard = [];

  if (page > 1) {
    paginationKeyboard.push(
      Markup.button.callback(
        "⬅️ Предыдущая",
        `transactions_list_page_${page - 1}`
      )
    );
  }
  if (page < totalPages) {
    paginationKeyboard.push(
      Markup.button.callback(
        "Следующая ➡️",
        `transactions_list_page_${page + 1}`
      )
    );
  }

  const keyboard = Markup.inlineKeyboard([
    [...paginationKeyboard],
    [Markup.button.callback("🔙 Назад", "back_to_start")],
  ]);

  if (ctx.updateType === "callback_query") {
    await ctx.editMessageText(text, keyboard);
  } else {
    await ctx.reply(text, keyboard);
  }
}

// Просмотр информации о наборе
scene.action(/^view_bundle_/, async (ctx: any) => {
  console.log(ctx.update.callback_query.data, "что-то");
  const bundleId = ctx.update.callback_query.data.split("_")[2];

  try {
    const bundle = await prisma.channelBundle.findUnique({
      where: { id: bundleId },
      include: { channels: true },
    });

    if (!bundle) {
      return ctx.answerCbQuery("Набор не найден");
    }

    const botUsername = ctx.botInfo?.username || ctx.me;
    const shareUrl = `https://t.me/${botUsername}?start=${bundle.id}`;
    let text = `📦 Набор: ${bundle.name}\n\n`;
    text += `💰 Цена: ${bundle.price} сум\n`;
    text += `📝 Описание: ${bundle.description || "Отсутствует"}\n\n`;
    text += `URL для присоединения к каналам: ${shareUrl}\n`; //share url
    text += `📢 Каналы (${bundle.channels.length}):\n`;
    bundle.channels.forEach((channel: any, index: number) => {
      text += `${index + 1}. ${channel.name} - ${channel.telegram_id}\n`;
    });

    const inlineKeyboard = [
      [Markup.button.callback("✏️ Редактировать", `edit_bundle_${bundleId}`)],
      [Markup.button.callback("🗑️ Удалить", `delete_bundle_${bundleId}`)],
      [Markup.button.callback("⬅️ Назад", "back_to_bundles")],
    ];

    await ctx.editMessageText(text, Markup.inlineKeyboard(inlineKeyboard));
    await ctx.answerCbQuery();
  } catch (error) {
    console.error("Ошибка в view_bundle:", error);
    await ctx.answerCbQuery(
      "Произошла ошибка. Пожалуйста, попробуйте еще раз."
    );
  }
});

// Редактирование набора
scene.action(/^edit_bundle_/, async (ctx: any) => {
  console.log(ctx.update.callback_query.data, "edit что-то");
  const bundleId = ctx.update.callback_query.data.split("_")[2];

  console.log(bundleId, "bundleId");

  ctx.session.bundleId = bundleId;
  ctx.scene.enter("editBundle", { bundleId });
  await ctx.answerCbQuery();
});

// Создание нового набора
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

    await ctx.answerCbQuery("Набор успешно удален");
    await showBundles(ctx, 1);
  } catch (error) {
    console.error("Ошибка в delete_bundle:", error);
    await ctx.answerCbQuery(
      "Произошла ошибка при удалении набора. Пожалуйста, попробуйте еще раз."
    );
  }
});

// Возврат назад
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
      return ctx.reply("Вы не являетесь пользователем-мерчантом");
    }

    const totalBundles = await prisma.channelBundle.count({
      where: {
        active: true,
      },
    });

    const bundles = await prisma.channelBundle.findMany({
      where: {
        active: true,
      },
      skip: (page - 1) * ITEMS_PER_PAGE,
      take: ITEMS_PER_PAGE,

      include: { channels: true },
    });

    if (bundles.length === 0 && page === 1) {
      const inlineKeyboard = [
        [Markup.button.callback("➕ Создать новый набор", "create_new_bundle")],
      ];
      return ctx.reply(
        "У вас пока нет наборов. Нажмите кнопку 'Создать новый набор', чтобы создать новый набор.",
        Markup.inlineKeyboard(inlineKeyboard)
      );
    }

    let text = "📦 Ваши наборы:\n\n";
    const inlineKeyboard = [];

    bundles.forEach((bundle: any, index: any) => {
      text += `${(page - 1) * ITEMS_PER_PAGE + index + 1}. ${bundle.name}\n`;
      text += `   💰 Цена: ${bundle.price} сум\n`;
      text += `   📢 Количество каналов: ${bundle.channels.length}\n\n`;

      inlineKeyboard.push([
        Markup.button.callback(`🔍 Просмотр`, `view_bundle_${bundle.id}`),
        Markup.button.callback(`✏️ Редактировать`, `edit_bundle_${bundle.id}`),
      ]);
    });

    // Кнопки пагинации
    const paginationButtons = [];
    if (page > 1) {
      paginationButtons.push(
        Markup.button.callback("⬅️ Предыдущая", `bundles_page_${page - 1}`)
      );
    }
    if (page * ITEMS_PER_PAGE < totalBundles) {
      paginationButtons.push(
        Markup.button.callback("Следующая ➡️", `bundles_page_${page + 1}`)
      );
    }
    if (paginationButtons.length > 0) {
      inlineKeyboard.push(paginationButtons);
    }

    // Кнопка создания нового набора
    inlineKeyboard.push([
      Markup.button.callback("➕ Создать новый набор", "create_new_bundle"),
    ]);

    await ctx.reply(text, Markup.inlineKeyboard(inlineKeyboard));
  } catch (error) {
    console.error("Ошибка в showBundles:", error);
    await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте еще раз.");
  }
}

scene.hears("Отправить сообщение", async (ctx: any) => {
  await ctx.reply(
    "Выберите тип отправки сообщения:",
    Markup.inlineKeyboard([
      [Markup.button.callback("Всем пользователям", "send_to_all")],
      [Markup.button.callback("Отдельному пользователю", "send_to_one")],
      [Markup.button.callback("🔙 Назад", "back_to_start")],
    ])
  );

  ctx.scene.enter("sendMessage");
});

scene.action(/^delete_bundle_/, async (ctx: any) => {
  const bundleId = ctx.update.callback_query.data.split("_")[2];

  try {
    // Confirm deletion
    await ctx.answerCbQuery();
    await ctx.reply(
      "Вы уверены, что хотите удалить этот набор? Это действие нельзя отменить.",
      Markup.inlineKeyboard([
        [Markup.button.callback("Да, удалить", `confirm_delete_${bundleId}`)],
        [Markup.button.callback("Отмена", "cancel_delete")],
      ])
    );
  } catch (error) {
    console.error("Ошибка в delete_bundle:", error);
    await ctx.answerCbQuery(
      "Произошла ошибка. Пожалуйста, попробуйте еще раз."
    );
  }
});

// Подтверждение удаления
scene.action(/^confirm_delete_/, async (ctx: any) => {
  const bundleId = ctx.update.callback_query.data.split("_")[2];

  try {
    // Delete the bundle
    await prisma.channelBundle.update({
      where: { id: bundleId },
      data: {
        active: false,
      },
    });

    await ctx.answerCbQuery("Набор успешно удален");
    await ctx.reply("Набор был успешно удален.");
    await showBundles(ctx, 1);
  } catch (error) {
    console.error("Ошибка при удалении набора:", error);
    await ctx.answerCbQuery(
      "Произошла ошибка при удалении набора. Пожалуйста, попробуйте еще раз."
    );
  }
});

// Отмена удаления
scene.action("cancel_delete", async (ctx: any) => {
  await ctx.answerCbQuery("Удаление отменено");
  await ctx.reply("Удаление набора было отменено.");
  await showBundles(ctx, 1);
});
// Для отображения кнопки отправки сообщения только администраторам

export default scene;
