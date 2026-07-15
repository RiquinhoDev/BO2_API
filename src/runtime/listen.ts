import type { AppListener } from '../bootstrap'

export const listen: AppListener = async (app, port) =>
  new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`🚀 Servidor iniciado em http://localhost:${port}/api`)
      resolve(server)
    })
    server.once('error', reject)
  })
