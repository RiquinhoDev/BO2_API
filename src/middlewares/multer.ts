import multer, { FileFilterCallback } from "multer"
import path from "path"
import { randomUUID } from "crypto"
import { Request } from "express"

// Configuração do storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.resolve(__dirname, "..", "..", "uploads"))
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    const name = `${randomUUID()}${ext}`
    cb(null, name)
  }
})

// Filtro de ficheiros permitidos
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  const allowed = [
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ]
  if (allowed.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error("Tipo de ficheiro inválido"))
  }
}

const upload = multer({ storage, fileFilter })

export default upload
