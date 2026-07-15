import type { AppListener } from '../bootstrap'

export function configureServerTimeouts(server: {
  headersTimeout: number
  keepAliveTimeout: number
}): void {
  server.headersTimeout = 15_000
  server.keepAliveTimeout = 5_000
}

export const listen: AppListener = async (app, port) =>
  new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`🚀 Servidor iniciado em http://localhost:${port}/api`)
      resolve(server)
    })
    configureServerTimeouts(server)
    server.once('error', reject)
  })
