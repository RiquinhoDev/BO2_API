// src/controllers/auth.controller.ts
import { Request, Response } from "express"
import jwt from "jsonwebtoken"
import Admin from "../models/Admin"

const JWT_SECRET = process.env.JWT_SECRET || "riquinho-secret-key-2024"
const JWT_EXPIRES_IN = "7d"

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email e password são obrigatórios"
      })
    }

    // Find admin by email
    const admin = await Admin.findOne({ email })

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Credenciais inválidas"
      })
    }

    // Check if admin is active
    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: "Conta desativada. Contacte o administrador."
      })
    }

    // Check if account is locked
    if (admin.isLocked) {
      // Auto-unlock if lockUntil has passed
      if (admin.lockUntil && admin.lockUntil < new Date()) {
        admin.isLocked = false
        admin.failedAttempts = 0
        admin.lockUntil = undefined
        await admin.save()
      } else {
        return res.status(403).json({
          success: false,
          message: "Conta bloqueada. Contacte o administrador."
        })
      }
    }

    // Verify password
    const isPasswordValid = await admin.comparePassword(password)

    if (!isPasswordValid) {
      // Update failed attempt
      admin.failedAttempts = (admin.failedAttempts || 0) + 1
      admin.lastFailedAttempt = new Date()

      // Lock account after 5 failed attempts
      if (admin.failedAttempts >= 5) {
        admin.isLocked = true
        admin.lockUntil = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
      }

      await admin.save()

      return res.status(401).json({
        success: false,
        message: "Credenciais inválidas"
      })
    }

    // Reset failed attempts on successful login
    admin.failedAttempts = 0
    admin.lastLogin = new Date()
    await admin.save()

    // Generate JWT token
    const token = jwt.sign(
      {
        id: admin._id,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    )

    res.json({
      success: true,
      message: "Login realizado com sucesso",
      data: {
        token,
        user: {
          id: admin._id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          permissions: admin.permissions
        }
      }
    })
  } catch (error) {
    console.error("Error in login:", error)
    res.status(500).json({
      success: false,
      message: "Erro ao fazer login"
    })
  }
}

export const verify = async (req: Request, res: Response) => {
  try {
    const admin = await Admin.findById(req.user.id).select("-password")

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Utilizador não encontrado"
      })
    }

    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: "Conta desativada"
      })
    }

    res.json({
      success: true,
      data: {
        user: {
          id: admin._id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          permissions: admin.permissions
        }
      }
    })
  } catch (error) {
    console.error("Error in verify:", error)
    res.status(500).json({
      success: false,
      message: "Erro ao verificar token"
    })
  }
}

export const logout = async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Logout realizado com sucesso"
  })
}

export const unlockAccount = async (req: Request, res: Response) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email é obrigatório"
      })
    }

    const admin = await Admin.findOne({ email })

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Utilizador não encontrado"
      })
    }

    // Unlock the account
    admin.isLocked = false
    admin.failedAttempts = 0
    admin.lastFailedAttempt = undefined
    admin.lockUntil = undefined
    await admin.save()

    res.json({
      success: true,
      message: `Conta de ${admin.email} desbloqueada com sucesso`,
      data: {
        email: admin.email,
        name: admin.name,
        isLocked: admin.isLocked,
        failedAttempts: admin.failedAttempts
      }
    })
  } catch (error) {
    console.error("Error in unlockAccount:", error)
    res.status(500).json({
      success: false,
      message: "Erro ao desbloquear conta"
    })
  }
}

export const changePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body
    const adminId = req.user.id

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Password atual e nova password são obrigatórias"
      })
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Nova password deve ter pelo menos 8 caracteres"
      })
    }

    const admin = await Admin.findById(adminId)

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Utilizador não encontrado"
      })
    }

    // Verify current password
    const isCurrentPasswordValid = await admin.comparePassword(currentPassword)

    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Password atual está incorreta"
      })
    }

    // Update password (schema pre-hook will hash it)
    admin.password = newPassword
    await admin.save()

    res.json({
      success: true,
      message: "Password alterada com sucesso"
    })
  } catch (error) {
    console.error("Error in changePassword:", error)
    res.status(500).json({
      success: false,
      message: "Erro ao alterar password"
    })
  }
}
