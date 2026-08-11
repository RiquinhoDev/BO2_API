// src/routes/auth.routes.ts
import { Router } from "express"
import { asyncRoute } from '../security/asyncRoute'
import { login, verify, logout, unlockAccount, changePassword } from "../controllers/auth.controller"
import { authenticate, authorize } from "../middleware/auth.middleware"

const router = Router()

// Public routes
router.post("/login", asyncRoute(login))

// Protected routes
router.get("/verify", authenticate, asyncRoute(verify))
router.post("/logout", authenticate, logout)

// Admin routes
router.post("/unlock", authenticate, authorize("SUPER_ADMIN"), asyncRoute(unlockAccount))
router.post("/change-password", authenticate, asyncRoute(changePassword))

export default router
