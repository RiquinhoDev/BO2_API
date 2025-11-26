// BO2_API/scripts/analyze-dead-code.js
// 🔍 Análise Automática de Código Morto
// Data: 27 Novembro 2025

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONTROLLERS_DIR = path.join(__dirname, '../src/controllers');
const ROUTES_DIR = path.join(__dirname, '../src/routes');
const SERVICES_DIR = path.join(__dirname, '../src/services');

console.log('🔍 ANALISANDO CÓDIGO MORTO...\n');

// ========================================================================
// 1. ANÁLISE DE CONTROLLERS
// ========================================================================
function analyzeControllers() {
  console.log('📂 CONTROLLERS:');
  
  const controllers = fs.readdirSync(CONTROLLERS_DIR)
    .filter(f => f.endsWith('.controller.ts'));
  
  const unused = [];
  const used = [];
  
  for (const controller of controllers) {
    const name = controller.replace('.ts', '');
    
    try {
      const result = execSync(
        `grep -r "${name}" "${ROUTES_DIR}/"`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      
      if (result) {
        used.push(controller);
      } else {
        unused.push(controller);
      }
    } catch (e) {
      // Grep retorna exit code 1 se não encontrar nada
      unused.push(controller);
    }
  }
  
  console.log(`   ✅ Usados: ${used.length}`);
  console.log(`   ❌ Não usados: ${unused.length}`);
  
  if (unused.length > 0) {
    console.log('\n   🗑️  Controllers para revisar:');
    unused.forEach(c => console.log(`      - ${c}`));
  }
  
  return { used, unused };
}

// ========================================================================
// 2. ANÁLISE DE ROUTES
// ========================================================================
function analyzeRoutes() {
  console.log('\n📂 ROUTES:');
  
  const routes = fs.readdirSync(ROUTES_DIR)
    .filter(f => f.endsWith('.routes.ts') && f !== 'index.ts');
  
  const indexContent = fs.readFileSync(
    path.join(ROUTES_DIR, 'index.ts'),
    'utf8'
  );
  
  const unused = [];
  const used = [];
  
  routes.forEach(route => {
    const name = route.replace('.routes.ts', '');
    
    // Procurar por import ou uso no index
    if (indexContent.includes(name)) {
      used.push(route);
    } else {
      unused.push(route);
    }
  });
  
  console.log(`   ✅ Registadas: ${used.length}`);
  console.log(`   ❌ Não registadas: ${unused.length}`);
  
  if (unused.length > 0) {
    console.log('\n   🗑️  Routes para revisar:');
    unused.forEach(r => console.log(`      - ${r}`));
  }
  
  return { used, unused };
}

// ========================================================================
// 3. ANÁLISE DE SERVICES
// ========================================================================
function analyzeServices() {
  console.log('\n📂 SERVICES:');
  
  if (!fs.existsSync(SERVICES_DIR)) {
    console.log('   ⚠️  Pasta services não encontrada');
    return { used: [], unused: [] };
  }
  
  const services = fs.readdirSync(SERVICES_DIR)
    .filter(f => f.endsWith('.service.ts'));
  
  const unused = [];
  const used = [];
  
  for (const service of services) {
    const name = service.replace('.ts', '');
    
    try {
      // Procurar imports em controllers
      const result = execSync(
        `grep -r "${name}" "${CONTROLLERS_DIR}/"`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      
      if (result) {
        used.push(service);
      } else {
        unused.push(service);
      }
    } catch (e) {
      unused.push(service);
    }
  }
  
  console.log(`   ✅ Usados: ${used.length}`);
  console.log(`   ❌ Não usados: ${unused.length}`);
  
  if (unused.length > 0) {
    console.log('\n   🗑️  Services para revisar:');
    unused.forEach(s => console.log(`      - ${s}`));
  }
  
  return { used, unused };
}

// ========================================================================
// 4. EXECUTAR ANÁLISE
// ========================================================================
const controllersResult = analyzeControllers();
const routesResult = analyzeRoutes();
const servicesResult = analyzeServices();

// ========================================================================
// 5. RESUMO FINAL
// ========================================================================
console.log('\n' + '='.repeat(60));
console.log('📊 RESUMO FINAL:');
console.log('='.repeat(60));

const totalUnused = 
  controllersResult.unused.length + 
  routesResult.unused.length + 
  servicesResult.unused.length;

const totalFiles = 
  controllersResult.used.length + controllersResult.unused.length +
  routesResult.used.length + routesResult.unused.length +
  servicesResult.used.length + servicesResult.unused.length;

console.log(`\n   Total de ficheiros analisados: ${totalFiles}`);
console.log(`   ✅ Ficheiros em uso: ${totalFiles - totalUnused}`);
console.log(`   🗑️  Ficheiros para revisar: ${totalUnused}`);

if (totalUnused > 0) {
  const percentage = ((totalUnused / totalFiles) * 100).toFixed(1);
  console.log(`\n   💡 ${percentage}% do código pode estar obsoleto`);
  console.log(`   💾 Economia estimada: ${(totalUnused * 200).toLocaleString()} linhas`);
  
  console.log('\n' + '='.repeat(60));
  console.log('🚀 PRÓXIMOS PASSOS:');
  console.log('='.repeat(60));
  console.log('\n   1. Revisar manualmente cada ficheiro listado');
  console.log('   2. Verificar com grep se realmente não é usado:');
  console.log('      grep -r "nomeDoficheiro" src/');
  console.log('   3. Criar branch: git checkout -b cleanup/remove-dead-code');
  console.log('   4. Apagar ficheiros confirmados como mortos');
  console.log('   5. Testar: npm run build && npm run dev');
  console.log('   6. Commit e push\n');
} else {
  console.log('\n   ✅ Nenhum código morto detectado! 🎉\n');
}

