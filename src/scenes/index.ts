const { Scenes } = require("telegraf");
import control from "./control";
import start from "./start";
import subscribe from "./subscribe";

const stage = new Scenes.Stage([start, subscribe, control]);

export default stage;
