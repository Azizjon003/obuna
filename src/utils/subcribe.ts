import prisma from "../../prisma/prisma";

export const isInvited = async (ctx: any, next: any) => {
  if (ctx.from) {
    const telegramId = ctx.from.id.toString();

    // Foydalanuvchini ma'lumotlar bazasidan tekshirish yoki yaratish

    // Agar 'start' buyrug'i bo'lsa va parametr mavjud bo'lsa
    if (
      ctx.message &&
      ctx.message.text &&
      ctx.message.text.startsWith("/start")
    ) {
      const args = ctx.message.text.split(" ");
      if (args.length > 1) {
        const inviterId = args[1];

        const invitedUser = await prisma.user.findFirst({
          where: {
            telegram_id: telegramId,
          },
        });

        if (!invitedUser) {
          await prisma.invitedUser.create({
            data: {
              user_id: telegramId,
              friendId: inviterId,
            },
          });
          // Foydalanuvchini yangilash

          // Taklif qilgan foydalanuvchiga xabar yuborish
          ctx.telegram.sendMessage(
            inviterId,
            `Sizning do'stingiz ${ctx.from.first_name} botga qo'shildi!`
          );
        }
      }
    }
  }

  // Keyingi middleware yoki handler'ga o'tish
  await next();
};
