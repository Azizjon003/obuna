import { RoleEnum } from "@prisma/client";
import { Markup, Scenes } from "telegraf";
import prisma from "../../prisma/prisma";

const scene = new Scenes.BaseScene("addMerchant");

scene.hears("/start", async (ctx: any) => {
  ctx.session.merchant = {};
  ctx.session.step = 0;
  return await ctx.scene.enter("start");
});

scene.enter(async (ctx: any) => {
  ctx.session.merchant = {};
  ctx.session.step = 0;
  await ctx.reply("Yangi merchant ismini kiriting:");
});

scene.on("text", async (ctx: any) => {
  const step = ctx.session.step || 0;

  switch (step) {
    case 0:
      ctx.session.merchant.name = ctx.message.text;
      await ctx.reply("Merchant Telegram ID'sini kiriting:");
      ctx.session.step = 1;
      break;

    case 1:
      const telegramId = ctx.message.text;
      // Telegram ID validatsiyasi
      if (!/^\d+$/.test(telegramId)) {
        await ctx.reply(
          "Noto'g'ri Telegram ID kiritildi. Iltimos, faqat raqamlardan iborat ID kiriting:"
        );
        return;
      }
      ctx.session.merchant.telegram_id = telegramId;
      await ctx.reply("Merchant foydalanuvchini ism familyasini kiriting:");
      ctx.session.step = 2;
      break;

    case 2:
      ctx.session.merchant.name = ctx.message.text;
      ctx.session.step = 3;
      break;
    case 3:
      ctx.session.merchant.additionalInfo = ctx.message.text;
      await confirmMerchant(ctx);
      break;

    default:
      await ctx.reply("Noma'lum buyruq. Iltimos, ko'rsatmalarga amal qiling.");
  }
});

async function confirmMerchant(ctx: any) {
  const { name, telegram_id, additionalInfo } = ctx.session.merchant;
  const confirmationMessage = `
Iltimos, merchant ma'lumotlarini tasdiqlang:

Ism: ${name}
Telegram ID: ${telegram_id}
Telefon raqami: ${additionalInfo || "Kiritilmagan"}

Ma'lumotlar to'g'rimi?
  `;

  await ctx.reply(
    confirmationMessage,
    Markup.inlineKeyboard([
      [Markup.button.callback("Ha", "confirm_merchant")],
      [Markup.button.callback("Yo'q", "cancel_merchant")],
    ])
  );
}

scene.action("confirm_merchant", async (ctx: any) => {
  await ctx.answerCbQuery();
  await createMerchant(ctx, ctx.session.merchant);
});

scene.action("cancel_merchant", async (ctx: any) => {
  await ctx.answerCbQuery();
  await ctx.reply("Merchant qo'shish bekor qilindi.");
  ctx.session.merchant = {};
  ctx.session.step = 0;
  return ctx.scene.enter("admin");
});

async function createMerchant(ctx: any, merchantData: any) {
  try {
    const newMerchant = await prisma.user.create({
      data: {
        name: merchantData.name,
        telegram_id: merchantData.telegram_id,
        role: RoleEnum.MERCHANT,
        phone: merchantData.additionalInfo,
        merchantWallet: {
          create: {
            balance: 0,
          },
        },
      },
    });

    await ctx.reply(
      `Merchant "${newMerchant.name}" muvaffaqiyatli qo'shildi!`,
      Markup.removeKeyboard()
    );
  } catch (error: any) {
    console.error("Error creating merchant:", error);
    if (error?.code === "P2002") {
      await ctx.reply(
        "Bu Telegram ID bilan foydalanuvchi allaqachon mavjud. Iltimos, boshqa ID kiriting."
      );
      ctx.session.step = 1;
      await ctx.reply("Merchant Telegram ID'sini kiriting:");
      return;
    }
    ctx.session.merchant = {};
    ctx.session.step = 0;
    await ctx.reply(
      "Merchant qo'shishda xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
    );
  }

  return ctx.scene.enter("admin");
}

export default scene;
