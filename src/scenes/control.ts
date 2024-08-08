import { Markup, Scenes } from "telegraf";
import prisma from "../../prisma/prisma";

const scene = new Scenes.BaseScene("control");

scene.hears("/start", async (ctx: any) => {
  return await ctx.scene.enter("start");
});

// scene.hears("Obunalar", async (ctx) => {
//   const channels = await prisma.channelBundle.findMany({
//     where: {
//       isActive: true,
//     },
//   });

//   if (channels.length === 0) {
//     return ctx.reply("Hozircha obuna bo'lgan kanallar yo'q");
//   }
//   const user = await prisma.user.findFirst({
//     where: {
//       telegram_id: String(ctx.from.id),
//     },
//   });

//   if (!user) {
//     return ctx.reply("Sizda obuna bo'lgan kanallar yo'q");
//   }
//   let text = "Obuna bo'lgan kanallar ro'yhati:\n\n";
//   const inlineKeyboard = [];

//   for (let [index, channel] of channels.entries()) {
//     let memberStatus;
//     const chatMember = await bot.telegram.getChatMember(
//       channel.telegram_id,
//       ctx.from.id
//     );

//     memberStatus = chatMember.status;
//     const isSubscribed = ["creator", "administrator", "member"].includes(
//       memberStatus
//     );

//     text += `${index + 1}. ${channel.name} - ${
//       isSubscribed ? "✅ Obuna bo'lgansiz" : "❌ Obuna bo'lmagansiz"
//     }\n`;

//     // text += `${index + 1}. ${channel.name}\n`;
//     console.log("isSubscribed", isSubscribed);
//     if (!isSubscribed) {
//       const linkText = await bot.telegram.createChatInviteLink(
//         channel.telegram_id,
//         {
//           creates_join_request: true,
//           name: `Join Request ${new Date().toISOString()}`,
//         }
//       );

//       inlineKeyboard.push([
//         Markup.button.url(
//           `Obuna bo'lish: ${channel.name}`,
//           linkText.invite_link
//         ),
//       ]);
//       console.log(linkText);
//       // inlineKeyboard.push([
//       //   Markup.button.url(
//       //     `Obuna bo'lish: ${channel.name}`,
//       //     linkText.invite_link
//       //   ),
//       // ]);
//       await prisma.invitedLink.create({
//         data: {
//           link: linkText.invite_link,
//           user_id: user.id,
//         },
//       });
//     }
//   }

//   ctx.reply(text, {
//     parse_mode: "Markdown",
//     ...Markup.inlineKeyboard(inlineKeyboard),
//   });
// });

const ITEMS_PER_PAGE = 10; // Har bir sahifadagi obunalar soni

scene.hears("Obunalar", async (ctx) => {
  await showSubscriptions(ctx, 1); // 1-sahifadan boshlaymiz
});

scene.action(/^view_subscription_/, async (ctx: any) => {
  const subscriptionId = ctx.update.callback_query?.data.split("_")[2];

  console.log("Viewing subscription", subscriptionId);
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { channelBundle: { include: { channels: true } } },
  });

  if (!subscription || !subscription.endDate) {
    return ctx.answerCbQuery("Obuna topilmadi");
  }

  let text = `📦 To'plam: ${subscription.channelBundle.name}\n\n`;
  text += `📅 Tugash sanasi: ${subscription?.endDate.toLocaleDateString()}\n`;
  text += `⏳ Qolgan kun: ${Math.ceil(
    (subscription?.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )}\n\n`;
  text += `📢 Kanallar:\n`;

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
      console.error(`Error checking member status: ${error}`);
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
            `Obuna bo'lish: ${channel.name}`,
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
        console.error(`Error creating invite link: ${error}`);
      }
    }
  }

  inlineKeyboard.push([
    Markup.button.callback("⬅️ Orqaga", "back_to_subscriptions"),
  ]);

  await ctx.editMessageText(text, Markup.inlineKeyboard(inlineKeyboard));
  await ctx.answerCbQuery();
});

// Pagination uchun action
scene.action(/^subscriptions_page_(\d+)$/, async (ctx: any) => {
  const page = ctx.update.callback_query?.data.split("_")[2];
  await showSubscriptions(ctx, page);
  await ctx.answerCbQuery();
});

// Obuna ma'lumotlarini ko'rish uchun action

// Orqaga qaytish uchun action
scene.action("back_to_subscriptions", async (ctx) => {
  ctx.deleteMessage();
  await showSubscriptions(ctx, 1);
  await ctx.answerCbQuery();
});

async function showSubscriptions(ctx: any, page: number) {
  const user = await prisma.user.findFirst({
    where: {
      telegram_id: String(ctx.from.id),
    },
  });

  if (!user) {
    return ctx.reply("Sizda obuna bo'lgan kanallar yo'q");
  }

  const totalSubscriptions = await prisma.subscription.count({
    where: {
      user_id: user.id,
      status: "ACTIVE",
    },
  });

  const subscriptions = await prisma.subscription.findMany({
    where: {
      user_id: user.id,
      status: "ACTIVE",
    },
    include: {
      channelBundle: true,
    },
    skip: (page - 1) * ITEMS_PER_PAGE,
    take: ITEMS_PER_PAGE,
    orderBy: {
      created_at: "asc",
    },
  });

  if (subscriptions.length === 0) {
    return ctx.reply("Sizda faol obunalar yo'q");
  }

  let text = "Sizning obunalaringiz:\n\n";
  const inlineKeyboard = [];

  for (let [index, subscription] of subscriptions.entries()) {
    const daysLeft = Math.ceil(
      ((subscription?.endDate?.getTime() || new Date().getTime()) -
        Date.now()) /
        (1000 * 60 * 60 * 24)
    );
    text += `${(page - 1) * ITEMS_PER_PAGE + index + 1}. ${
      subscription.channelBundle.name
    }\n`;
    text += `   Tugash sanasi: ${new Date(
      subscription.endDate?.getTime() ||
        subscription.created_at.getTime() + 30 * 86400 * 1000
    ).toLocaleDateString()}\n`;
    text += `   Qolgan kun: ${daysLeft}\n\n`;

    inlineKeyboard.push([
      Markup.button.callback(
        `🔍 ${subscription.channelBundle.name}`,
        `view_subscription_${subscription.id}`
      ),
    ]);
  }

  // Pagination tugmalari
  const paginationButtons = [];
  if (page > 1) {
    paginationButtons.push(
      Markup.button.callback("⬅️ Oldingi", `subscriptions_page_${page - 1}`)
    );
  }
  if (page * ITEMS_PER_PAGE < totalSubscriptions) {
    paginationButtons.push(
      Markup.button.callback("Keyingi ➡️", `subscriptions_page_${page + 1}`)
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
    return ctx.reply("Sizda to'lovlar tarixi yo'q");
  }

  const totalPayments = await prisma.transaction.count({
    where: {
      userId: user.id,
      status: "COMPLETED",
    },
  });

  let text = "To'lovlar tarixi:\n\n";
  const inlineKeyboard = [];

  for (let [index, payment] of user.transactions.entries()) {
    text += `${(page - 1) * ITEMS_PER_PAGE + index + 1}. ${
      payment.amount
    } so'm - ${payment.created_at.toLocaleString()}\n`;
  }

  // Pagination tugmalari
  const paginationButtons = [];
  if (page > 1) {
    paginationButtons.push(
      Markup.button.callback("⬅️ Oldingi", `payment_history_page_${page - 1}`)
    );
  }
  if (page * ITEMS_PER_PAGE < totalPayments) {
    paginationButtons.push(
      Markup.button.callback("Keyingi ➡️", `payment_history_page_${page + 1}`)
    );
  }
  if (paginationButtons.length > 0) {
    inlineKeyboard.push(paginationButtons);
  }

  inlineKeyboard.push([Markup.button.callback("Orqaga", "back_to_start")]);

  await ctx.reply(text, Markup.inlineKeyboard(inlineKeyboard));
}

scene.hears("To'lovlar tarixi", async (ctx) => {
  await showPaymentHistory(ctx, 1); // 1-sahifadan boshlaymiz
});

scene.action(/^payment_history_page_(\d+)$/, async (ctx: any) => {
  const page = ctx.update.callback_query?.data.split("_")[3];
  await showPaymentHistory(ctx, page);
  await ctx.answerCbQuery();
});

scene.hears("Sozlamalar", async (ctx: any) => {
  const notification = ctx.session.notification || false;

  const notificationText = notification
    ? "Bildirishnomalar yoqilgan"
    : "Bildirishnomalar o'chirilgan";
  ctx.reply("Bildirishnoma sozlamalari", {
    reply_markup: {
      inline_keyboard: [
        [Markup.button.callback(notificationText, "toggle_notification")],
        [Markup.button.callback("Orqaga", "back_to_start")],
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
            ? "Bildirishnomalar yoqilgan"
            : "Bildirishnomalar o'chirilgan",
          "toggle_notification"
        ),
      ],
      [Markup.button.callback("Orqaga", "back_to_start")],
    ],
  });
});

scene.action("back_to_start", async (ctx: any) => {
  ctx.deleteMessage();
  await ctx.scene.enter("start");
});

export default scene;
