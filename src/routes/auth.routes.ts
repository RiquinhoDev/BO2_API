// src/routes/auth.routes.ts
import { Router } from "express"
import { login, verify, logout } from "../controllers/auth.controller"
import { authenticate } from "../middleware/auth.middleware"

const router = Router()

// Public routes
router.post("/login", login)

// Protected routes
router.get("/verify", authenticate, verify)
router.post("/logout", authenticate, logout)

export default router
