const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bo_db')
  .then(async () => {
    const TagRule = require('./src/models/acTags/TagRule').default;

    const rules = await TagRule.find({})
      .populate('courseId')
      .select('name courseId category isActive')
      .lean();

    console.log('\n📊 TODAS AS REGRAS NA BD:\n');
    console.log('Total:', rules.length);
    console.log('\n');

    rules.forEach((rule, i) => {
      console.log(`${i+1}. ${rule.name}`);
      console.log(`   Course: ${rule.courseId?.name || 'SEM COURSE'}`);
      console.log(`   Code: ${rule.courseId?.code || 'SEM CODE'}`);
      console.log(`   Category: ${rule.category}`);
      console.log(`   Active: ${rule.isActive}`);
      console.log('');
    });

    // Agrupar por code
    const byCourse = {};
    rules.forEach(rule => {
      const code = rule.courseId?.code || 'SEM_CODE';
      if (!byCourse[code]) byCourse[code] = [];
      byCourse[code].push(rule.name);
    });

    console.log('📦 AGRUPADAS POR COURSE CODE:\n');
    Object.entries(byCourse).forEach(([code, ruleNames]) => {
      console.log(`${code}: ${ruleNames.length} regras`);
      ruleNames.forEach(name => console.log(`   - ${name}`));
      console.log('');
    });

    process.exit(0);
  })
  .catch(err => {
    console.error('Erro:', err.message);
    process.exit(1);
  });
