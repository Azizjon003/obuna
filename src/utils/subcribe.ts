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
    }
  }

  // Keyingi middleware yoki handler'ga o'tish
  await next();
};
