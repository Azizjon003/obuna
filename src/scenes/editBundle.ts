import { Markup, Scenes } from "telegraf";
import prisma from "../../prisma/prisma";
import { showBundles } from "./merchant";

const scene = new Scenes.BaseScene<Scenes.SceneContext>("editBundle");

scene.hears("/start", async (ctx: any) => {
  ctx.session.bundle = {};
  ctx.session.step = 0;
  return await ctx.scene.enter("start");
});

scene.enter(async (ctx: any) => {
  const bundleId = ctx.session.bundleId;
  const bundle = await prisma.channelBundle.findUnique({
    where: { id: bundleId },
    include: { channels: true },
  });

  if (!bundle) {
    await ctx.reply("To'plam topilmadi.");
    return ctx.scene.leave();
  }

  ctx.session.bundle = bundle;
  ctx.session.step = 0;
  await ctx.reply(
    `To'plam "${bundle.name}" ni tahrirlash.\nYangi nomni kiriting yoki o'zgartirmaslik uchun "O'tkazib yuborish" deb yozing:`
  );
});

scene.on("text", async (ctx: any) => {
  const step = ctx.session.step;
  const bundleData = ctx.session.bundle;

  switch (step) {
    case 0:
      if (ctx.message.text.toLowerCase() !== "o'tkazib yuborish") {
        bundleData.name = ctx.message.text;
      }
      await ctx.reply(
        `Yangi narxni kiriting yoki o'zgartirmaslik uchun "O'tkazib yuborish" deb yozing:`
      );
      ctx.session.step = 1;
      break;

    case 1:
      if (ctx.message.text.toLowerCase() !== "o'tkazib yuborish") {
        const price = parseFloat(ctx.message.text);
        if (isNaN(price)) {
          await ctx.reply("Noto'g'ri narx kiritildi. Iltimos, raqam kiriting:");
          return;
        }
        bundleData.price = price;
      }
      await ctx.reply(
        `Yangi tavsifni kiriting yoki o'zgartirmaslik uchun "O'tkazib yuborish" deb yozing:`
      );
      ctx.session.step = 2;
      break;

    case 2:
      if (ctx.message.text.toLowerCase() !== "o'tkazib yuborish") {
        bundleData.description = ctx.message.text;
      }
      await ctx.reply(
        "Yangi kanallarni qo'shish uchun har bir kanaldan bitta xabarni forward qiling. Agar kanallarni o'zgartirmoqchi bo'lmasangiz, \"O'tkazib yuborish\" deb yozing. Kanallarni qo'shishni tugatish uchun \"Tugatish\" tugmasini bosing.",
        Markup.keyboard([["O'tkazib yuborish"], ["Tugatish"]])
          .oneTime()
          .resize()
      );
      ctx.session.step = 3;
      ctx.session.newChannels = [];
      break;

    case 3:
      if (ctx.message.text === "O'tkazib yuborish") {
        await updateBundle(ctx, bundleData);
        return;
      } else if (ctx.message.text === "Tugatish") {
        bundleData.channels = ctx.session.newChannels;
        await updateBundle(ctx, bundleData);
        return;
      } else {
        await ctx.reply(
          'Iltimos, kanaldan xabarni forward qiling, "O\'tkazib yuborish" yoki "Tugatish" tugmasini bosing.'
        );
      }
      break;
  }
});

scene.on("forward_date", async (ctx: any) => {
  if (ctx.session.step === 3) {
    const forwardedMsg = ctx.message;
    if (
      forwardedMsg.forward_from_chat &&
      forwardedMsg.forward_from_chat.type === "channel"
    ) {
      const channel = {
        name: forwardedMsg.forward_from_chat.title,
        telegram_id: String(forwardedMsg.forward_from_chat.id),
      };
      ctx.session.newChannels.push(channel);
      await ctx.reply(
        `Kanal "${channel.name}" qo'shildi. Yana kanal qo'shish uchun xabar forward qiling yoki "Tugatish" tugmasini bosing.`
      );
    } else {
      await ctx.reply(
        "Bu xabar kanaldan emas. Iltimos, kanaldan xabarni forward qiling."
      );
    }
  }
});

async function updateBundle(ctx: any, bundleData: any) {
  try {
    await prisma.channelBundle.update({
      where: { id: bundleData.id },
      data: {
        name: bundleData.name,
        price: bundleData.price,
        description: bundleData.description,
      },
    });

    if (bundleData.channels) {
      await prisma.channel.deleteMany({
        where: { channelBundleId: bundleData.id },
      });

      await prisma.channel.createMany({
        data: bundleData.channels.map((channel: any) => ({
          ...channel,
          channelBundleId: bundleData.id,
        })),
      });
    }

    await ctx.reply(
      `To'plam "${bundleData.name}" muvaffaqiyatli yangilandi!`,
      Markup.removeKeyboard()
    );
  } catch (error) {
    console.error("Error updating bundle:", error);
    await ctx.reply(
      "To'plamni yangilashda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
    );
    ctx.session.bundle = {};
    ctx.session.step = 0;
  }

  await showBundles(ctx, 1);
  return ctx.scene.enter("merchant");
}

export default scene;
