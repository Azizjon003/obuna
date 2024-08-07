import { Scenes } from "telegraf";
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

scene.on("text", async (ctx: any) => {
  const step = ctx.session.step || 0;

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
        "Kanallar ro'yxatini kiriting (har bir kanal yangi qatorda):\nMisol:\nKanal nomi 1 - https://t.me/kanal1\nKanal nomi 2 - https://t.me/kanal2"
      );
      ctx.session.step = 3;
      break;

    case 3:
      const channelLines = ctx.message.text.split("\n");
      const channels = channelLines.map((line: any) => {
        const [name, link] = line.split(" - ");
        return { name: name.trim(), telegram_id: link.trim() };
      });

      ctx.session.bundle.channels = channels;

      const bundleData = ctx.session.bundle;
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
          `To'plam "${newBundle.name}" muvaffaqiyatli yaratildi!`
        );
      } catch (error) {
        console.error("Error creating bundle:", error);
        await ctx.reply(
          "To'plam yaratishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
        );
      }

      await showBundles(ctx, 1); // Assuming you have this function defined elsewhere
      return await ctx.scene.leave();
  }
});

export default scene;
