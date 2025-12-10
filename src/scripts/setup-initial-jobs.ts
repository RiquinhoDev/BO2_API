import mongoose from 'mongoose'
import cronManagementService from '../services/syncUtilziadoresServices/cronManagement.service'


async function setupJobs() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!)
    
    // Job 1: Sync Hotmart diário
    const hotmartJob = await cronManagementService.createJob({
      name: 'Sync Hotmart Diário',
      description: 'Sincronização automática do Hotmart às 2h',
      syncType: 'hotmart',
      cronExpression: '0 2 * * *',
      timezone: 'Europe/Lisbon',
      createdBy: new mongoose.Types.ObjectId('000000000000000000000001')
    })
    console.log('✅ Job Hotmart criado:', hotmartJob._id)
    
    // Job 2: Activity Snapshots mensais
    const snapshotsJob = await cronManagementService.createJob({
      name: 'Activity Snapshots Mensais',
      description: 'Criar snapshots no último dia do mês',
      syncType: 'all',
      cronExpression: '0 23 L * *',
      timezone: 'Europe/Lisbon',
      createdBy: new mongoose.Types.ObjectId('000000000000000000000001')
    })
    console.log('✅ Job Snapshots criado:', snapshotsJob._id)
    
    await mongoose.connection.close()
    console.log('✅ Setup completo!')
    
  } catch (error) {
    console.error('❌ Erro:', error)
    process.exit(1)
  }
}

setupJobs()