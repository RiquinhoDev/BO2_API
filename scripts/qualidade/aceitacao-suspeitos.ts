// Vendas em bruto dos casos que precisam de julgamento humano. SÓ LÊ.
import { loadConfig } from '../../src/config/appConfig'
import { initializeRuntimeConfig } from '../../src/config/runtimeConfig'
initializeRuntimeConfig(loadConfig(process.env))
import { ligar, desligar } from './lib'

const ALVOS = ['ajmsantos2022@gmail.com', 'rubenalme@gmail.com', 'juditedesousa@gmail.com']
const dia = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : '—')

async function main() {
  const db = await ligar()
  const docs = await db.collection('hotmartsalehistories').find({ email: { $in: ALVOS } }).toArray()
  for (const d of docs) {
    console.log('\n' + '═'.repeat(78))
    console.log(d.email)
    for (const s of (d.sales ?? []).sort((a: any, b: any) =>
      new Date(a.approvedDate ?? a.orderDate).getTime() - new Date(b.approvedDate ?? b.orderDate).getTime())) {
      console.log(
        `  ${dia(s.approvedDate ?? s.orderDate)}  ${String(s.priceValue ?? '—').padStart(7)}€  ` +
        `estado ${String(s.transactionStatus).padEnd(9)} cob ${String(s.recurrencyNumber ?? '—').padStart(2)}  ` +
        `prest ${String(s.installmentsNumber ?? '—').padStart(2)}  modo ${String(s.paymentMode ?? '—').padEnd(17)} ` +
        `oferta ${String(s.offerCode ?? '—').padEnd(10)} ${s.transaction}`
      )
    }
  }
  await desligar()
}
main().catch((e) => { console.error(e); process.exit(1) })
