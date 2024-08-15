import { Markup, Scenes } from "telegraf";
import prisma from "../../prisma/prisma";
import { showBundles } from "./admin";

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
    await ctx.reply("Пакет не найден.");
    return ctx.scene.leave();
  }

  ctx.session.bundle = bundle;
  ctx.session.step = 0;
  await ctx.reply(
    `Редактирование пакета "${bundle.name}".\nВведите новое название или напишите "Пропустить", чтобы оставить без изменений:`
  );
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
        `Канал "${channel.name}" добавлен. Перешлите сообщение из другого канала, чтобы добавить его, или нажмите кнопку "Завершить".`
      );
    } else {
      await ctx.reply(
        "Это сообщение не из канала. Пожалуйста, перешлите сообщение из канала."
      );
    }
  }
});

scene.on("text", async (ctx: any) => {
  const step = ctx.session.step;
  const bundleData = ctx.session.bundle;

  switch (step) {
    case 0:
      if (ctx.message.text.toLowerCase() !== "пропустить") {
        bundleData.name = ctx.message.text;
      }
      await ctx.reply(
        `Введите новую цену или напишите "Пропустить", чтобы оставить без изменений:`
      );
      ctx.session.step = 1;
      break;

    case 1:
      if (ctx.message.text.toLowerCase() !== "пропустить") {
        const price = parseFloat(ctx.message.text);
        if (isNaN(price)) {
          await ctx.reply(
            "Введена некорректная цена. Пожалуйста, введите число:"
          );
          return;
        }
        bundleData.price = price;
      }
      await ctx.reply(
        `Введите новое описание или напишите "Пропустить", чтобы оставить без изменений:`
      );
      ctx.session.step = 2;
      break;

    case 2:
      if (ctx.message.text.toLowerCase() !== "пропустить") {
        bundleData.description = ctx.message.text;
      }
      await ctx.reply(
        'Перешлите по одному сообщению из каждого нового канала, который вы хотите добавить. Если вы не хотите изменять каналы, напишите "Пропустить". Нажмите кнопку "Завершить", когда закончите добавлять каналы.',
        Markup.keyboard([["Пропустить"], ["Завершить"]])
          .oneTime()
          .resize()
      );
      ctx.session.step = 3;
      ctx.session.newChannels = [];
      break;

    case 3:
      if (ctx.message.text === "Пропустить") {
        await updateBundle(ctx, bundleData);
        return;
      } else if (ctx.message.text === "Завершить") {
        bundleData.channels = ctx.session.newChannels;
        await updateBundle(ctx, bundleData);
        return;
      } else {
        await ctx.reply(
          'Пожалуйста, перешлите сообщение из канала, нажмите "Пропустить" или "Завершить".'
        );
      }
      break;
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
      `Пакет "${bundleData.name}" успешно обновлен!`,
      Markup.removeKeyboard()
    );
  } catch (error) {
    console.error("Ошибка при обновлении пакета:", error);
    await ctx.reply(
      "Произошла ошибка при обновлении пакета. Пожалуйста, попробуйте еще раз."
    );
    ctx.session.bundle = {};
    ctx.session.step = 0;
  }

  await showBundles(ctx, 1);
  return ctx.scene.enter("admin");
}

export default scene;
