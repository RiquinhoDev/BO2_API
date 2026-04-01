// src/routes/auth.routes.ts
import { Router } from "express"
import { login, verify, logout, unlockAccount, changePassword } from "../controllers/auth.controller"
import { authenticate, authorize } from "../middleware/auth.middleware"

const router = Router()

// Public routes
router.post("/login", login)

// Protected routes
router.get("/verify", authenticate, verify)
router.post("/logout", authenticate, logout)

// Admin routes
router.post("/unlock", authenticate, authorize("SUPER_ADMIN"), unlockAccount)
router.post("/change-password", authenticate, changePassword)

export default router
