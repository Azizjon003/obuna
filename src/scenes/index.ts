const { Scenes } = require("telegraf");
import admin from "./admin";
import control from "./control";
import createBundle from "./createBundle";
import editBundle from "./editBundle";
import start from "./start";
import subscribe from "./subscribe";
const stage = new Scenes.Stage([
  start,
  subscribe,
  control,

  editBundle,
  createBundle,
  admin,
]);

export default stage;
