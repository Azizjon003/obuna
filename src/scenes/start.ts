import { Scenes } from "telegraf";
import prisma from "../../prisma/prisma";
import enabled from "../utils/enabled";
import { keyboards } from "../utils/keyboards";
const scene = new Scenes.BaseScene("start");

export let keyboard = [["Подписки", "История платежей"], ["Настройки"]];
export let admin_keyboard = [
  ["Статистика", "Список пользователей"],
  ["Список пакетов", "Список платежей"],
  ["Отправить сообщение"],
];
export let merchant_keyboard = [
  ["Список пользователей"],
  ["Список пакетов"],
  ["Список платежей"],
];

scene.enter(async (ctx: any) => {
  const user_id = ctx.from?.id;

  const user_name = ctx.from?.first_name || ctx.from?.username;
  const channelBundleId = ctx.startPayload; // Параметр запуска Telegram бота

  const enable = await enabled(String(user_id), String(user_name));

  if (enable === "one") {
    if (channelBundleId) {
      const channelBundle = await prisma.channelBundle.findFirst({
        where: {
          id: String(channelBundleId),
        },
        include: {
          channels: true,
        },
      });

      const subscription = await prisma.subscription.findFirst({
        where: {
          user: {
            telegram_id: ctx.from.id.toString(),
          },
          channelBundleId: channelBundleId,
          endDate: {
            gte: new Date(),
          },
          status: "ACTIVE",
        },
      });

      if (subscription) {
        return ctx.reply("У вас уже есть эта подписка");
      }
      if (channelBundle) {
        const bundleInfo = `
      📦 Пакет: "${channelBundle.name}"
      
      📝 Описание: ${channelBundle.description || "Описание отсутствует"}
      
      💰 Цена: ${channelBundle.price} сум
      
      📊 Количество каналов: ${channelBundle.channels.length}
      
      Список каналов:
      ${channelBundle.channels
        .map((channel: any, index: any) => `${index + 1}. ${channel.name}`)
        .join("\n")}
      `;
        const subscribeButton = {
          text: "Подписаться",
          callback_data: `subscribe_${channelBundle.id}`,
        };

        // Отправка сообщения
        await ctx.telegram.sendMessage(
          user_id,
          `Здравствуйте! 
    
    Вы отправили запрос о следующем пакете каналов:
    
    ${bundleInfo}
    
    Хотите подписаться на этот пакет?`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[subscribeButton]],
            },
          }
        );

        // Сохранение ID пакета для следующего шага
        ctx.scene.state.currentBundleId = channelBundle.id;
        return;
      }
    }
    ctx.telegram.sendMessage(
      user_id,
      `Здравствуйте! Для доступа к специальным каналам вам нужно купить подписку`,
      keyboards(keyboard)
    );

    console.log("start scene");
    return await ctx.scene.enter("control");
  } else if (enable === "two") {
    const text = "Здравствуйте, Админ! Добро пожаловать";

    ctx.telegram.sendMessage(user_id, text, keyboards(admin_keyboard));
    return await ctx.scene.enter("admin");
  } else if (enable === "three") {
    ctx.telegram.sendMessage(
      user_id,
      "Здравствуйте. Извините, вы заблокированы администратором"
    );
    return;
  } else if (enable === "four") {
    ctx.telegram.sendMessage(
      user_id,
      "Здравствуйте, Мерчант! Добро пожаловать",
      keyboards(merchant_keyboard)
    );

    return await ctx.scene.enter("merchant");
  }
});

scene.action(/^subscribe_/, async (ctx: any) => {
  console.log("subscribe_", ctx.update.callback_query.data);
  const bundleId = ctx.update.callback_query.data.split("_")[1];

  console.log("bundleId", bundleId);
  ctx.session.currentBundleId = bundleId;

  return await ctx.scene.enter("subscribe");
});

export default scene;
