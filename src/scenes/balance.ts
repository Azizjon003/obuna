import { Scenes } from "telegraf";
import prisma from "../../prisma/prisma";

const scene = new Scenes.BaseScene("balance");

scene.hears("/start", async (ctx: any) => {
  return await ctx.scene.enter("start");
});

scene.action("top_up_balance", async (ctx) => {
  const user = await prisma.user.findFirst({
    where: {
      telegram_id: String(ctx.from.id),
    },
  });

  if (!user) {
    return ctx.reply("Sizda balans mavjud emas");
  }

  const tier = await prisma.subscriptionTier.findFirst({
    where: {},
  });
});

export default scene;
