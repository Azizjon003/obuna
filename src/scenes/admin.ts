import { Scenes } from "telegraf";
import prisma from "../../prisma/prisma";

const scene = new Scenes.BaseScene("admin");

scene.hears("/start", async (ctx: any) => {
  return await ctx.scene.enter("start");
});

scene.hears("Statistika", async (ctx) => {
  const userId = ctx.from.id;

  try {
    const user = await prisma.user.findUnique({
      where: { telegram_id: userId.toString() },
    });

    if (!user || user.role !== "ADMIN") {
      return ctx.reply("Sizda bu ma'lumotlarni ko'rish uchun huquq yo'q.");
    }

    // Statistikani olish
    const [
      totalUsers,
      totalMerchants,
      totalChannels,
      totalSubscriptions,
      activeSubscriptions,
      totalRevenue,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "MERCHANT" } }),
      prisma.channel.count(),
      prisma.subscription.count(),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.subscription.aggregate({
        _sum: { price: true },
        where: { status: "ACTIVE" },
      }),
    ]);

    const message = `
📊 Tizim statistikasi:

👥 Foydalanuvchilar soni: ${totalUsers}
🛍️ Merchant foydalanuvchilar: ${totalMerchants}
📡 Kanallar soni: ${totalChannels}

📌 Obunalar:
   📝 Jami: ${totalSubscriptions}
   ✅ Faol: ${activeSubscriptions}

💰 Umumiy daromad: ${totalRevenue._sum.price || 0} so'm

📅 Sana: ${new Date().toLocaleString()}
    `;

    ctx.reply(message, {
      reply_markup: {
        keyboard: [[{ text: "Batafsil ma'lumot" }], [{ text: "Orqaga" }]],
        resize_keyboard: true,
      },
    });
  } catch (error) {
    console.error("Xatolik yuz berdi:", error);
    ctx.reply(
      "Statistikani olishda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring."
    );
  }
});

scene.hears("Batafsil ma'lumot", async (ctx) => {
  const userId = ctx.from.id;

  try {
    const user = await prisma.user.findUnique({
      where: { telegram_id: userId.toString() },
    });

    if (!user || user.role !== "ADMIN") {
      return ctx.reply("Sizda bu ma'lumotlarni ko'rish uchun huquq yo'q.");
    }

    // So'nggi 5 ta obunani olish
    const recentSubscriptions = await prisma.subscription.findMany({
      take: 5,
      orderBy: { created_at: "desc" },
      include: { user: true, channelBundle: true },
    });

    let message = "📋 So'nggi 5 ta obuna:\n\n";

    for (const sub of recentSubscriptions) {
      message += `👤 Foydalanuvchi: ${sub.user.username || sub.user.name}\n`;
      message += `📦 Paket: ${sub.channelBundle.name}\n`;
      message += `💲 Narx: ${sub.price} so'm\n`;
      message += `📅 Sana: ${sub.created_at.toLocaleString()}\n\n`;
    }

    // Top 3 merchant
    const topMerchants = await prisma.user.findMany({
      where: { role: "MERCHANT" },
      take: 3,
      orderBy: {
        // subscription: {
        //   _count: "desc",
        // },
      },
      include: {
        _count: {
          // select: { subscription: true },
        },
      },
    });

    message += "🏆 Top 3 merchant:\n\n";

    for (const merchant of topMerchants) {
      message += `👤 ${merchant.username || merchant.name}\n`;
      message += `📊 Obunalar soni: ${merchant._count}\n\n`;
    }

    ctx.reply(message);
  } catch (error) {
    console.error("Xatolik yuz berdi:", error);
    ctx.reply(
      "Batafsil ma'lumotni olishda xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko'ring."
    );
  }
});
export default scene;
