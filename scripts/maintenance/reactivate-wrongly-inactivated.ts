import 'dotenv/config'
import mongoose from 'mongoose'
import User from '../../src/models/user'
import UserProduct from '../../src/models/UserProduct'
import UserHistory from '../../src/models/UserHistory'
import { parseTurmaName } from '../../src/services/renewal/turmaParser'

const DRY_RUN = process.env.DRY_RUN !== 'false'
const ONLY_EMAIL = process.env.EMAIL?.trim().toLowerCase()
const SYSTEM_ACTOR = 'Sistema - Expiração Automática'

function fmt(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : 'sem data'
}

function getActiveHotmartClass(user: any): { classId?: string; className?: string } | null {
  const classes = Array.isArray(user?.hotmart?.enrolledClasses) ? user.hotmart.enrolledClasses : []
  const activeClass = classes.find((cls: any) => cls?.className && cls.isActive !== false)
  const anyClass = classes.find((cls: any) => cls?.className)
  const cls = activeClass || anyClass

  if (cls) {
    return {
      classId: cls.classId,
      className: cls.className
    }
  }

  if (user?.className) {
    return {
      classId: user.classId,
      className: user.className
    }
  }

  return null
}

async function main(): Promise<void> {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI
  if (!mongoUri) {
    throw new Error('MONGO_URI ou MONGODB_URI não configurado')
  }

  await mongoose.connect(mongoUri)

  // Apanha TODOS os inactivados pelo automatismo (isManuallyInactivated true OU false —
  // o automatismo gravou ambos). O filtro de expiração abaixo é que garante a segurança.
  const query: any = {
    'inactivation.inactivatedBy': SYSTEM_ACTOR
  }

  if (ONLY_EMAIL) {
    query.email = ONLY_EMAIL
  }

  const users = await User.find(query).lean()
  const now = new Date()
  let eligible = 0
  let reactivated = 0
  let skipped = 0

  console.log(`🔎 A analisar ${users.length} utilizadores inativados por expiração automática`)
  console.log(`Modo: ${DRY_RUN ? 'DRY_RUN' : 'APLICAR'}`)

  for (const user of users as any[]) {
    const activeClass = getActiveHotmartClass(user)

    if (!activeClass?.className) {
      skipped++
      console.log(`⏭️  ${user.email}: sem turma Hotmart ativa`)
      continue
    }

    const parsed = parseTurmaName(activeClass.className)

    if (!parsed.hasExpiry || !parsed.accessEndOgi) {
      skipped++
      console.log(`⏭️  ${user.email}: turma sem período válido (${activeClass.className})`)
      continue
    }

    if (parsed.accessEndOgi.getTime() < now.getTime()) {
      skipped++
      console.log(`⏭️  ${user.email}: acesso expirado em ${fmt(parsed.accessEndOgi)} (${activeClass.className})`)
      continue
    }

    eligible++
    console.log(`✅ ${user.email}: elegível para reativação, acesso até ${fmt(parsed.accessEndOgi)} (${activeClass.className})`)

    if (DRY_RUN) {
      continue
    }

    await User.findByIdAndUpdate(user._id, {
      $set: {
        status: 'ACTIVE',
        estado: 'ativo',
        'combined.status': 'ACTIVE',
        'hotmart.status': 'ACTIVE',
        'inactivation.isManuallyInactivated': false,
        'inactivation.reactivatedAt': now,
        'inactivation.reactivatedBy': 'Sistema - Reconciliação de Expiração',
        'inactivation.reactivationReason': 'sync'
      },
      $unset: {
        'inactivation.inactivatedAt': '',
        'inactivation.inactivatedBy': '',
        'inactivation.reason': '',
        'inactivation.platforms': '',
        'inactivation.classId': ''
      }
    })

    await UserProduct.updateMany(
      { userId: String(user._id), platform: 'hotmart', status: { $in: ['INACTIVE', 'PARA_INATIVAR'] } },
      { $set: { status: 'ACTIVE' } }
    )

    await UserHistory.create({
      userId: user._id,
      userEmail: user.email,
      changeType: 'STATUS_CHANGE',
      previousValue: {
        status: 'INACTIVE',
        inactivation: user.inactivation
      },
      newValue: {
        status: 'ACTIVE',
        reason: `Acesso OGI válido até ${fmt(parsed.accessEndOgi)}`,
        classId: activeClass.classId,
        className: activeClass.className,
        accessEndOgi: parsed.accessEndOgi
      },
      platform: 'hotmart',
      action: 'update',
      changeDate: now,
      source: 'SYSTEM',
      changedBy: 'Sistema - Reconciliação de Expiração',
      reason: 'Reativação automática: aluno inativado por purchaseDate, mas com expiração real válida'
    })

    reactivated++
  }

  console.log('\nResumo:')
  console.log(`  Elegíveis: ${eligible}`)
  console.log(`  Reativados: ${reactivated}`)
  console.log(`  Ignorados: ${skipped}`)
}

main()
  .catch((error) => {
    console.error('Erro na reconciliação:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect()
    }
  })
