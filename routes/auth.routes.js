import express from "express";
import { register, login, getMe, changePassword, forgotPassword, resetPassword } from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", protect, getMe);
router.put("/password", protect, changePassword);

export default router;
