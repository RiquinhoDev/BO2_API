// src/models/Admin.ts
import mongoose, { Schema, model, Document } from "mongoose"
import bcrypt from "bcryptjs"

export interface IAdmin extends Document {
  email: string
  password: string
  name: string
  role: "SUPER_ADMIN" | "ADMIN" | "MODERATOR"
  permissions: string[]
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
  lastLogin?: Date
  failedAttempts?: number
  isLocked?: boolean
  lastFailedAttempt?: Date
  comparePassword(candidate: string): Promise<boolean>
}

const adminSchema = new Schema<IAdmin>({
  email: { type: String, required: true, unique: true, match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  password: { type: String, required: true, minlength: 8 },
  name: { type: String, required: true },
  role: { type: String, enum: ["SUPER_ADMIN", "ADMIN", "MODERATOR"], default: "ADMIN" },
  permissions: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastLogin: { type: Date },
  failedAttempts: { type: Number, default: 0 },
  isLocked: { type: Boolean, default: false },
  lastFailedAttempt: { type: Date }
})

// Hooks
adminSchema.pre("save", function (next) {
  this.updatedAt = new Date()
  next()
})

adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next()
  const salt = await bcrypt.genSalt(10)
  this.password = await bcrypt.hash(this.password, salt)
  next()
})

adminSchema.methods.comparePassword = async function (candidate: string) {
  return bcrypt.compare(candidate, this.password)
}

export default mongoose.models.Admin || model<IAdmin>("Admin", adminSchema)
