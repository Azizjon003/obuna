import { Markup, Scenes } from "telegraf";
import prisma from "../../prisma/prisma";

const scene = new Scenes.BaseScene("control");

scene.hears("/start", async (ctx: any) => {
  return await ctx.scene.enter("start");
});

const ITEMS_PER_PAGE = 10; // Количество подписок на каждой странице

scene.hears("Подписки", async (ctx) => {
  await showSubscriptions(ctx, 1); // Начинаем с 1-й страницы
});

scene.action(/^view_subscription_/, async (ctx: any) => {
  const subscriptionId = ctx.update.callback_query?.data.split("_")[2];

  console.log("Просмотр подписки", subscriptionId);
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { channelBundle: { include: { channels: true } } },
  });

  if (!subscription || !subscription.endDate) {
    return ctx.answerCbQuery("Подписка не найдена");
  }

  let text = `📦 Пакет: ${subscription.channelBundle.name}\n\n`;
  text += `📅 Дата окончания: ${subscription?.endDate.toLocaleDateString()}\n`;
  text += `⏳ Осталось дней: ${Math.ceil(
    (subscription?.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )}\n\n`;
  text += `📢 Каналы:\n`;

  const inlineKeyboard = [];

  for (let channel of subscription.channelBundle.channels) {
    let memberStatus;
    try {
      const chatMember = await ctx.telegram.getChatMember(
        channel.telegram_id,
        ctx.from.id
      );
      memberStatus = chatMember.status;
    } catch (error) {
      console.error(`Ошибка при проверке статуса участника: ${error}`);
      memberStatus = "unknown";
    }

    const isSubscribed = ["creator", "administrator", "member"].includes(
      memberStatus
    );

    text += `- ${channel.name} ${isSubscribed ? "✅" : "❌"}\n`;

    if (!isSubscribed) {
      try {
        const linkText = await ctx.telegram.createChatInviteLink(
          channel.telegram_id,
          {
            creates_join_request: true,
            name: `Join Request ${new Date().toISOString()}`,
          }
        );

        inlineKeyboard.push([
          Markup.button.url(
            `Подписаться: ${channel.name}`,
            linkText.invite_link
          ),
        ]);

        await prisma.invitedLink.create({
          data: {
            link: linkText.invite_link,
            user_id: subscription.user_id,
          },
        });
      } catch (error) {
        console.error(`Ошибка при создании пригласительной ссылки: ${error}`);
      }
    }
  }

  inlineKeyboard.push([
    Markup.button.callback("⬅️ Назад", "back_to_subscriptions"),
  ]);

  await ctx.editMessageText(text, Markup.inlineKeyboard(inlineKeyboard));
  await ctx.answerCbQuery();
});

// Действие для пагинации
scene.action(/^subscriptions_page_(\d+)$/, async (ctx: any) => {
  const page = ctx.update.callback_query?.data.split("_")[2];
  await showSubscriptions(ctx, page);
  await ctx.answerCbQuery();
});

// Действие для возврата назад
scene.action("back_to_subscriptions", async (ctx) => {
  ctx.deleteMessage();
  await showSubscriptions(ctx, 1);
  await ctx.answerCbQuery();
});

// async function showSubscriptions(ctx: any, page: number) {
//   const user = await prisma.user.findFirst({
//     where: {
//       telegram_id: String(ctx.from.id),
//     },
//   });

//   if (!user) {
//     return ctx.reply("У вас нет подписанных каналов");
//   }

//   const totalSubscriptions = await prisma.subscription.count({
//     where: {
//       user_id: user.id,
//       status: "ACTIVE",
//     },
//   });

//   const subscriptions = await prisma.subscription.findMany({
//     where: {
//       user_id: user.id,
//       status: "ACTIVE",
//       channelBundle: {
//         active: true,
//       },
//     },
//     include: {
//       channelBundle: true,
//     },
//     skip: (page - 1) * ITEMS_PER_PAGE,
//     take: ITEMS_PER_PAGE,
//     orderBy: {
//       created_at: "asc",
//     },
//   });

//   if (subscriptions.length === 0) {
//     return ctx.reply("У вас нет активных подписок");
//   }

//   let text = "Ваши подписки:\n\n";
//   const inlineKeyboard = [];

//   for (let [index, subscription] of subscriptions.entries()) {
//     const daysLeft = Math.ceil(
//       ((subscription?.endDate?.getTime() || new Date().getTime()) -
//         Date.now()) /
//         (1000 * 60 * 60 * 24)
//     );
//     text += `${(page - 1) * ITEMS_PER_PAGE + index + 1}. ${
//       subscription.channelBundle.name
//     }\n`;
//     text += `   Дата окончания: ${new Date(
//       subscription.endDate?.getTime() ||
//         subscription.created_at.getTime() + 30 * 86400 * 1000
//     ).toLocaleDateString()}\n`;
//     text += `   Осталось дней: ${daysLeft}\n\n`;

//     inlineKeyboard.push([
//       Markup.button.callback(
//         `🔍 ${subscription.channelBundle.name}`,
//         `view_subscription_${subscription.id}`
//       ),
//     ]);
//   }

//   // Кнопки пагинации
//   const paginationButtons = [];
//   if (page > 1) {
//     paginationButtons.push(
//       Markup.button.callback("⬅️ Предыдущая", `subscriptions_page_${page - 1}`)
//     );
//   }
//   if (page * ITEMS_PER_PAGE < totalSubscriptions) {
//     paginationButtons.push(
//       Markup.button.callback("Следующая ➡️", `subscriptions_page_${page + 1}`)
//     );
//   }
//   if (paginationButtons.length > 0) {
//     inlineKeyboard.push(paginationButtons);
//   }

//   await ctx.reply(text, Markup.inlineKeyboard(inlineKeyboard));
// }
async function showSubscriptions(ctx: any, page: number) {
  const user = await prisma.user.findFirst({
    where: {
      telegram_id: String(ctx.from.id),
    },
  });

  if (!user) {
    return ctx.reply("Пользователь не найден");
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
    include: {
      subscriptions: {
        where: {
          user_id: user.id,
          status: "ACTIVE",
        },
      },
    },
    skip: (page - 1) * ITEMS_PER_PAGE,
    take: ITEMS_PER_PAGE,
    orderBy: {
      createdAt: "asc",
    },
  });

  if (bundles.length === 0) {
    return ctx.reply("Нет доступных пакетов каналов");
  }

  let text = "Доступные пакеты каналов:\n\n";
  const inlineKeyboard = [];

  for (let [index, bundle] of bundles.entries()) {
    const isSubscribed = bundle?.subscriptions.length > 0;
    const subscription = isSubscribed ? bundle?.subscriptions[0] : null;

    text += `${(page - 1) * ITEMS_PER_PAGE + index + 1}. ${bundle.name} ${
      isSubscribed ? "✅" : "❌"
    }\n`;
    text += `   Цена: ${bundle.price} сум\n`;

    if (isSubscribed && subscription?.endDate) {
      const daysLeft = Math.ceil(
        (subscription.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      text += `   Дата окончания: ${subscription.endDate.toLocaleDateString()}\n`;
      text += `   Осталось дней: ${daysLeft}\n`;
    }

    text += "\n";

    inlineKeyboard.push([
      Markup.button.callback(
        `🔍 ${bundle.name}`,
        isSubscribed
          ? `view_subscription_${subscription?.id}`
          : `view_bundle_${bundle.id}`
      ),
    ]);
  }

  // Кнопки пагинации
  const paginationButtons = [];
  if (page > 1) {
    paginationButtons.push(
      Markup.button.callback("⬅️ Предыдущая", `subscriptions_page_${page - 1}`)
    );
  }
  if (page * ITEMS_PER_PAGE < totalBundles) {
    paginationButtons.push(
      Markup.button.callback("Следующая ➡️", `subscriptions_page_${page + 1}`)
    );
  }
  if (paginationButtons.length > 0) {
    inlineKeyboard.push(paginationButtons);
  }

  await ctx.reply(text, Markup.inlineKeyboard(inlineKeyboard));
}

async function showPaymentHistory(ctx: any, page: number) {
  const user = await prisma.user.findFirst({
    where: {
      telegram_id: String(ctx.from.id),
    },
    include: {
      transactions: {
        where: {
          status: "COMPLETED",
        },
        orderBy: {
          created_at: "desc",
        },
        skip: (page - 1) * ITEMS_PER_PAGE,
        take: ITEMS_PER_PAGE,
      },
    },
  });

  if (!user || user.transactions.length === 0) {
    return ctx.reply("У вас нет истории платежей");
  }

  const totalPayments = await prisma.transaction.count({
    where: {
      userId: user.id,
      status: "COMPLETED",
    },
  });

  let text = "История платежей:\n\n";
  const inlineKeyboard = [];

  for (let [index, payment] of user.transactions.entries()) {
    text += `${(page - 1) * ITEMS_PER_PAGE + index + 1}. ${
      payment.amount
    } сум - ${payment.created_at.toLocaleString()}\n`;
  }

  // Кнопки пагинации
  const paginationButtons = [];
  if (page > 1) {
    paginationButtons.push(
      Markup.button.callback(
        "⬅️ Предыдущая",
        `payment_history_page_${page - 1}`
      )
    );
  }
  if (page * ITEMS_PER_PAGE < totalPayments) {
    paginationButtons.push(
      Markup.button.callback("Следующая ➡️", `payment_history_page_${page + 1}`)
    );
  }
  if (paginationButtons.length > 0) {
    inlineKeyboard.push(paginationButtons);
  }

  inlineKeyboard.push([Markup.button.callback("Назад", "back_to_start")]);

  await ctx.reply(text, Markup.inlineKeyboard(inlineKeyboard));
}

scene.hears("История платежей", async (ctx) => {
  await showPaymentHistory(ctx, 1); // Начинаем с 1-й страницы
});

scene.action(/^payment_history_page_(\d+)$/, async (ctx: any) => {
  const page = ctx.update.callback_query?.data.split("_")[3];
  await showPaymentHistory(ctx, page);
  await ctx.answerCbQuery();
});

scene.hears("Настройки", async (ctx: any) => {
  const notification = ctx.session.notification || false;

  const notificationText = notification
    ? "Уведомления включены"
    : "Уведомления выключены";
  ctx.reply("Настройки уведомлений", {
    reply_markup: {
      inline_keyboard: [
        [Markup.button.callback(notificationText, "toggle_notification")],
        [Markup.button.callback("Назад", "back_to_start")],
      ],
    },
  });
});

scene.action("toggle_notification", async (ctx: any) => {
  ctx.session.notification = !ctx.session.notification;
  ctx.editMessageReplyMarkup({
    inline_keyboard: [
      [
        Markup.button.callback(
          ctx.session.notification
            ? "Уведомления включены"
            : "Уведомления выключены",
          "toggle_notification"
        ),
      ],
      [Markup.button.callback("Назад", "back_to_start")],
    ],
  });
});

scene.action("back_to_start", async (ctx: any) => {
  ctx.deleteMessage();
  await ctx.scene.enter("start");
});

export default scene;
