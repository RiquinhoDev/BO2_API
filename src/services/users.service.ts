// src/services/user.service.ts
import user from "../models/user"


export const findUsersWithClass = async (page: number, limit: number) => {
  const skip = (page - 1) * limit
  const users = await user.aggregate([
    {
      $lookup: {
        from: "classes",
        localField: "classId",
        foreignField: "classId",
        as: "classInfo"
      }
    },
    { $unwind: { path: "$classInfo", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        discordIds: 1,
        email: 1,
        classId: 1,
        className: "$classInfo.name",
        status: 1,
        purchaseDate: 1,
        role: 1,
        engagement: 1,
        name: 1
      }
    }
  ]).skip(skip).limit(limit)

  const count = await user.countDocuments()
  return { users, count }
}

export const updateUserDiscordIds = async (email: string, newIds: string[]) => {
  return user.findOneAndUpdate(
    { email: { $regex: new RegExp(`^${email}$`, "i") } },
    { discordIds: newIds, email },
    { new: true }
  )
}

export const findUserByEmail = async (email: string) => {
  return user.findOne({ email: { $regex: new RegExp(`^${email}$`, "i") } })
}
