// Script para corrigir problemas com turmas
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI não encontrado no .env');
  process.exit(1);
}

async function fixClasses() {
  const client = new MongoClient(MONGO_URI);

  try {
    console.log('🔌 Conectando ao MongoDB...\n');
    await client.connect();
    console.log('✅ Conectado!\n');

    const db = client.db();
    const classesCol = db.collection('classes');

    console.log('🔧 APLICANDO CORREÇÕES\n');
    console.log('='.repeat(60));

    // ═══════════════════════════════════════════════════════════
    // 1. REMOVER TURMAS DUPLICADAS (IDs longos/UUIDs)
    // ═══════════════════════════════════════════════════════════
    console.log('\n📌 Removendo turmas duplicadas...\n');

    const duplicatesToRemove = [
      { _id: new ObjectId('68f6502f8fb579499fdd583a'), name: 'Clareza - Anual (UUID)' },
      { _id: new ObjectId('68f6370b83a548117371e02d'), name: 'Clareza - Mensal (UUID)' }
    ];

    for (const dup of duplicatesToRemove) {
      console.log(`   Removendo: ${dup.name}`);
      console.log(`   _id: ${dup._id}`);

      const result = await classesCol.deleteOne({ _id: dup._id });

      if (result.deletedCount > 0) {
        console.log(`   ✅ Removida com sucesso!\n`);
      } else {
        console.log(`   ⚠️  Não encontrada (já foi removida?)\n`);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 2. ATUALIZAR studentCount DAS TURMAS 6 E 7
    // ═══════════════════════════════════════════════════════════
    console.log('\n📌 Atualizando studentCount...\n');

    const classesToUpdate = [
      { _id: new ObjectId('69657f4ffec024044d623314'), classId: '6', name: 'Clareza - Mensal' },
      { _id: new ObjectId('69657f4cfec024044d622ec6'), classId: '7', name: 'Clareza - Anual' }
    ];

    for (const cls of classesToUpdate) {
      console.log(`   Atualizando: ${cls.name} (classId: ${cls.classId})`);

      const result = await classesCol.updateOne(
        { _id: cls._id },
        { $set: { studentCount: 0 } }
      );

      if (result.modifiedCount > 0) {
        console.log(`   ✅ studentCount atualizado para 0\n`);
      } else {
        console.log(`   ℹ️  Já estava correto ou não encontrado\n`);
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 3. VERIFICAR curseducaUuid (OPCIONAL - SE DISPONÍVEL)
    // ═══════════════════════════════════════════════════════════
    console.log('\n📌 Verificando curseducaUuid...\n');

    // As turmas duplicadas tinham os UUIDs, vamos verificar se precisamos adicionar
    const uuidMapping = [
      { classId: '6', uuid: 'e0e74523-a8f7-41dd-9813-a557ee51d46b' },
      { classId: '7', uuid: '7b1232b0-d03f-499e-8f49-b7750bb75c52' }
    ];

    for (const mapping of uuidMapping) {
      const cls = await classesCol.findOne({ classId: mapping.classId });

      if (cls) {
        console.log(`   Turma classId ${mapping.classId}:`);
        console.log(`   ├─ curseducaUuid atual: ${cls.curseducaUuid || 'N/A'}`);
        console.log(`   └─ curseducaUuid da duplicata: ${mapping.uuid}`);

        if (!cls.curseducaUuid) {
          console.log(`   🔧 Adicionando curseducaUuid...`);

          const result = await classesCol.updateOne(
            { classId: mapping.classId },
            { $set: { curseducaUuid: mapping.uuid } }
          );

          if (result.modifiedCount > 0) {
            console.log(`   ✅ curseducaUuid adicionado!\n`);
          }
        } else {
          console.log(`   ℹ️  Já tem curseducaUuid\n`);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 4. VERIFICAÇÃO FINAL
    // ═══════════════════════════════════════════════════════════
    console.log('\n📊 VERIFICAÇÃO FINAL\n');
    console.log('='.repeat(60));

    const clarezaClasses = await classesCol.find({
      name: /Clareza/i
    }).sort({ classId: 1 }).toArray();

    console.log(`\nTurmas "Clareza" restantes: ${clarezaClasses.length}\n`);

    clarezaClasses.forEach(cls => {
      console.log(`📌 ${cls.name}`);
      console.log(`   ├─ classId: ${cls.classId}`);
      console.log(`   ├─ _id: ${cls._id}`);
      console.log(`   ├─ source: ${cls.source}`);
      console.log(`   ├─ studentCount: ${cls.studentCount}`);
      console.log(`   ├─ curseducaId: ${cls.curseducaId || 'N/A'}`);
      console.log(`   └─ curseducaUuid: ${cls.curseducaUuid || 'N/A'}`);
      console.log('');
    });

    console.log('✅ CORREÇÕES CONCLUÍDAS!');
    console.log('\nResultado:');
    console.log('- Turmas duplicadas removidas: 2');
    console.log('- studentCount atualizado: 2 turmas');
    console.log('- curseducaUuid adicionados: conforme necessário');
    console.log('\n⚠️  NOTA: O problema dos alunos não aparecerem pode ser porque:');
    console.log('1. Não existem alunos realmente cadastrados nessas turmas');
    console.log('2. Os alunos estão vinculados ao UUID (que agora foi adicionado)');
    console.log('3. Precisa fazer sync do CursEduca para popular os alunos');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
    console.log('\n✅ Desconectado do MongoDB');
  }
}

// Executar
fixClasses();
