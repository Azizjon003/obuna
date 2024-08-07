import xss from "xss";
import prisma from "../../prisma/prisma";

enum enabledEnum {
  one = "one",
  two = "two",
  three = "three",
  four = "four",
}
const enabled = async (id: string, name: string): Promise<enabledEnum> => {
  name = xss(name);
  const user = await prisma.user.findFirst({
    where: {
      telegram_id: id,
    },
    include: {
      wallet: true,
    },
  });

  if (user) {
    console.log(user?.wallet.length == 0);

    if (!user.isActive) {
      return enabledEnum.three;
    }
    if (user.role === "USER") {
      return enabledEnum.one;
    } else if (user.role === "ADMIN") {
      return enabledEnum.two;
    } else if (user.role === "MERCHANT") {
      return enabledEnum.four;
    }

    return enabledEnum.one;
  } else {
    let user = await prisma.user.create({
      data: {
        telegram_id: id,
        name: name,
        username: name,
      },
    });

    return enabledEnum.one;
  }
};

export default enabled;
