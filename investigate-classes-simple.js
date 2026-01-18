// Script simplificado para investigar turmas
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI não encontrado no .env');
  process.exit(1);
}

console.log('📡 Using MongoDB...\n');

async function investigate() {
  const client = new MongoClient(MONGO_URI);

  try {
    console.log('🔌 Conectando ao MongoDB...\n');
    await client.connect();
    console.log('✅ Conectado!\n');

    const db = client.db();
    const classesCol = db.collection('classes');
    const usersCol = db.collection('users');

    // ═══════════════════════════════════════════════════════════
    // 1. INVESTIGAR TURMAS ID 6 E 7
    // ═══════════════════════════════════════════════════════════
    console.log('📊 INVESTIGANDO TURMAS ID 6 E 7\n');
    console.log('='.repeat(60));

    const targetClasses = await classesCol.find({
      $or: [{ classId: '6' }, { classId: '7' }]
    }).toArray();

    console.log(`\nEncontradas ${targetClasses.length} turmas:\n`);

    for (const cls of targetClasses) {
      console.log(`\n📌 Turma: ${cls.name}`);
      console.log(`   classId: ${cls.classId}`);
      console.log(`   _id: ${cls._id}`);
      console.log(`   source: ${cls.source}`);
      console.log(`   isActive: ${cls.isActive}`);
      console.log(`   studentCount: ${cls.studentCount}`);
      console.log(`   curseducaId: ${cls.curseducaId || 'N/A'}`);
      console.log(`   curseducaUuid: ${cls.curseducaUuid || 'N/A'}`);

      console.log(`\n   🔍 Procurando alunos...`);

      // Busca 1: classId direto
      const count1 = await usersCol.countDocuments({
        classId: cls.classId,
        'inactivation.isManuallyInactivated': { $ne: true }
      });

      // Busca 2: hotmart.enrolledClasses
      const count2 = await usersCol.countDocuments({
        'hotmart.enrolledClasses': {
          $elemMatch: {
            classId: cls.classId,
            isActive: true
          }
        },
        'inactivation.isManuallyInactivated': { $ne: true }
      });

      // Busca 3: curseduca.enrolledClasses por UUID
      let count3 = 0;
      if (cls.curseducaUuid) {
        count3 = await usersCol.countDocuments({
          'curseduca.enrolledClasses': {
            $elemMatch: {
              curseducaUuid: cls.curseducaUuid,
              isActive: true
            }
          },
          'inactivation.isManuallyInactivated': { $ne: true }
        });
      }

      // Busca 4: curseduca.enrolledClasses por classId
      const count4 = await usersCol.countDocuments({
        'curseduca.enrolledClasses': {
          $elemMatch: {
            classId: cls.classId,
            isActive: true
          }
        },
        'inactivation.isManuallyInactivated': { $ne: true }
      });

      // Busca 5: curseduca.groupCurseducaUuid direto
      let count5 = 0;
      if (cls.curseducaUuid) {
        count5 = await usersCol.countDocuments({
          'curseduca.groupCurseducaUuid': cls.curseducaUuid,
          'inactivation.isManuallyInactivated': { $ne: true }
        });
      }

      console.log(`   ├─ Por classId direto: ${count1}`);
      console.log(`   ├─ Hotmart enrolledClasses: ${count2}`);
      console.log(`   ├─ CursEduca enrolledClasses (UUID): ${count3}`);
      console.log(`   ├─ CursEduca enrolledClasses (classId): ${count4}`);
      console.log(`   └─ CursEduca groupCurseducaUuid: ${count5}`);

      // Pegar exemplos
      if (count5 > 0) {
        console.log(`\n   📝 Exemplos (groupCurseducaUuid):`);
        const samples = await usersCol.find({
          'curseduca.groupCurseducaUuid': cls.curseducaUuid,
          'inactivation.isManuallyInactivated': { $ne: true }
        }).limit(5).toArray();

        samples.forEach(s => {
          console.log(`      - ${s.name} (${s.email})`);
          console.log(`        groupName: ${s.curseduca?.groupName}`);
        });
      }

      // Agregar todos os IDs únicos
      const pipeline = [
        {
          $match: {
            $or: [
              { classId: cls.classId },
              { 'hotmart.enrolledClasses.classId': cls.classId },
              ...(cls.curseducaUuid ? [
                { 'curseduca.enrolledClasses.curseducaUuid': cls.curseducaUuid },
                { 'curseduca.groupCurseducaUuid': cls.curseducaUuid }
              ] : []),
              { 'curseduca.enrolledClasses.classId': cls.classId }
            ],
            'inactivation.isManuallyInactivated': { $ne: true }
          }
        },
        { $group: { _id: null, count: { $sum: 1 } } }
      ];

      const result = await usersCol.aggregate(pipeline).toArray();
      const totalUnique = result[0]?.count || 0;

      console.log(`\n   ✅ TOTAL ÚNICO: ${totalUnique} alunos`);
      console.log(`   ⚠️  studentCount: ${cls.studentCount}`);

      if (totalUnique !== cls.studentCount) {
        console.log(`\n   🔧 CORREÇÃO NECESSÁRIA!`);
        console.log(`      Comando: db.classes.updateOne(`);
        console.log(`        { _id: ObjectId("${cls._id}") },`);
        console.log(`        { $set: { studentCount: ${totalUnique} } }`);
        console.log(`      )`);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 2. INVESTIGAR DUPLICATAS
    // ═══════════════════════════════════════════════════════════
    console.log('\n\n📊 INVESTIGANDO DUPLICATAS "CLAREZA"\n');
    console.log('='.repeat(60));

    const clarezaClasses = await classesCol.find({
      name: /Clareza/i
    }).sort({ name: 1, classId: 1 }).toArray();

    console.log(`\nEncontradas ${clarezaClasses.length} turmas:\n`);

    const groups = {};
    clarezaClasses.forEach(cls => {
      if (!groups[cls.name]) {
        groups[cls.name] = [];
      }
      groups[cls.name].push(cls);
    });

    for (const [name, classes] of Object.entries(groups)) {
      console.log(`\n📌 "${name}" - ${classes.length} turma(s)`);

      if (classes.length > 1) {
        console.log(`   ⚠️  DUPLICATAS!`);

        // Ordenar
        classes.sort((a, b) => {
          if (a.source === 'curseduca_sync' && b.source !== 'curseduca_sync') return -1;
          if (a.source !== 'curseduca_sync' && b.source === 'curseduca_sync') return 1;
          if (a.classId.length < b.classId.length) return -1;
          if (a.classId.length > b.classId.length) return 1;
          return 0;
        });

        classes.forEach((cls, idx) => {
          const tag = idx === 0 ? '✅ MANTER' : '❌ REMOVER';
          console.log(`\n   ${tag}`);
          console.log(`   ├─ _id: ${cls._id}`);
          console.log(`   ├─ classId: ${cls.classId} (len: ${cls.classId.length})`);
          console.log(`   ├─ source: ${cls.source}`);
          console.log(`   ├─ studentCount: ${cls.studentCount}`);
          console.log(`   └─ curseducaUuid: ${cls.curseducaUuid || 'N/A'}`);
        });

        const toRemove = classes.slice(1);
        console.log(`\n   🗑️  COMANDOS PARA REMOVER:`);
        toRemove.forEach(cls => {
          console.log(`   db.classes.deleteOne({ _id: ObjectId("${cls._id}") })`);
        });
      } else {
        const cls = classes[0];
        console.log(`   ├─ classId: ${cls.classId}`);
        console.log(`   ├─ source: ${cls.source}`);
        console.log(`   └─ studentCount: ${cls.studentCount}`);
      }
    }

    console.log('\n\n✅ Investigação concluída!');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
    console.log('\n✅ Desconectado do MongoDB');
  }
}

investigate();
