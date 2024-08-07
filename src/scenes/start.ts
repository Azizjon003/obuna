import { Scenes } from "telegraf";
import prisma from "../../prisma/prisma";
import enabled from "../utils/enabled";
import { keyboards } from "../utils/keyboards";
const scene = new Scenes.BaseScene("start");

export let keyboard = [["Obunalar", "To'lovlar tarixi"], ["Sozlamalar"]];
export let admin_keyboard = [["Admin"]];

scene.enter(async (ctx: any) => {
  const user_id = ctx.from?.id;

  const user_name = ctx.from?.first_name || ctx.from?.username;
  const channelBundleId = ctx.startPayload; // Telegram bot start parametri

  const enable = await enabled(String(user_id), String(user_name));

  if (enable === "one") {
    if (channelBundleId) {
      const channelBundle = await prisma.channelBundle.findFirst({
        where: {
          id: String(channelBundleId),
        },
        include: {
          channels: true,
        },
      });
      if (channelBundle) {
        const bundleInfo = `
      📦 To'plam: "${channelBundle.name}"
      
      📝 Tavsif: ${channelBundle.description || "Tavsif mavjud emas"}
      
      💰 Narx: ${channelBundle.price} so'm
      
      📊 Kanallar soni: ${channelBundle.channels.length}
      
      Kanallar ro'yxati:
      ${channelBundle.channels
        .map((channel, index) => `${index + 1}. ${channel.name}`)
        .join("\n")}
      `;
        const subscribeButton = {
          text: "Obuna bo'lish",
          callback_data: `subscribe_${channelBundle.id}`,
        };

        // Xabar yuborish
        await ctx.telegram.sendMessage(
          user_id,
          `Assalomu alaykum! 
    
    Siz quyidagi kanallar to'plami haqida so'rov yubordingiz:
    
    ${bundleInfo}
    
    Ushbu to'plamga obuna bo'lishni xohlaysizmi?`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [[subscribeButton]],
            },
          }
        );

        // To'plam ID'sini keyingi qadam uchun saqlash
        ctx.scene.state.currentBundleId = channelBundle.id;
        return;
        // return await ctx.scene.enter("subscribe");
      }
    }
    ctx.telegram.sendMessage(
      user_id,
      `Assalomu alaykum!Maxsus kanallarga kirish uchun obuna sotib olishinigz kerak`,
      keyboards(keyboard)
    );

    console.log("start scene");
    return await ctx.scene.enter("control");
  } else if (enable === "two") {
    const text = "Assalomu alaykum Admin xush kelibsiz";

    ctx.telegram.sendMessage(user_id, text, keyboards(admin_keyboard));
    // return await ctx.scene.enter("admin");
  } else if (enable === "three") {
    ctx.telegram.sendMessage(
      user_id,
      "Assalomu alaykum.Kechirasiz siz admin tomonidan bloklangansiz"
    );
    return;
  }
});

scene.action(/^subscribe_/, async (ctx: any) => {
  console.log("subscribe_", ctx.update.callback_query.data);
  const bundleId = ctx.update.callback_query.data.split("_")[1];

  console.log("bundleId", bundleId);
  ctx.session.currentBundleId = bundleId;

  return await ctx.scene.enter("subscribe");
});

export default scene;
