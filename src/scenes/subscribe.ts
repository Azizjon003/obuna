import { Markup, Scenes } from "telegraf";
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
    return ctx.reply("Sizda obuna bo'lgan kanallar yo'q");
  }
  if (!bundleId) {
    await ctx.reply("Xatolik yuz berdi. Iltimos, boshidan boshlang.");
    return await ctx.scene.enter("control");
  }

  const channelBundle = await prisma.channelBundle.findUnique({
    where: { id: bundleId },
    include: { channels: true },
  });

  if (!channelBundle) {
    await ctx.reply("Kechirasiz, so'ralgan to'plam topilmadi.");
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
    await ctx.reply("Siz allaqachon ushbu to'plamga obuna bo'lgansiz.");
    return await ctx.scene.enter("control");
  }

  const confirmKeyboard = {
    inline_keyboard: [
      [
        {
          text: "Ha, obuna bo'lish",
          callback_data: `confirm_subscribe_${bundleId}`,
        },
        { text: "Yo'q, bekor qilish", callback_data: "cancel_subscribe" },
      ],
    ],
  };

  await ctx.reply(
    `Siz "${channelBundle.name}" to'plamiga obuna bo'lmoqchimisiz?\n` +
      `Narxi: ${channelBundle.price} so'm\n` +
      `Obuna bo'lishni tasdiqlaysizmi?`,
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
      await ctx.answerCbQuery("Foydalanuvchi topilmadi.");
      return await ctx.scene.enter("control");
    }

    const channelBundle = await prisma.channelBundle.findUnique({
      where: { id: bundleId },
      include: { channels: true },
    });

    if (!channelBundle) {
      await ctx.answerCbQuery("Kanal to'plami topilmadi.");
      return await ctx.scene.enter("control");
    }

    // To'lov jarayonini bu yerda amalga oshiring
    // Misol uchun: const paymentResult = await processPayment(user_id, bundleId);

    console.log("user", user, channelBundle);
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
      title: `Obuna to'lovi: ${channelBundle.name}`,
      description: `Obuna uchun 1 oylik to'lov summasi`,
      payload: "bundle_" + transaction.id,
      provider_token: process.env.TELEGRAM_PAYMENT_TOKEN,
      start_parameter: "bundle_" + transaction.id,
      currency: "UZS",
      prices: [
        {
          label: "Bundle Price",
          amount: Math.round(channelBundle.price * 100),
        },
      ],
    });
  } catch (error) {
    console.error("Obuna yaratishda xatolik:", error);
    await ctx.answerCbQuery(
      "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
    );
  }

  return await ctx.scene.enter("control");
});

export default scene;
