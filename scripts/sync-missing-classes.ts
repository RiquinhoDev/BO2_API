// ════════════════════════════════════════════════════════════
// 📁 scripts/sync-missing-classes.ts
// SINCRONIZAÇÃO DE TURMAS EM FALTA
// ════════════════════════════════════════════════════════════
//
// Este script:
// 1. Busca TODAS as turmas da API Hotmart (incluindo class_name)
// 2. Busca TODOS os grupos do CursEduca
// 3. Cria/atualiza turmas em falta na BD
// 4. Atualiza nomes de turmas existentes
// 5. Gera log detalhado
//
// Execução: npx ts-node scripts/sync-missing-classes.ts
//
// Flags opcionais:
//   --dry-run    Apenas mostrar o que seria feito, sem alterar BD
//   --force      Forçar atualização de todas as turmas (incluindo nomes)
//
// ════════════════════════════════════════════════════════════

import dotenv from 'dotenv'
dotenv.config()

import axios from 'axios'
import mongoose from 'mongoose'
import '../src/models'
import { Class } from '../src/models/Class'
import fs from 'fs'
import path from 'path'

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════

const HOTMART_CLIENT_ID = "4a933488-59ea-4aae-a266-b68c35f7d5f3"
const HOTMART_CLIENT_SECRET = "7447f4ef-cb9d-43c2-8009-46aee590760e"
const HOTMART_SUBDOMAIN = process.env.subdomain || 'ograndeinvestimento-bomrmk'

const CURSEDUCA_API_URL = "https://prof.curseduca.pro"
const CURSEDUCA_API_KEY = "ce9ef2a4afef727919473d38acafe10109c4faa8"
const CURSEDUCA_ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7ImlkIjozLCJ1dWlkIjoiYmZiNmExNjQtNmE5MC00MGFhLTg3OWYtYzEwNGIyZTZiNWVmIiwibmFtZSI6IlBlZHJvIE1pZ3VlbCBQZXJlaXJhIFNpbcO1ZXMgU2FudG9zIiwiZW1haWwiOiJjb250YWN0b3NAc2VycmlxdWluaG8uY29tIiwiaW1hZ2UiOiIvYXBwbGljYXRpb24vaW1hZ2VzL3VwbG9hZHMvMy8iLCJyb2xlcyI6WyJBRE1JTiJdLCJ0ZW5hbnRzIjpbXX0sImlhdCI6MTc1ODE5MDgwMH0.vI_Y9l7oZVIV4OT9XG7LWDIma-E7fcRkVYM7FOCxTds"

const MONGODB_URI = "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true"

// Parse args
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const FORCE_UPDATE = args.includes('--force')

// ═══════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════

interface HotmartClassData {
  classId: string
  className: string | null
  studentCount: number
}

interface CurseducaGroupData {
  id: number
  uuid: string
  name: string
  memberCount: number
}

interface SyncResult {
  timestamp: string
  dryRun: boolean
  forceUpdate: boolean
  hotmart: {
    totalFound: number
    created: number
    updated: number
    unchanged: number
    errors: string[]
    details: {
      classId: string
      action: 'created' | 'updated' | 'unchanged' | 'error'
      oldName?: string
      newName?: string
      error?: string
    }[]
  }
  curseduca: {
    totalFound: number
    created: number
    updated: number
    unchanged: number
    errors: string[]
    details: {
      groupId: string
      action: 'created' | 'updated' | 'unchanged' | 'error'
      name: string
      error?: string
    }[]
  }
}

// ═══════════════════════════════════════════════════════════
// HOTMART: AUTENTICAÇÃO
// ═══════════════════════════════════════════════════════════

async function getHotmartAccessToken(): Promise<string> {
  if (!HOTMART_CLIENT_ID || !HOTMART_CLIENT_SECRET) {
    throw new Error('HOTMART_CLIENT_ID e HOTMART_CLIENT_SECRET são obrigatórios no .env')
  }

  const basicAuth = Buffer.from(`${HOTMART_CLIENT_ID}:${HOTMART_CLIENT_SECRET}`).toString('base64')

  const response = await axios.post(
    'https://api-sec-vlc.hotmart.com/security/oauth/token',
    new URLSearchParams({ grant_type: 'client_credentials' }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`
      }
    }
  )

  return response.data.access_token
}

// ═══════════════════════════════════════════════════════════
// HOTMART: BUSCAR TODAS AS TURMAS COM NOMES
// ═══════════════════════════════════════════════════════════

async function fetchAllHotmartClasses(accessToken: string): Promise<Map<string, HotmartClassData>> {
  console.log('📡 [Hotmart] Buscando todas as turmas...')

  const classMap = new Map<string, HotmartClassData>()
  let nextPageToken: string | null = null
  let pageCount = 0
  let totalUsers = 0

  do {
    pageCount++
    let requestUrl = `https://developers.hotmart.com/club/api/v1/users?subdomain=${HOTMART_SUBDOMAIN}`
    if (nextPageToken) {
      requestUrl += `&page_token=${encodeURIComponent(nextPageToken)}`
    }

    const response = await axios.get(requestUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    })

    const users = response.data.users || response.data.items || response.data.data || []
    const pageInfo = response.data.page_info || response.data.pageInfo || {}

    totalUsers += users.length

    for (const user of users) {
      const classId = user.class_id?.trim()
      const className = user.class_name?.trim() || null

      if (classId) {
        if (!classMap.has(classId)) {
          classMap.set(classId, {
            classId,
            className,
            studentCount: 1
          })
        } else {
          const existing = classMap.get(classId)!
          existing.studentCount++

          // Preferir nome não-nulo
          if (className && !existing.className) {
            existing.className = className
          }
        }
      }
    }

    nextPageToken = pageInfo.next_page_token || null

    if (pageCount % 10 === 0) {
      console.log(`   📄 Página ${pageCount}: ${classMap.size} turmas únicas`)
    }

    if (nextPageToken) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }

  } while (nextPageToken)

  console.log(`✅ [Hotmart] ${classMap.size} turmas encontradas (${totalUsers} users)`)

  return classMap
}

// ═══════════════════════════════════════════════════════════
// CURSEDUCA: BUSCAR TODOS OS GRUPOS
// ═══════════════════════════════════════════════════════════

async function fetchAllCurseducaGroups(): Promise<CurseducaGroupData[]> {
  console.log('📡 [CursEduca] Buscando todos os grupos...')

  const headers = {
    'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
    'api_key': CURSEDUCA_API_KEY,
    'Content-Type': 'application/json'
  }

  try {
    const response = await axios.get(`${CURSEDUCA_API_URL}/groups`, {
      headers,
      timeout: 30000
    })

    const groups = Array.isArray(response.data)
      ? response.data
      : response.data?.data || response.data?.groups || []

    const groupsWithCount: CurseducaGroupData[] = []

    for (const group of groups) {
      try {
        const membersResponse = await axios.get(
          `${CURSEDUCA_API_URL}/reports/group/members`,
          {
            params: { groupId: group.id, limit: 1, offset: 0 },
            headers,
            timeout: 10000
          }
        )

        const totalMembers = membersResponse.data?.total ||
                            membersResponse.data?.data?.length ||
                            membersResponse.data?.length || 0

        groupsWithCount.push({
          id: group.id,
          uuid: group.uuid,
          name: group.name,
          memberCount: totalMembers
        })

        await new Promise(resolve => setTimeout(resolve, 200))

      } catch (error) {
        groupsWithCount.push({
          id: group.id,
          uuid: group.uuid,
          name: group.name,
          memberCount: 0
        })
      }
    }

    console.log(`✅ [CursEduca] ${groupsWithCount.length} grupos encontrados`)

    return groupsWithCount

  } catch (error: any) {
    console.error('❌ [CursEduca] Erro:', error.message)
    return []
  }
}

// ═══════════════════════════════════════════════════════════
// SYNC: HOTMART
// ═══════════════════════════════════════════════════════════

async function syncHotmartClasses(
  hotmartClasses: Map<string, HotmartClassData>,
  result: SyncResult
): Promise<void> {
  console.log('\n' + '─'.repeat(40))
  console.log('🔄 SINCRONIZANDO TURMAS HOTMART')
  console.log('─'.repeat(40))

  for (const [classId, classData] of hotmartClasses) {
    try {
      const existing = await Class.findOne({ classId })

      if (!existing) {
        // Criar nova turma
        const displayName = classData.className || `Turma ${classId}`

        if (!DRY_RUN) {
          await Class.create({
            classId,
            name: displayName,
            description: `Turma sincronizada da Hotmart em ${new Date().toLocaleDateString('pt-PT')}`,
            source: 'hotmart_sync',
            isActive: true,
            estado: 'ativo',
            studentCount: classData.studentCount,
            lastSyncAt: new Date()
          })
        }

        result.hotmart.created++
        result.hotmart.details.push({
          classId,
          action: 'created',
          newName: displayName
        })

        console.log(`   ✅ CRIADA: ${classId} - "${displayName}" (${classData.studentCount} alunos)`)

      } else {
        // Verificar se precisa atualizar
        let needsUpdate = false
        const updates: any = {
          lastSyncAt: new Date(),
          studentCount: classData.studentCount
        }

        // Atualizar nome se:
        // 1. Nome atual é genérico ("Turma X") e temos nome real
        // 2. FORCE_UPDATE está ativo e temos nome diferente
        const isGenericName = existing.name.startsWith('Turma ') && existing.name.match(/^Turma [a-zA-Z0-9]+$/)
        const hasNewName = classData.className && classData.className !== existing.name

        if ((isGenericName && classData.className) || (FORCE_UPDATE && hasNewName)) {
          updates.name = classData.className
          needsUpdate = true
        }

        if (needsUpdate || existing.studentCount !== classData.studentCount) {
          if (!DRY_RUN) {
            await Class.findByIdAndUpdate(existing._id, updates)
          }

          result.hotmart.updated++
          result.hotmart.details.push({
            classId,
            action: 'updated',
            oldName: existing.name,
            newName: updates.name || existing.name
          })

          if (updates.name) {
            console.log(`   📝 ATUALIZADA: ${classId} - "${existing.name}" → "${updates.name}"`)
          }

        } else {
          result.hotmart.unchanged++
          result.hotmart.details.push({
            classId,
            action: 'unchanged'
          })
        }
      }

    } catch (error: any) {
      result.hotmart.errors.push(`${classId}: ${error.message}`)
      result.hotmart.details.push({
        classId,
        action: 'error',
        error: error.message
      })
      console.log(`   ❌ ERRO: ${classId} - ${error.message}`)
    }
  }

  console.log(`\n   📊 Resumo Hotmart:`)
  console.log(`      Criadas: ${result.hotmart.created}`)
  console.log(`      Atualizadas: ${result.hotmart.updated}`)
  console.log(`      Sem alteração: ${result.hotmart.unchanged}`)
  console.log(`      Erros: ${result.hotmart.errors.length}`)
}

// ═══════════════════════════════════════════════════════════
// SYNC: CURSEDUCA
// ═══════════════════════════════════════════════════════════

async function syncCurseducaGroups(
  groups: CurseducaGroupData[],
  result: SyncResult
): Promise<void> {
  console.log('\n' + '─'.repeat(40))
  console.log('🔄 SINCRONIZANDO GRUPOS CURSEDUCA')
  console.log('─'.repeat(40))

  for (const group of groups) {
    try {
      // Usar UUID como classId para CursEduca
      const existing = await Class.findOne({
        $or: [
          { classId: group.uuid },
          { curseducaUuid: group.uuid },
          { curseducaId: String(group.id) }
        ]
      })

      if (!existing) {
        // Criar nova turma
        if (!DRY_RUN) {
          await Class.create({
            classId: group.uuid,
            curseducaId: String(group.id),
            curseducaUuid: group.uuid,
            name: group.name,
            description: `Grupo CursEduca sincronizado em ${new Date().toLocaleDateString('pt-PT')}`,
            source: 'curseduca_sync',
            isActive: true,
            estado: 'ativo',
            studentCount: group.memberCount,
            lastSyncAt: new Date()
          })
        }

        result.curseduca.created++
        result.curseduca.details.push({
          groupId: group.uuid,
          action: 'created',
          name: group.name
        })

        console.log(`   ✅ CRIADO: ${group.name} (ID: ${group.id}, ${group.memberCount} membros)`)

      } else {
        // Atualizar se necessário
        const updates: any = {
          lastSyncAt: new Date(),
          studentCount: group.memberCount,
          curseducaId: String(group.id),
          curseducaUuid: group.uuid
        }

        let needsUpdate = false

        if (existing.name !== group.name && FORCE_UPDATE) {
          updates.name = group.name
          needsUpdate = true
        }

        if (needsUpdate || existing.studentCount !== group.memberCount) {
          if (!DRY_RUN) {
            await Class.findByIdAndUpdate(existing._id, updates)
          }

          result.curseduca.updated++
          result.curseduca.details.push({
            groupId: group.uuid,
            action: 'updated',
            name: group.name
          })

        } else {
          result.curseduca.unchanged++
          result.curseduca.details.push({
            groupId: group.uuid,
            action: 'unchanged',
            name: group.name
          })
        }
      }

    } catch (error: any) {
      result.curseduca.errors.push(`${group.uuid}: ${error.message}`)
      result.curseduca.details.push({
        groupId: group.uuid,
        action: 'error',
        name: group.name,
        error: error.message
      })
      console.log(`   ❌ ERRO: ${group.name} - ${error.message}`)
    }
  }

  console.log(`\n   📊 Resumo CursEduca:`)
  console.log(`      Criados: ${result.curseduca.created}`)
  console.log(`      Atualizados: ${result.curseduca.updated}`)
  console.log(`      Sem alteração: ${result.curseduca.unchanged}`)
  console.log(`      Erros: ${result.curseduca.errors.length}`)
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  console.log('\n' + '═'.repeat(60))
  console.log('🔄 SINCRONIZAÇÃO DE TURMAS EM FALTA')
  console.log('═'.repeat(60))

  if (DRY_RUN) {
    console.log('⚠️  MODO DRY-RUN: Nenhuma alteração será feita na BD')
  }
  if (FORCE_UPDATE) {
    console.log('⚠️  MODO FORCE: Nomes serão atualizados mesmo se já existirem')
  }

  const result: SyncResult = {
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    forceUpdate: FORCE_UPDATE,
    hotmart: {
      totalFound: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      errors: [],
      details: []
    },
    curseduca: {
      totalFound: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      errors: [],
      details: []
    }
  }

  try {
    // Conectar MongoDB
    console.log('\n🔌 Conectando ao MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ MongoDB conectado')

    // 1. Buscar turmas Hotmart
    console.log('\n' + '─'.repeat(40))
    console.log('📊 PASSO 1: BUSCAR TURMAS HOTMART')
    console.log('─'.repeat(40))
    const accessToken = await getHotmartAccessToken()
    const hotmartClasses = await fetchAllHotmartClasses(accessToken)
    result.hotmart.totalFound = hotmartClasses.size

    // 2. Buscar grupos CursEduca
    console.log('\n' + '─'.repeat(40))
    console.log('📊 PASSO 2: BUSCAR GRUPOS CURSEDUCA')
    console.log('─'.repeat(40))
    const curseducaGroups = await fetchAllCurseducaGroups()
    result.curseduca.totalFound = curseducaGroups.length

    // 3. Sincronizar Hotmart
    await syncHotmartClasses(hotmartClasses, result)

    // 4. Sincronizar CursEduca
    await syncCurseducaGroups(curseducaGroups, result)

    // 5. Resumo final
    console.log('\n' + '═'.repeat(60))
    console.log('📋 RESUMO FINAL')
    console.log('═'.repeat(60))

    console.log(`\n📊 HOTMART:`)
    console.log(`   Total encontrado: ${result.hotmart.totalFound}`)
    console.log(`   Criadas: ${result.hotmart.created}`)
    console.log(`   Atualizadas: ${result.hotmart.updated}`)
    console.log(`   Sem alteração: ${result.hotmart.unchanged}`)
    console.log(`   Erros: ${result.hotmart.errors.length}`)

    console.log(`\n📊 CURSEDUCA:`)
    console.log(`   Total encontrado: ${result.curseduca.totalFound}`)
    console.log(`   Criados: ${result.curseduca.created}`)
    console.log(`   Atualizados: ${result.curseduca.updated}`)
    console.log(`   Sem alteração: ${result.curseduca.unchanged}`)
    console.log(`   Erros: ${result.curseduca.errors.length}`)

    // Guardar resultado
    const outputDir = path.join(__dirname, '..', 'sync-results')
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const filename = `classes-sync-${DRY_RUN ? 'dry-run-' : ''}${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    const filepath = path.join(outputDir, filename)
    fs.writeFileSync(filepath, JSON.stringify(result, null, 2))

    console.log(`\n💾 Resultado guardado em: ${filepath}`)

    if (DRY_RUN) {
      console.log('\n⚠️  Este foi um DRY-RUN. Para aplicar as alterações, execute sem --dry-run')
    }

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 MongoDB desconectado')
  }
}

main()
