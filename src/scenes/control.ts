import { Markup, Scenes } from "telegraf";
import prisma from "../../prisma/prisma";
import bot from "../core/bot";

const scene = new Scenes.BaseScene("control");

scene.hears("/start", async (ctx: any) => {
  return await ctx.scene.enter("start");
});

scene.hears("Obunalar", async (ctx) => {
  const channels = await prisma.subscriptionChannel.findMany({
    where: {
      isActive: true,
    },
  });

  if (channels.length === 0) {
    return ctx.reply("Hozircha obuna bo'lgan kanallar yo'q");
  }
  const user = await prisma.user.findFirst({
    where: {
      telegram_id: String(ctx.from.id),
    },
  });

  if (!user) {
    return ctx.reply("Sizda obuna bo'lgan kanallar yo'q");
  }
  let text = "Obuna bo'lgan kanallar ro'yhati:\n\n";
  const inlineKeyboard = [];

  for (let [index, channel] of channels.entries()) {
    let memberStatus;
    const chatMember = await bot.telegram.getChatMember(
      channel.telegram_id,
      ctx.from.id
    );

    memberStatus = chatMember.status;
    const isSubscribed = ["creator", "administrator", "member"].includes(
      memberStatus
    );

    text += `${index + 1}. ${channel.name} - ${
      isSubscribed ? "✅ Obuna bo'lgansiz" : "❌ Obuna bo'lmagansiz"
    }\n`;

    // text += `${index + 1}. ${channel.name}\n`;
    console.log("isSubscribed", isSubscribed);
    if (!isSubscribed) {
      const linkText = await bot.telegram.createChatInviteLink(
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
      console.log(linkText);
      // inlineKeyboard.push([
      //   Markup.button.url(
      //     `Obuna bo'lish: ${channel.name}`,
      //     linkText.invite_link
      //   ),
      // ]);
      await prisma.invitedLink.create({
        data: {
          link: linkText.invite_link,
          user_id: user.id,
        },
      });
    }
  }

  ctx.reply(text, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(inlineKeyboard),
  });
});

scene.hears("Admin", async (ctx) => {
  ctx.reply("Admin");
});

export default scene;
