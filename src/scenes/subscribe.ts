import { Scenes } from "telegraf";
import prisma from "../../prisma/prisma";

const scene = new Scenes.BaseScene("subscribe");

scene.hears("/start", async (ctx: any) => {
  return await ctx.scene.enter("start");
});

scene.enter(async (ctx: any) => {
  ctx.deleteMessage();
  const user_id = ctx.from?.id;
  const bundleId = ctx.session.currentBundleId;

  const user = await prisma.user.findFirst({
    where: { telegram_id: String(user_id) },
  });

  if (!user) {
    return ctx.reply("У вас нет подписанных каналов");
  }
  if (!bundleId) {
    await ctx.reply("Произошла ошибка. Пожалуйста, начните сначала.");
    return await ctx.scene.enter("control");
  }

  const channelBundle = await prisma.channelBundle.findUnique({
    where: { id: bundleId },
    include: { channels: true },
  });

  if (!channelBundle) {
    await ctx.reply("Извините, запрошенный пакет не найден.");
    return await ctx.scene.enter("control");
  }

  const subscriptionExists = await prisma.subscription.findFirst({
    where: {
      user_id: user.id,
      channelBundleId: bundleId,
      status: "ACTIVE",
    },
  });

  if (subscriptionExists) {
    await ctx.reply("Вы уже подписаны на этот пакет.");
    return await ctx.scene.enter("control");
  }

  const confirmKeyboard = {
    inline_keyboard: [
      [
        {
          text: "Да, подписаться",
          callback_data: `confirm_subscribe_${bundleId}`,
        },
        { text: "Нет, отменить", callback_data: "cancel_subscribe" },
      ],
    ],
  };

  await ctx.reply(
    `Вы хотите подписаться на пакет "${channelBundle.name}"?\n` +
      `Цена: ${channelBundle.price} сум\n` +
      `Подтверждаете подписку?`,
    { reply_markup: confirmKeyboard }
  );
});

scene.action(/^confirm_subscribe_/, async (ctx: any) => {
  const bundleId = ctx.update.callback_query.data.split("_")[2];
  const user_id = ctx.from?.id;

  try {
    const user = await prisma.user.findFirst({
      where: {
        telegram_id: String(user_id),
      },
    });

    if (!user) {
      await ctx.answerCbQuery("Пользователь не найден.");
      return await ctx.scene.enter("control");
    }

    const channelBundle = await prisma.channelBundle.findUnique({
      where: { id: bundleId },
      include: { channels: true },
    });

    if (!channelBundle) {
      await ctx.answerCbQuery("Пакет каналов не найден.");
      return await ctx.scene.enter("control");
    }

    // Здесь реализуйте процесс оплаты
    // Например: const paymentResult = await processPayment(user_id, bundleId);

    console.log("user", user, channelBundle);

    // await ctx.deleteMessage();
    const newSubscription = await prisma.subscription.create({
      data: {
        user_id: user.id,
        channelBundleId: channelBundle.id,
        status: "PENDING",
        price: channelBundle.price,
        endDate: new Date(new Date().getTime() + 30 * 86400 * 1000),
      },
    });

    const transaction = await prisma.transaction.create({
      data: {
        userId: user.id,
        amount: channelBundle.price,
        status: "PENDING",
        subscriptionId: newSubscription.id,
      },
    });
    const invoiceMessage = await ctx.telegram.sendInvoice(user.telegram_id, {
      title: `Оплата подписки: ${channelBundle.name}`,
      description: `Сумма оплаты за 1 месяц подписки`,
      payload: "bundle_" + transaction.id,
      provider_token: process.env.TELEGRAM_PAYMENT_TOKEN,
      start_parameter: "bundle_" + transaction.id,
      currency: "UZS",
      prices: [
        {
          label: "Цена пакета",
          amount: Math.round(channelBundle.price * 100),
        },
      ],
    });
  } catch (error) {
    console.error("Ошибка при создании подписки:", error);
    await ctx.answerCbQuery(
      "Произошла ошибка. Пожалуйста, попробуйте еще раз."
    );
  }

  return await ctx.scene.enter("control");
});

export default scene;
