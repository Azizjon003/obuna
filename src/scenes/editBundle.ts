import { Scenes } from "telegraf";

import prisma from "../../prisma/prisma";
import { showBundles } from "./merchant";

const scene = new Scenes.BaseScene<Scenes.SceneContext>("editBundle");

scene.hears("/start", async (ctx: any) => {
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
        "Yangi kanallar ro'yxatini kiriting (har bir kanal yangi qatorda) yoki mavjud kanallarni o'zgartirmaslik uchun \"O'tkazib yuborish\" deb yozing:\nMisol:\nKanal nomi 1 - https://t.me/kanal1\nKanal nomi 2 - https://t.me/kanal2"
      );
      ctx.session.step = 3;
      break;

    case 3:
      if (ctx.message.text.toLowerCase() !== "o'tkazib yuborish") {
        const channelLines = ctx.message.text.split("\n");
        const channels = channelLines.map((line: any) => {
          const [name, link] = line.split(" - ");
          return { name: name.trim(), link: link.trim() };
        });
        bundleData.channels = channels;
      }

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
          `To'plam "${bundleData.name}" muvaffaqiyatli yangilandi!`
        );
      } catch (error) {
        console.error("Error updating bundle:", error);
        await ctx.reply(
          "To'plamni yangilashda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
        );
      }

      await showBundles(ctx, 1); // Assuming you have this function defined elsewhere
      return ctx.scene.leave();
  }
});

export default scene;
