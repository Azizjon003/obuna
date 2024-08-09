import { PaymentStatusEnum } from "@prisma/client";
import { Markup, Scenes } from "telegraf";
import prisma from "../../prisma/prisma";
import { showWithdrawalRequests } from "./admin";

const scene = new Scenes.BaseScene("withdraw");

scene.hears("/start", async (ctx: any) => {
  return await ctx.scene.enter("start");
});

scene.action(/^withdrawal_page_(\d+)$/, async (ctx: any) => {
  ctx.session.page = parseInt(ctx.match[1]);
  await ctx.answerCbQuery();
  await showWithdrawalRequests(ctx);
});

// So'rov statusini yangilash
scene.action(/^change_status_([a-f0-9-]+)$/, async (ctx) => {
  const requestId = ctx.match[1];
  await ctx.editMessageText(
    "Yangi statusni tanlang:",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("PENDING", `set_status_${requestId}_PENDING`),
        Markup.button.callback(
          "COMPLETED",
          `set_status_${requestId}_COMPLETED`
        ),
        Markup.button.callback("FAILED", `set_status_${requestId}_FAILED`),
      ],
      [Markup.button.callback("🔙 Orqaga", "show_withdrawal_requests")],
    ])
  );
});
// Statusni o'zgartirish
scene.action(
  /^set_status_([a-f0-9-]+)_(PENDING|COMPLETED|FAILED)$/,
  async (ctx: any) => {
    const [, requestId, newStatus] = ctx.match;

    try {
      const updatedRequest = await prisma.withdrawalRequest.update({
        where: { id: requestId },
        data: { status: newStatus as PaymentStatusEnum },
        include: {
          wallet: {
            include: {
              merchantUser: true,
            },
          },
        },
      });

      if (newStatus === PaymentStatusEnum.COMPLETED) {
        await prisma.merchantWallet.update({
          where: { id: updatedRequest.walletId },
          data: {
            balance: {
              decrement: updatedRequest.amount,
            },
          },
        });
      }

      await ctx.answerCbQuery(`So'rov statusi ${newStatus} ga o'zgartirildi.`);
      await ctx.reply(
        `So'rov ${requestId} statusi ${newStatus} ga o'zgartirildi.`
      );

      // So'rovlar ro'yxatini yangilash
      ctx.session.page = 1;
      await showWithdrawalRequests(ctx);
    } catch (error) {
      console.error("Error updating withdrawal request status:", error);
      await ctx.answerCbQuery("Xatolik yuz berdi.");
      await ctx.reply(
        `Xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring.`
      );
    }
  }
);

export default scene;
