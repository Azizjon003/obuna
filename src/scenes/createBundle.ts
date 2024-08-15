import { Markup, Scenes } from "telegraf";
import prisma from "../../prisma/prisma";
import { showBundles } from "./admin";

const scene = new Scenes.BaseScene("createBundle");

scene.hears("/start", async (ctx: any) => {
  ctx.session.bundle = {};
  ctx.session.step = 0;
  return await ctx.scene.enter("start");
});

scene.enter(async (ctx: any) => {
  ctx.session.bundle = {};
  await ctx.reply("Введите название нового пакета:");
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
        `Канал "${channel.name}" добавлен. Перешлите сообщение из другого канала для добавления или нажмите кнопку "Завершить".`
      );
    } else {
      await ctx.reply(
        "Это сообщение не из канала. Пожалуйста, перешлите сообщение из канала."
      );
    }
  }
});

scene.on("text", async (ctx: any) => {
  const step = ctx.session.step || 0;

  switch (step) {
    case 0:
      ctx.session.bundle.name = ctx.message.text;
      await ctx.reply("Введите цену пакета (в сумах):");
      ctx.session.step = 1;
      break;

    case 1:
      const price = parseFloat(ctx.message.text);
      if (isNaN(price)) {
        await ctx.reply("Введена неверная цена. Пожалуйста, введите число:");
        return;
      }
      ctx.session.bundle.price = price;
      await ctx.reply("Введите описание пакета (необязательно):");
      ctx.session.step = 2;
      break;

    case 2:
      ctx.session.bundle.description = ctx.message.text;
      await ctx.reply(
        'Чтобы добавить каналы, перешлите по одному сообщению из каждого канала. Нажмите кнопку "Завершить", когда закончите.',
        Markup.keyboard([["Завершить"]])
          .oneTime()
          .resize()
      );
      ctx.session.step = 3;
      ctx.session.bundle.channels = [];
      break;
    case 3:
      if (ctx.message.text === "Завершить") {
        ctx.session.bundle.channels = ctx.session.bundle.channels;

        console.log(ctx.session.bundle);
        await createBundle(ctx, ctx.session.bundle);
        return;
      }
      await ctx.reply(
        'Пожалуйста, перешлите сообщение из канала или нажмите кнопку "Завершить".'
      );
      break;

    default:
      ctx.session.bundle = {};
      ctx.session.step = 0;
      await ctx.reply(
        "Неизвестная команда. Пожалуйста, следуйте инструкциям. Начните заново."
      );
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
      `Пакет "${newBundle.name}" успешно создан!`,
      Markup.removeKeyboard()
    );
  } catch (error) {
    console.error("Ошибка при создании пакета:", error);
    ctx.session.bundle = {};
    ctx.session.step = 0;
    await ctx.reply(
      "Произошла ошибка при создании пакета. Пожалуйста, попробуйте еще раз."
    );
  }

  await showBundles(ctx, 1);
  return ctx.scene.enter("admin");
}

export default scene;
