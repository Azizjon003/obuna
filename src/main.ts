require("dotenv").config();
import console from "console";
import cron from "node-cron";
import { Markup } from "telegraf";
import prisma from "../prisma/prisma";
import bot from "./core/bot";
import session from "./core/session";
import stage from "./scenes/index";
import botStart from "./utils/startBot";
import { isInvited } from "./utils/subcribe";

bot.use(isInvited);
bot.use(session);

bot.use(stage.middleware());

bot.use((ctx: any, next) => {
  console.log("next", ctx?.session);
  return next();
});

bot.start(async (ctx: any) => {
  return await ctx.scene.enter("start");
});

bot.hears(
  ["Новая Презентация", "Баланс", "Пригласить друзей", "Главное меню"], //  commandlar bot o'chib qolgan vaziyatda user qayta startni  bosganda javob berish uchun
  async (ctx: any) => {
    ctx.reply("Неизвестная команда. Нажмите команду /start снова");
  }
);

bot.on("chat_join_request", async (ctx) => {
  console.log("chat_join_request", ctx.chatJoinRequest);
  const invitedLink = String(
    ctx.chatJoinRequest.invite_link?.invite_link || "что-то"
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
      "Вы подписались на все каналы в списке"
    );
  }
  const chatId = ctx.chatJoinRequest.chat.id;
  await bot.telegram.revokeChatInviteLink(chatId, invitedLink);
});
bot.on("pre_checkout_query", async (ctx) => {
  console.log("pre_checkout_query", ctx.preCheckoutQuery);
  const transactionId = ctx.preCheckoutQuery.invoice_payload.split("_")[1];
  const telegram_id = ctx.from.id;

  const user = await prisma.user.findFirst({
    where: {
      telegram_id: String(telegram_id),
    },
  });

  if (!user) {
    return await ctx.answerPreCheckoutQuery(false);
  }

  const transaction = await prisma.transaction.findUnique({
    where: {
      id: transactionId,
    },
  });

  if (!transaction) {
    return await ctx.answerPreCheckoutQuery(false);
  }

  return await ctx.answerPreCheckoutQuery(true);
});

bot.on("successful_payment", async (ctx) => {
  const user_id = ctx.from.id;
  const user = await prisma.user.findFirst({
    where: {
      telegram_id: user_id.toString(),
    },
  });

  if (!user) {
    return bot.telegram.sendMessage(user_id, "Пользователь не найден");
  }

  const transactionId =
    ctx.message.successful_payment.invoice_payload.split("_")[1];

  const transaction = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
    },
    include: {
      subscription: {
        include: {
          channelBundle: {
            include: {
              channels: true,
            },
          },
        },
      },
    },
  });

  if (!transaction) {
    return bot.telegram.sendMessage(user_id, "Транзакция не найдена");
  }

  const channelBundle = transaction.subscription.channelBundle;

  await prisma.merchantWallet.upsert({
    where: {
      merchantUserId: channelBundle.merchantUserId,
    },
    update: {
      balance: {
        increment: channelBundle.price,
      },
    },
    create: {
      merchantUserId: channelBundle.merchantUserId,
      balance: channelBundle.price,
    },
  });

  // await ctx.answerCbQuery("Подписка успешно создана!");

  let text = "Поздравляем! Вы успешно подписались.\n\n";
  text += "Вы можете присоединиться к следующим каналам:\n\n";

  const inlineKeyboard = [];

  for (let channel of channelBundle.channels) {
    let memberStatus;
    try {
      const chatMember = await ctx.telegram.getChatMember(
        channel.telegram_id,
        user_id
      );
      memberStatus = chatMember.status;
    } catch (error) {
      console.error(`Error checking member status: ${error}`);
      memberStatus = "unknown";
    }

    const isSubscribed = ["creator", "administrator", "member"].includes(
      memberStatus
    );

    text += `${channel.name} - ${
      isSubscribed ? "✅ Вы подписаны" : "❌ Вы не подписаны"
    }\n`;

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
            user_id: user.id,
          },
        });
      } catch (error) {
        console.error(`Error creating invite link: ${error}`);
      }
    }
  }

  const updated = await prisma.subscription.update({
    where: {
      id: transaction.subscriptionId,
    },
    data: {
      status: "ACTIVE",
      endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
    },
  });

  const transactionUpdated = await prisma.transaction.update({
    where: {
      id: transactionId,
    },
    data: {
      status: "COMPLETED",
    },
  });

  await ctx.telegram.sendMessage(user.telegram_id, text, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(inlineKeyboard),
  });
});

bot.catch(async (err: any, ctx) => {
  const userId = ctx?.from?.id;
  if (userId) {
    await bot.telegram.sendMessage(
      userId,
      "Произошла ошибка. Пожалуйста, попробуйте снова\n нажмите на команду /start и попробуйте снова"
    );
  }

  console.log(err);
  console.log(`Ooops, encountered an error for ${ctx}`, err);
});
botStart(bot);

process.on("uncaughtException", (error) => {
  console.log("Необработанное исключение:", error, "Причина:", new Date());
});

process.on("unhandledRejection", (reason, promise) => {
  console.log(
    "Необработанное отклоненное обещание:",
    promise,
    "Причина:",
    new Date()
  );
});

async function removeFromChannel(
  channelId: string,
  userId: string,
  subscriptionId: string
) {
  try {
    await bot.telegram.banChatMember(channelId, Number(userId));
    console.log(`✅ ${userId} successfully removed from ${channelId}`);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Bandan chiqarish
    await bot.telegram.unbanChatMember(channelId, Number(userId));
    console.log(`✅ ${userId} unbanned from ${channelId}`);

    await prisma.subscription.update({
      where: {
        id: subscriptionId,
      },
      data: {
        status: "EXPIRED",
      },
    });
  } catch (error) {
    console.error(`❌ Error removing ${userId} from ${channelId}:`, error);
    // Xatoni yuqoriga uzatish
    throw error;
  }
}
// 0 12 * * *
cron.schedule("* * * * *", async () => {
  // har kuni soat 12:00 da ishlaydi
  try {
    const now = new Date();

    const users = await prisma.subscription.findMany({
      where: {
        endDate: {
          lte: now,
        },
        status: "ACTIVE",
      },
      include: {
        user: true,
        channelBundle: {
          include: {
            channels: true,
          },
        },
      },
    });

    for (let user of users) {
      try {
        const userData = user.user;
        const endDate = new Date(user?.endDate || new Date());

        // Kunlar farqini hisoblash
        const diffTime = endDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Faqat 5 kun va undan kam qolgan foydalanuvchilarga xabar yuborish
        console.log(`📅 ${userData?.name} ${diffDays} ${getDayWord(diffDays)}`);
        if (diffDays <= 5) {
          let text = "";

          // Kunlar soniga qarab matnni moslashtirish
          if (diffDays === 1) {
            text = `Здравствуйте дорогая ${userData?.name}
        сегодня последний день октября, последний день подписки на канал🌷

        Необходимо обновить подписку, чтобы смотреть новые уроки макияжа в ноябре ✨`;
          } else if (diffDays <= 0) {
            const channels = user.channelBundle.channels;
            if (channels.length > 0) {
              for (let channel of channels) {
                try {
                  await removeFromChannel(
                    channel.telegram_id,
                    userData?.telegram_id,
                    user.id
                  );
                } catch (error) {
                  console.error(
                    `❌ Error removing ${userData?.telegram_id} from ${channel.telegram_id}:`,
                    error
                  );
                }
              }
            }
            text = ` Здравствуйте дорогая ${userData?.name}
        сегодня последний день октября, последний день подписки на канал🌷

        Необходимо обновить подписку, чтобы смотреть новые уроки макияжа в ноябре ✨.\nВаша подписка закончилась.\nПросим Вас переподписать в течение 3 дней.\nПродлите подписку`;
          } else {
            text = `Здравствуйте дорогая ${userData?.name}
        сегодня последний день октября, последний день подписки на канал🌷

        Необходимо обновить подписку, чтобы смотреть новые уроки макияжа в ноябре ✨`;
          }

          // Foydalanuvchi telegram_id mavjud bo'lsagina xabar yuborish
          if (userData?.telegram_id) {
            await bot.telegram.sendMessage(userData.telegram_id, text);
          }
        }

        if (diffDays <= 0) {
          const channels = user.channelBundle.channels;
          if (channels.length > 0) {
            for (let channel of channels) {
              try {
                await removeFromChannel(
                  channel.telegram_id,
                  userData?.telegram_id,
                  user.id
                );
                console.log(
                  `📅 banned ${userData?.name} ${diffDays} ${getDayWord(
                    diffDays
                  )}`
                );
              } catch (error) {
                console.error(
                  `❌ Error removing ${userData?.telegram_id} from ${channel.telegram_id}:`,
                  error
                );
              }
            }
          }
        }
      } catch (error) {
        console.error("❌ Error sending message to user:", error);
      }
    }
  } catch (error) {
    console.error("Xatolik yuz berdi:", error);
  }
});

// Kun so'zini to'g'ri kelishikda qaytaruvchi funksiya
function getDayWord(days: number) {
  if (days >= 11 && days <= 19) return "дней";

  const lastDigit = days % 10;
  if (lastDigit === 1) return "день";
  if (lastDigit >= 2 && lastDigit <= 4) return "дня";
  return "дней";
}
