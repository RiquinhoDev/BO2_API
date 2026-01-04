/* eslint-disable @typescript-eslint/no-explicit-any */
// ════════════════════════════════════════════════════════════
// 📁 scripts/compare-sync-methods-v2.ts
// Script de Comparação com Dynamic Imports + Report para Ficheiro
// ════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// 🔧 CONFIGURAÇÃO - COLA AS TUAS CREDENCIAIS AQUI
// ═══════════════════════════════════════════════════════════

const SCRIPT_CONFIG = {
  // MongoDB
  MONGODB_URI: "mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true",
  
  // Hotmart
  HOTMART_CLIENT_ID: '4a933488-59ea-4aae-a266-b68c35f7d5f3',
  HOTMART_CLIENT_SECRET: '7447f4ef-cb9d-43c2-8009-46aee590760e',
  HOTMART_SUBDOMAIN: 'ograndeinvestimento-bomrmk',
  
  // CursEduca
  CURSEDUCA_API_URL: 'https://prof.curseduca.pro',
  CURSEDUCA_AccessToken: '***REMOVED-JWT***',
  CURSEDUCA_API_KEY: '***REMOVED-CURSEDUCA-KEY***'
}

// ═══════════════════════════════════════════════════════════
// ⚡ APLICAR CREDENCIAIS IMEDIATAMENTE
// ═══════════════════════════════════════════════════════════

console.log("\n🔧 [Config] Aplicando credenciais ao process.env...")

Object.entries(SCRIPT_CONFIG).forEach(([key, value]) => {
  if (value && !value.startsWith("COLA_AQUI")) {
    process.env[key] = value
    console.log(`   ✅ ${key}: SET`)
  } else {
    console.log(`   ❌ ${key}: NOT SET (ainda tem COLA_AQUI)`)
  }
})

console.log("")

// ═══════════════════════════════════════════════════════════
// 📦 IMPORTS BÁSICOS (sem adapters!)
// ═══════════════════════════════════════════════════════════

import mongoose from "mongoose"
import path from "node:path"
import { promises as fs } from "node:fs"
import { User, UserProduct, Product } from "../src/models"

// ═══════════════════════════════════════════════════════════
// REPORT HELPERS
// ═══════════════════════════════════════════════════════════

type DiffItem = { key: string; a: any; b: any }

type ComparisonReport = {
  meta: {
    generatedAt: string
    platform: string
    email: string
    jobName: string
  }
  legacy: {
    user: any
    userProduct: any
  }
  universal: {
    user: any
    userProduct: any
  }
  comparison: {
    userEqual: boolean
    userProductEqual: boolean
    userDiff: DiffItem[]
    userProductDiff: DiffItem[]
  }
}

function isPlainObject(v: any) {
  return v && typeof v === "object" && !Array.isArray(v)
}

function diffObjects(a: any, b: any, prefix = ""): DiffItem[] {
  if (a === b) return []

  const aIsObj = isPlainObject(a)
  const bIsObj = isPlainObject(b)

  // tipos diferentes ou primitivos/arrays -> diferença direta
  if (!aIsObj || !bIsObj) {
    return [{ key: prefix || "(root)", a, b }]
  }

  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)])
  const diffs: DiffItem[] = []

  for (const k of keys) {
    const nextPrefix = prefix ? `${prefix}.${k}` : k
    const av = a[k]
    const bv = b[k]

    if (isPlainObject(av) && isPlainObject(bv)) {
      diffs.push(...diffObjects(av, bv, nextPrefix))
    } else if (Array.isArray(av) || Array.isArray(bv)) {
      const sa = JSON.stringify(av ?? null)
      const sb = JSON.stringify(bv ?? null)
      if (sa !== sb) diffs.push({ key: nextPrefix, a: av, b: bv })
    } else {
      if (av !== bv) diffs.push({ key: nextPrefix, a: av, b: bv })
    }
  }

  return diffs
}

function buildMarkdownReport(report: ComparisonReport) {
  const { meta, comparison } = report

  const diffToMd = (title: string, diffs: DiffItem[]) => {
    if (!diffs.length) return `### ${title}\n✅ Sem diferenças\n`
    const lines = diffs.map(
      (d) =>
        `- **${d.key}**: \`${JSON.stringify(d.a)}\` → \`${JSON.stringify(d.b)}\``
    )
    return `### ${title}\n${lines.join("\n")}\n`
  }

  return [
    `# Sync Compare Report`,
    ``,
    `**GeneratedAt:** ${meta.generatedAt}`,
    `**Platform:** ${meta.platform}`,
    `**Email:** ${meta.email}`,
    `**Job:** ${meta.jobName}`,
    ``,
    `## Verdict`,
    `- User Equal: ${comparison.userEqual ? "✅" : "❌"}`,
    `- UserProduct Equal: ${comparison.userProductEqual ? "✅" : "❌"}`,
    ``,
    diffToMd("User Diff", comparison.userDiff),
    ``,
    diffToMd("UserProduct Diff", comparison.userProductDiff),
    ``,
    `## Snapshots (sanitized)`,
    `<details><summary>Legacy User</summary>\n\n\`\`\`json\n${JSON.stringify(
      report.legacy.user,
      null,
      2
    )}\n\`\`\`\n\n</details>`,
    `<details><summary>Universal User</summary>\n\n\`\`\`json\n${JSON.stringify(
      report.universal.user,
      null,
      2
    )}\n\`\`\`\n\n</details>`,
    `<details><summary>Legacy UserProduct</summary>\n\n\`\`\`json\n${JSON.stringify(
      report.legacy.userProduct,
      null,
      2
    )}\n\`\`\`\n\n</details>`,
    `<details><summary>Universal UserProduct</summary>\n\n\`\`\`json\n${JSON.stringify(
      report.universal.userProduct,
      null,
      2
    )}\n\`\`\`\n\n</details>`,
    ``,
  ].join("\n")
}

async function writeReportToFile(report: ComparisonReport) {
  const reportsDir = path.resolve(process.cwd(), "reports")
  await fs.mkdir(reportsDir, { recursive: true })

  const safeEmail = report.meta.email.replace(/[^a-zA-Z0-9._-]/g, "_")
  const stamp = report.meta.generatedAt.replace(/[:.]/g, "-")
  const baseName = `sync-compare_${report.meta.platform}_${safeEmail}_${stamp}`

  const jsonPath = path.join(reportsDir, `${baseName}.json`)
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf-8")

  const mdPath = path.join(reportsDir, `${baseName}.md`)
  await fs.writeFile(mdPath, buildMarkdownReport(report), "utf-8")

  console.log(`\n📝 Report guardado:`)
  console.log(`   📄 JSON: ${jsonPath}`)
  console.log(`   🗒️  MD:   ${mdPath}\n`)
}

// ═══════════════════════════════════════════════════════════
// MAIN - Com Dynamic Imports
// ═══════════════════════════════════════════════════════════

async function main() {
  console.log("🚀 Iniciando comparação de sync methods...\n")

  const args = process.argv.slice(2)
  const platform =
    args.find((a) => a.startsWith("--platform="))?.split("=")[1] || "hotmart"
  const specificEmail = args.find((a) => a.startsWith("--email="))?.split("=")[1]

  try {
    // Conectar MongoDB
    const mongoUri = process.env.MONGODB_URI || SCRIPT_CONFIG.MONGODB_URI
    await mongoose.connect(mongoUri)
    console.log("✅ MongoDB conectado\n")

    // Validar email
    if (!specificEmail) {
      console.log("❌ Erro: Especifica um email com --email=user@example.com")
      console.log("   Esta versão do script só suporta email específico\n")
      return
    }

    console.log(`🎯 Modo: Email Específico`)
    console.log(`📧 Email: ${specificEmail}`)
    console.log(`🔹 Plataforma: ${platform.toUpperCase()}\n`)

    // Validar user na BD
    const userExists = await User.findOne({ email: specificEmail })

    if (!userExists) {
      console.log("⚠️ ATENÇÃO: User não existe na BD ainda")
      console.log("   O script vai tentar sincronizá-lo via Adapter\n")
    } else {
      console.log(`✅ User encontrado na BD`)
      if (userExists.hotmart?.hotmartUserId) {
        console.log(`   🔹 Tem dados Hotmart`)
      }
      if (userExists.curseduca?.curseducaUserId) {
        console.log(`   🔹 Tem dados CursEduca`)
      }
      console.log("")
    }

    // ═══════════════════════════════════════════════════════════
    // DYNAMIC IMPORTS (DEPOIS de aplicar credenciais!)
    // ═══════════════════════════════════════════════════════════

    console.log("📦 Carregando adapters e services (dynamic import)...\n")

    const [
      hotmartSync,
      curseducaSync,
      universalSyncService,
      hotmartAdapter,
      curseducaAdapter,
    ] = await Promise.all([
      import(
        "../src/services/syncUtilziadoresServices/hotmartServices/hotmartSync.service"
      ),
      import(
        "../src/services/syncUtilziadoresServices/curseducaServices/curseducaSync.service"
      ),
      import("../src/services/syncUtilziadoresServices/universalSyncService"),
      import(
        "../src/services/syncUtilziadoresServices/hotmartServices/hotmart.adapter"
      ),
      import(
        "../src/services/syncUtilziadoresServices/curseducaServices/curseduca.adapter"
      ),
    ])

    console.log("✅ Adapters carregados com credenciais aplicadas!\n")

    // ═══════════════════════════════════════════════════════════
    // EXECUTAR TESTE
    // ═══════════════════════════════════════════════════════════

    if (platform === "hotmart") {
      await testHotmart(
        specificEmail,
        hotmartSync.default,
        hotmartAdapter.default,
        universalSyncService
      )
    } else {
      await testCursEduca(
        specificEmail,
        curseducaSync.default,
        curseducaAdapter.default,
        universalSyncService
      )
    }
  } catch (error: any) {
    console.error("💥 Erro fatal:", error)
    throw error
  } finally {
    await mongoose.disconnect()
    console.log("✅ MongoDB desconectado")
  }
}

// ═══════════════════════════════════════════════════════════
// TESTE HOTMART
// ═══════════════════════════════════════════════════════════

async function testHotmart(
  email: string,
  hotmartSyncService: any,
  hotmartAdapterService: any,
  universalSyncService: any
) {
  console.log(`🔍 Testando: ${email}\n`)

  // Limpar (FIX: apagar UserProduct com IDs reais antes de remover users)
  const usersToDelete = await User.find({ email }).select("_id").lean()
  const userIds = usersToDelete.map((u: any) => u._id)

  await User.deleteMany({ email })
  if (userIds.length) {
    await UserProduct.deleteMany({ userId: { $in: userIds } })
  }
  console.log("  ✅ User limpo (fresh start)")

  // Buscar dados
  console.log("  📡 Buscando dados via Adapter...")

  const allData = await hotmartAdapterService.fetchHotmartDataForSync({
    includeProgress: true,
    includeLessons: true,
    progressConcurrency: 5,
  })

  const userData = allData.find(
    (u: any) => u.email?.toLowerCase() === email.toLowerCase()
  )

  if (!userData) {
    throw new Error(`User ${email} não encontrado no Hotmart`)
  }

  console.log("  ✅ Dados encontrados\n")

  // TESTE 1: Legacy
  console.log("  🔄 TESTE 1: Legacy Sync...")

  const legacyData = {
    email: userData.email!,
    subdomain: process.env.HOTMART_SUBDOMAIN || SCRIPT_CONFIG.HOTMART_SUBDOMAIN,
    name: userData.name,
    status: "ACTIVE",
    progress: userData.progress?.percentage || 0,
    lastAccess:
      userData.lastAccessDate instanceof Date
        ? userData.lastAccessDate
        : userData.lastAccessDate
          ? new Date(userData.lastAccessDate as string)
          : undefined,
    classes: userData.className
      ? [
          {
            classId: userData.classId || "",
            className: userData.className,
          },
        ]
      : [],
  }

  await hotmartSyncService.syncHotmart(legacyData)

  const legacyUser = await User.findOne({ email }).lean()
  const legacyProduct = (await Product.findOne({
    platform: "hotmart",
    isActive: true,
  }).lean()) as any

  const legacyUserProduct = legacyProduct
    ? await UserProduct.findOne({
        userId: legacyUser?._id,
        productId: legacyProduct._id,
      }).lean()
    : null

  console.log("  ✅ Legacy sync OK")
  console.log(`     User ID: ${legacyUser?._id}`)
  console.log(
    `     UserProduct: ${legacyUserProduct ? "Criado" : "Não criado"}\n`
  )

  // Limpar novamente (FIX)
  const usersToDelete2 = await User.find({ email }).select("_id").lean()
  const userIds2 = usersToDelete2.map((u: any) => u._id)

  await User.deleteMany({ email })
  if (userIds2.length) {
    await UserProduct.deleteMany({ userId: { $in: userIds2 } })
  }

  // TESTE 2: Universal
  console.log("  🔄 TESTE 2: Universal Sync...")

  await universalSyncService.executeUniversalSync({
    syncType: "hotmart",
    jobName: "Comparison Test",
    triggeredBy: "MANUAL",
    fullSync: false,
    includeProgress: true,
    includeTags: false,
    batchSize: 1,
    sourceData: userData,
  })

  const universalUser = await User.findOne({ email }).lean()
  const universalProduct = (await Product.findOne({
    platform: "hotmart",
    isActive: true,
  }).lean()) as any

  const universalUserProduct = universalProduct
    ? await UserProduct.findOne({
        userId: universalUser?._id,
        productId: universalProduct._id,
      }).lean()
    : null

  console.log("  ✅ Universal sync OK")
  console.log(`     User ID: ${universalUser?._id}`)
  console.log(
    `     UserProduct: ${universalUserProduct ? "Criado" : "Não criado"}\n`
  )

  // Comparar
  console.log("  🔍 COMPARAÇÃO:")

  const legacyUserClean = cleanSnapshot(legacyUser)
  const universalUserClean = cleanSnapshot(universalUser)
  const legacyUPClean = cleanSnapshot(legacyUserProduct)
  const universalUPClean = cleanSnapshot(universalUserProduct)

  const userEqual =
    JSON.stringify(legacyUserClean) === JSON.stringify(universalUserClean)
  const upEqual =
    JSON.stringify(legacyUPClean) === JSON.stringify(universalUPClean)

  // Report + Diff
  const userDiff = diffObjects(legacyUserClean, universalUserClean)
  const userProductDiff = diffObjects(legacyUPClean, universalUPClean)

  const report: ComparisonReport = {
    meta: {
      generatedAt: new Date().toISOString(),
      platform: "hotmart",
      email,
      jobName: "Comparison Test",
    },
    legacy: {
      user: legacyUserClean,
      userProduct: legacyUPClean,
    },
    universal: {
      user: universalUserClean,
      userProduct: universalUPClean,
    },
    comparison: {
      userEqual,
      userProductEqual: upEqual,
      userDiff,
      userProductDiff,
    },
  }

  await writeReportToFile(report)

  if (userEqual && upEqual) {
    console.log("     ✅ IDÊNTICOS! Ambos métodos produzem mesmo resultado\n")
    console.log("\n✅ VEREDICTO: PASSOU!")
    console.log("   ✅ Universal Sync está pronto para substituir services antigos")
    console.log("   🚀 Pode avançar para FASE 2 com segurança\n")
  } else {
    console.log("     ⚠️ DIFERENÇAS encontradas:")
    console.log(`     User: ${userEqual ? "✅" : "❌"}`)
    console.log(`     UserProduct: ${upEqual ? "✅" : "❌"}\n`)
    console.log("\n⚠️ VEREDICTO: ATENÇÃO - Há diferenças!")
    console.log("   🔧 Revisar diferenças antes de prosseguir\n")
  }
}

// ═══════════════════════════════════════════════════════════
// TESTE CURSEDUCA
// ═══════════════════════════════════════════════════════════

async function testCursEduca(
  email: string,
  curseducaSyncService: any,
  curseducaAdapterService: any,
  universalSyncService: any
) {
  console.log(`🔍 Testando: ${email}\n`)

  // Limpar (FIX)
  const usersToDelete = await User.find({ email }).select("_id").lean()
  const userIds = usersToDelete.map((u: any) => u._id)

  await User.deleteMany({ email })
  if (userIds.length) {
    await UserProduct.deleteMany({ userId: { $in: userIds } })
  }
  console.log("  ✅ User limpo (fresh start)")

  // Buscar dados
  console.log("  📡 Buscando dados via Adapter...")

  const allData = await curseducaAdapterService.fetchCurseducaDataForSync({
    includeProgress: true,
    includeGroups: true,
    enrichWithDetails: true,
  })

  const userData = allData.find(
    (u: any) => u.email?.toLowerCase() === email.toLowerCase()
  )

  if (!userData) {
    throw new Error(`User ${email} não encontrado no CursEduca`)
  }

  console.log("  ✅ Dados encontrados\n")

  // TESTE 1: Legacy
  console.log("  🔄 TESTE 1: Legacy Sync...")

  const legacyData = {
    email: userData.email!,
    groupId: userData.groupId?.toString() || "",
    name: userData.name || userData.email!,
    curseducaUserId: userData.curseducaUserId,
    curseducaUuid: userData.curseducaUuid,
    progress: userData.progress?.percentage || 0,
    enrollmentDate:
      userData.enrolledAt instanceof Date
        ? userData.enrolledAt
        : userData.enrolledAt
          ? new Date(userData.enrolledAt as string)
          : new Date(),
    lastAccess:
      userData.lastAccess instanceof Date
        ? userData.lastAccess
        : userData.lastAccess
          ? new Date(userData.lastAccess as string)
          : undefined,
    lastLogin:
      userData.lastLogin instanceof Date
        ? userData.lastLogin
        : userData.lastLogin
          ? new Date(userData.lastLogin as string)
          : undefined,
    situation: userData.platformData?.situation,
    enrollmentsCount: userData.platformData?.enrollmentsCount,
    subscriptionType: userData.subscriptionType,
    isPrimary: userData.platformData?.isPrimary,
  }

  await curseducaSyncService.syncCursEduca(legacyData)

  const legacyUser = await User.findOne({ email }).lean()
  const legacyProduct = (await Product.findOne({
    platform: "curseduca",
    isActive: true,
  }).lean()) as any

  const legacyUserProduct = legacyProduct
    ? await UserProduct.findOne({
        userId: legacyUser?._id,
        productId: legacyProduct._id,
      }).lean()
    : null

  console.log("  ✅ Legacy sync OK")
  console.log(`     User ID: ${legacyUser?._id}`)
  console.log(
    `     UserProduct: ${legacyUserProduct ? "Criado" : "Não criado"}\n`
  )

  // Limpar novamente (FIX)
  const usersToDelete2 = await User.find({ email }).select("_id").lean()
  const userIds2 = usersToDelete2.map((u: any) => u._id)

  await User.deleteMany({ email })
  if (userIds2.length) {
    await UserProduct.deleteMany({ userId: { $in: userIds2 } })
  }

  // TESTE 2: Universal
  console.log("  🔄 TESTE 2: Universal Sync...")

  await universalSyncService.executeUniversalSync({
    syncType: "curseduca",
    jobName: "Comparison Test",
    triggeredBy: "MANUAL",
    fullSync: false,
    includeProgress: true,
    includeTags: false,
    batchSize: 1,
    sourceData: userData,
  })

  const universalUser = await User.findOne({ email }).lean()
  const universalProduct = (await Product.findOne({
    platform: "curseduca",
    isActive: true,
  }).lean()) as any

  const universalUserProduct = universalProduct
    ? await UserProduct.findOne({
        userId: universalUser?._id,
        productId: universalProduct._id,
      }).lean()
    : null

  console.log("  ✅ Universal sync OK")
  console.log(`     User ID: ${universalUser?._id}`)
  console.log(
    `     UserProduct: ${universalUserProduct ? "Criado" : "Não criado"}\n`
  )

  // Comparar
  console.log("  🔍 COMPARAÇÃO:")

  const legacyUserClean = cleanSnapshot(legacyUser)
  const universalUserClean = cleanSnapshot(universalUser)
  const legacyUPClean = cleanSnapshot(legacyUserProduct)
  const universalUPClean = cleanSnapshot(universalUserProduct)

  const userEqual =
    JSON.stringify(legacyUserClean) === JSON.stringify(universalUserClean)
  const upEqual =
    JSON.stringify(legacyUPClean) === JSON.stringify(universalUPClean)

  // Report + Diff
  const userDiff = diffObjects(legacyUserClean, universalUserClean)
  const userProductDiff = diffObjects(legacyUPClean, universalUPClean)

  const report: ComparisonReport = {
    meta: {
      generatedAt: new Date().toISOString(),
      platform: "curseduca",
      email,
      jobName: "Comparison Test",
    },
    legacy: {
      user: legacyUserClean,
      userProduct: legacyUPClean,
    },
    universal: {
      user: universalUserClean,
      userProduct: universalUPClean,
    },
    comparison: {
      userEqual,
      userProductEqual: upEqual,
      userDiff,
      userProductDiff,
    },
  }

  await writeReportToFile(report)

  if (userEqual && upEqual) {
    console.log("     ✅ IDÊNTICOS! Ambos métodos produzem mesmo resultado\n")
    console.log("\n✅ VEREDICTO: PASSOU!")
    console.log("   ✅ Universal Sync está pronto para substituir services antigos")
    console.log("   🚀 Pode avançar para FASE 2 com segurança\n")
  } else {
    console.log("     ⚠️ DIFERENÇAS encontradas:")
    console.log(`     User: ${userEqual ? "✅" : "❌"}`)
    console.log(`     UserProduct: ${upEqual ? "✅" : "❌"}\n`)
    console.log("\n⚠️ VEREDICTO: ATENÇÃO - Há diferenças!")
    console.log("   🔧 Revisar diferenças antes de prosseguir\n")
  }
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function cleanSnapshot(obj: any): any {
  if (!obj) return null

  const cleaned = JSON.parse(JSON.stringify(obj))

  // Remover campos que variam
  delete cleaned.updatedAt
  delete cleaned.createdAt
  delete cleaned.__v
  delete cleaned._id

  if (cleaned.metadata) {
    delete cleaned.metadata.updatedAt
  }

  if (cleaned.hotmart) {
    delete cleaned.hotmart.lastSyncAt
    delete cleaned.hotmart.syncVersion
  }

  if (cleaned.curseduca) {
    delete cleaned.curseduca.lastSyncAt
    delete cleaned.curseduca.syncVersion
  }

  if (cleaned.engagement) {
    delete cleaned.engagement.calculatedAt
  }

  return cleaned
}

// ═══════════════════════════════════════════════════════════
// EXECUTAR
// ═══════════════════════════════════════════════════════════

main()
  .then(() => {
    console.log("✅ Comparação completa!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n💥 Erro fatal:", error)
    process.exit(1)
  })
