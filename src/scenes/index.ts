const { Scenes } = require("telegraf");
import balance from "./balance";
import control from "./control";
import start from "./start";

const stage = new Scenes.Stage([start, control, balance]);

export default stage;
