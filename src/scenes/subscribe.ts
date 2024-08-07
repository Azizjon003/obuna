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
        status: "ACTIVE",
        price: channelBundle.price,
        endDate: new Date(new Date().getTime() + 30 * 86400 * 1000),
      },
    });

    await prisma.merchantWallet.update({
      where: {
        merchantUserId: channelBundle.merchantUserId,
      },
      data: {
        balance: {
          increment: channelBundle.price,
        },
      },
    });

    await ctx.answerCbQuery("Obuna muvaffaqiyatli yaratildi!");

    let text = "Tabriklaymiz! Siz muvaffaqiyatli obuna bo'ldingiz.\n\n";
    text += "Quyidagi kanallarga qo'shilishingiz mumkin:\n\n";

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
        isSubscribed ? "✅ Obuna bo'lgansiz" : "❌ Obuna bo'lmagansiz"
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
              `Obuna bo'lish: ${channel.name}`,
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

    await ctx.reply(text, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(inlineKeyboard),
    });
  } catch (error) {
    console.error("Obuna yaratishda xatolik:", error);
    await ctx.answerCbQuery(
      "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
    );
  }

  return await ctx.scene.enter("control");
});

scene.on("message", async (ctx: any) => {
  await ctx.reply("Iltimos, yuqoridagi tugmalardan birini tanlang.");
});

export default scene;
