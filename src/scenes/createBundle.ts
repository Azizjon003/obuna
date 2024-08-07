import { Markup, Scenes } from "telegraf";
import prisma from "../../prisma/prisma";
import { showBundles } from "./merchant";

const scene = new Scenes.BaseScene("createBundle");

scene.hears("/start", async (ctx: any) => {
  return await ctx.scene.enter("start");
});

scene.enter(async (ctx: any) => {
  ctx.session.bundle = {};
  await ctx.reply("Yangi to'plam nomini kiriting:");
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
      ctx.session.bundle.channels.push(channel);
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
scene.on("text", async (ctx: any) => {
  const step = ctx.session.step || 0;

  // if (ctx.message.text === "Tugatish" && step === 3) {
  //   ctx.session.bundle.channels = ctx.session.bundle.channels || [];

  //   console
  //   await createBundle(ctx, ctx.session.bundle);
  //   return;
  // }
  switch (step) {
    case 0:
      ctx.session.bundle.name = ctx.message.text;
      await ctx.reply("To'plam narxini kiriting (so'm):");
      ctx.session.step = 1;
      break;

    case 1:
      const price = parseFloat(ctx.message.text);
      if (isNaN(price)) {
        await ctx.reply("Noto'g'ri narx kiritildi. Iltimos, raqam kiriting:");
        return;
      }
      ctx.session.bundle.price = price;
      await ctx.reply("To'plam tavsifini kiriting (ixtiyoriy):");
      ctx.session.step = 2;
      break;

    case 2:
      ctx.session.bundle.description = ctx.message.text;
      await ctx.reply(
        'Kanallarni qo\'shish uchun har bir kanaldan bitta xabarni forward qiling. Tugatish uchun "Tugatish" tugmasini bosing.',
        Markup.keyboard([["Tugatish"]])
          .oneTime()
          .resize()
      );
      ctx.session.step = 3;
      ctx.session.bundle.channels = [];
      break;
    case 3:
      if (ctx.message.text === "Tugatish") {
        // Kanallarni qo'shish jarayoni tugadi
        ctx.session.bundle.channels = ctx.session.bundle.channels;

        console.log(ctx.session.bundle);
        await createBundle(ctx, ctx.session.bundle);
        return;
      }
      await ctx.reply(
        'Iltimos, kanaldan xabarni forward qiling yoki "Tugatish" tugmasini bosing.'
      );
      break;

    default:
      await ctx.reply("Noma'lum buyruq. Iltimos, ko'rsatmalarga amal qiling.");
  }
});

async function createBundle(ctx: any, bundleData: any) {
  try {
    const newBundle = await prisma.channelBundle.create({
      data: {
        name: bundleData.name,
        price: bundleData.price,
        description: bundleData.description,
        merchantUser: {
          connect: { telegram_id: String(ctx.from.id) },
        },
        channels: {
          create: bundleData.channels,
        },
      },
    });

    await ctx.reply(
      `To'plam "${newBundle.name}" muvaffaqiyatli yaratildi!`,
      Markup.removeKeyboard()
    );
  } catch (error) {
    console.error("Error creating bundle:", error);
    await ctx.reply(
      "To'plam yaratishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
    );
  }

  await showBundles(ctx, 1); // Assuming you have this function defined elsewhere
  return ctx.scene.leave();
}

export default scene;
