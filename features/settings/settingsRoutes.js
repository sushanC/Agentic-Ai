import express from "express";
import {
  getSettingsController,
  updateSettingsController
} from "./settingsController.js";

const router = express.Router();

router.get("/", getSettingsController);
router.post("/", updateSettingsController);

export default router;
