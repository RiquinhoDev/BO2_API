import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '../..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

test('container prepara uploads e logs antes de executar como node', () => {
  const dockerfile = read('Dockerfile')
  const chown = dockerfile.indexOf('chown -R node:node /app /logs')
  const user = dockerfile.indexOf('USER node')

  expect(dockerfile).toContain('mkdir -p /app/uploads /logs')
  expect(chown).toBeGreaterThan(-1)
  expect(user).toBeGreaterThan(chown)
})

test('monitorizacao fixa imagens e exige credenciais Grafana por env', () => {
  const compose = read('docker-compose.monitoring.yml')

  expect(compose).toContain('prom/prometheus:v2.54.1')
  expect(compose).toContain('grafana/grafana:11.2.0')
  expect(compose).toContain('prom/node-exporter:v1.8.2')
  expect(compose).toContain(
    'GF_SECURITY_ADMIN_USER=${GRAFANA_ADMIN_USER:?GRAFANA_ADMIN_USER is required}',
  )
  expect(compose).toContain(
    'GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD is required}',
  )
  expect(compose).not.toContain('GF_SECURITY_ADMIN_USER=admin')
  expect(compose).not.toContain('GF_SECURITY_ADMIN_PASSWORD=admin')
})

test('mensagens de configuracao permanecem UTF-8 valido', () => {
  const config = read('src/config/appConfig.ts')
  const cors = read('src/security/cors.ts')

  expect(config).toContain('CONFIG_INVÁLIDA: ENABLE_DEBUG_ROUTES é proibida em produção')
  expect(cors).toContain('CONFIG_INVÁLIDA: ALLOWED_ORIGINS contém origem inválida')
  expect(config).not.toContain('Ã')
  expect(cors).not.toContain('Ã')
})
