const { Scenes } = require("telegraf");
import addMerchant from "./addMerchant";
import admin from "./admin";
import control from "./control";
import createBundle from "./createBundle";
import editBundle from "./editBundle";
import merchant from "./merchant";
import withdraw from "./paymentRequest";
import start from "./start";
import subscribe from "./subscribe";
const stage = new Scenes.Stage([
  start,
  subscribe,
  control,
  merchant,
  editBundle,
  createBundle,
  admin,
  addMerchant,
  withdraw,
]);

export default stage;
