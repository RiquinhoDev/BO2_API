// Script para investigar e corrigir problemas com turmas ID 6 e 7
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Class } from '../models/Class';
import User from '../models/user';

dotenv.config();

async function investigateAndFix() {
  try {
    console.log('🔌 Conectando ao MongoDB...\n');
    const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!MONGO_URI) {
      throw new Error('MONGODB_URI não encontrado no .env');
    }

    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado com sucesso!\n');

    // ═══════════════════════════════════════════════════════════
    // 1. INVESTIGAR TURMAS ID 6 E 7
    // ═══════════════════════════════════════════════════════════
    console.log('📊 INVESTIGANDO TURMAS ID 6 E 7\n');
    console.log('='.repeat(60));

    const targetClasses = await Class.find({
      $or: [
        { classId: '6' },
        { classId: '7' }
      ]
    }).lean();

    console.log(`\nEncontradas ${targetClasses.length} turmas:\n`);

    for (const cls of targetClasses) {
      console.log(`\n📌 Turma: ${cls.name}`);
      console.log(`   ID: ${cls.classId}`);
      console.log(`   _id: ${cls._id}`);
      console.log(`   Source: ${cls.source}`);
      console.log(`   isActive: ${cls.isActive}`);
      console.log(`   studentCount: ${cls.studentCount}`);
      console.log(`   curseducaId: ${cls.curseducaId || 'N/A'}`);
      console.log(`   curseducaUuid: ${cls.curseducaUuid || 'N/A'}`);
      console.log(`   productId: ${cls.productId || 'N/A'}`);

      // Procurar alunos associados a esta turma
      console.log(`\n   🔍 Procurando alunos...`);

      // Busca 1: Por classId direto (legacy)
      const studentsLegacy = await User.find({
        classId: cls.classId,
        'inactivation.isManuallyInactivated': { $ne: true }
      }).select('name email classId').lean();

      // Busca 2: Por enrolledClasses no Hotmart
      const studentsHotmart = await User.find({
        'hotmart.enrolledClasses': {
          $elemMatch: {
            classId: cls.classId,
            isActive: true
          }
        },
        'inactivation.isManuallyInactivated': { $ne: true }
      }).select('name email hotmart.enrolledClasses').lean();

      // Busca 3: Por enrolledClasses no CursEduca usando curseducaUuid
      let studentsCurseduca: any[] = [];
      if (cls.curseducaUuid) {
        studentsCurseduca = await User.find({
          'curseduca.enrolledClasses': {
            $elemMatch: {
              curseducaUuid: cls.curseducaUuid,
              isActive: true
            }
          },
          'inactivation.isManuallyInactivated': { $ne: true }
        }).select('name email curseduca.enrolledClasses curseduca.groupCurseducaUuid').lean();
      }

      // Busca 4: Por enrolledClasses no CursEduca usando classId
      const studentsCurseducaById = await User.find({
        'curseduca.enrolledClasses': {
          $elemMatch: {
            classId: cls.classId,
            isActive: true
          }
        },
        'inactivation.isManuallyInactivated': { $ne: true }
      }).select('name email curseduca.enrolledClasses curseduca.groupCurseducaUuid').lean();

      // Busca 5: Por groupCurseducaUuid direto (se existir)
      let studentsByGroupUuid: any[] = [];
      if (cls.curseducaUuid) {
        studentsByGroupUuid = await User.find({
          'curseduca.groupCurseducaUuid': cls.curseducaUuid,
          'inactivation.isManuallyInactivated': { $ne: true }
        }).select('name email curseduca.groupCurseducaUuid curseduca.groupName').lean();
      }

      console.log(`   ├─ Legacy (classId direto): ${studentsLegacy.length} alunos`);
      console.log(`   ├─ Hotmart (enrolledClasses): ${studentsHotmart.length} alunos`);
      console.log(`   ├─ CursEduca (enrolledClasses por UUID): ${studentsCurseduca.length} alunos`);
      console.log(`   ├─ CursEduca (enrolledClasses por classId): ${studentsCurseducaById.length} alunos`);
      console.log(`   └─ CursEduca (groupCurseducaUuid): ${studentsByGroupUuid.length} alunos`);

      // Mostrar alguns exemplos
      if (studentsLegacy.length > 0) {
        console.log(`\n   📝 Exemplo alunos Legacy:`);
        studentsLegacy.slice(0, 3).forEach((s: any) => {
          console.log(`      - ${s.name} (${s.email})`);
        });
      }

      if (studentsHotmart.length > 0) {
        console.log(`\n   📝 Exemplo alunos Hotmart:`);
        studentsHotmart.slice(0, 3).forEach((s: any) => {
          console.log(`      - ${s.name} (${s.email})`);
        });
      }

      if (studentsCurseduca.length > 0) {
        console.log(`\n   📝 Exemplo alunos CursEduca (enrolledClasses UUID):`);
        studentsCurseduca.slice(0, 3).forEach((s: any) => {
          console.log(`      - ${s.name} (${s.email})`);
          console.log(`        groupUuid: ${s.curseduca?.groupCurseducaUuid}`);
        });
      }

      if (studentsCurseducaById.length > 0) {
        console.log(`\n   📝 Exemplo alunos CursEduca (enrolledClasses classId):`);
        studentsCurseducaById.slice(0, 3).forEach((s: any) => {
          console.log(`      - ${s.name} (${s.email})`);
          console.log(`        groupUuid: ${s.curseduca?.groupCurseducaUuid}`);
        });
      }

      if (studentsByGroupUuid.length > 0) {
        console.log(`\n   📝 Exemplo alunos CursEduca (groupCurseducaUuid):`);
        studentsByGroupUuid.slice(0, 3).forEach((s: any) => {
          console.log(`      - ${s.name} (${s.email})`);
          console.log(`        groupName: ${s.curseduca?.groupName}`);
          console.log(`        groupUuid: ${s.curseduca?.groupCurseducaUuid}`);
        });
      }

      // Total único de alunos
      const allStudentIds = new Set([
        ...studentsLegacy.map((s: any) => s._id.toString()),
        ...studentsHotmart.map((s: any) => s._id.toString()),
        ...studentsCurseduca.map((s: any) => s._id.toString()),
        ...studentsCurseducaById.map((s: any) => s._id.toString()),
        ...studentsByGroupUuid.map((s: any) => s._id.toString())
      ]);

      console.log(`\n   ✅ TOTAL ÚNICO: ${allStudentIds.size} alunos encontrados`);
      console.log(`   ⚠️  studentCount na turma: ${cls.studentCount}`);

      if (allStudentIds.size !== cls.studentCount) {
        console.log(`   🔧 PRECISA ATUALIZAR studentCount de ${cls.studentCount} para ${allStudentIds.size}!`);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 2. INVESTIGAR TURMAS DUPLICADAS COM IDS LONGOS
    // ═══════════════════════════════════════════════════════════
    console.log('\n\n📊 INVESTIGANDO TURMAS DUPLICADAS\n');
    console.log('='.repeat(60));

    // Procurar turmas "Clareza"
    const clarezaClasses = await Class.find({
      name: /Clareza/i
    }).sort({ name: 1, classId: 1 }).lean();

    console.log(`\nEncontradas ${clarezaClasses.length} turmas com "Clareza":\n`);

    const clarezaGroups: { [key: string]: any[] } = {};
    clarezaClasses.forEach((cls: any) => {
      const baseName = cls.name;
      if (!clarezaGroups[baseName]) {
        clarezaGroups[baseName] = [];
      }
      clarezaGroups[baseName].push(cls);
    });

    for (const [name, classes] of Object.entries(clarezaGroups)) {
      console.log(`\n📌 Grupo: "${name}"`);
      console.log(`   Total: ${classes.length} turma(s)`);

      if (classes.length > 1) {
        console.log(`\n   ⚠️  DUPLICATAS ENCONTRADAS!`);

        // Ordenar: priorizar curseduca_sync > IDs curtos > mais antigos
        classes.sort((a, b) => {
          if (a.source === 'curseduca_sync' && b.source !== 'curseduca_sync') return -1;
          if (a.source !== 'curseduca_sync' && b.source === 'curseduca_sync') return 1;
          if (a.classId.length < b.classId.length) return -1;
          if (a.classId.length > b.classId.length) return 1;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });

        classes.forEach((cls, idx) => {
          const tag = idx === 0 ? '✅ MANTER' : '❌ REMOVER';
          console.log(`\n   ${tag}`);
          console.log(`   ├─ classId: ${cls.classId} (length: ${cls.classId.length})`);
          console.log(`   ├─ _id: ${cls._id}`);
          console.log(`   ├─ source: ${cls.source}`);
          console.log(`   ├─ studentCount: ${cls.studentCount}`);
          console.log(`   ├─ isActive: ${cls.isActive}`);
          console.log(`   ├─ curseducaId: ${cls.curseducaId || 'N/A'}`);
          console.log(`   ├─ curseducaUuid: ${cls.curseducaUuid || 'N/A'}`);
          console.log(`   └─ createdAt: ${cls.createdAt}`);
        });

        // Listar IDs para remover
        const toRemove = classes.slice(1);
        if (toRemove.length > 0) {
          console.log(`\n   🗑️  IDs MONGODB para remover:`);
          toRemove.forEach((cls) => {
            console.log(`      db.classes.deleteOne({ _id: ObjectId("${cls._id}") })`);
          });
        }
      } else {
        classes.forEach((cls) => {
          console.log(`   ├─ classId: ${cls.classId}`);
          console.log(`   ├─ source: ${cls.source}`);
          console.log(`   └─ studentCount: ${cls.studentCount}`);
        });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 3. RESUMO E CORREÇÕES SUGERIDAS
    // ═══════════════════════════════════════════════════════════
    console.log('\n\n🔧 RESUMO E CORREÇÕES\n');
    console.log('='.repeat(60));

    console.log('\n✅ Investigação concluída!');
    console.log('\nPróximos passos:');
    console.log('1. Verificar output acima');
    console.log('2. Usar comandos MongoDB para remover duplicatas');
    console.log('3. Atualizar studentCount das turmas se necessário');
    console.log('4. Verificar se source deveria ser "curseduca_sync" para IDs 6 e 7');

    await mongoose.disconnect();
    console.log('\n✅ Desconectado do MongoDB');

  } catch (error) {
    console.error('❌ Erro:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

// Executar
investigateAndFix();
