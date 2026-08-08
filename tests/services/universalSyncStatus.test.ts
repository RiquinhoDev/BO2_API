import fs from 'fs'
import path from 'path'
import { buildCanonicalActiveUserStatusUpdate } from '../../src/services/syncUtilizadoresServices/universalSync'

describe('universal sync canonical user status', () => {
  it('updates only schema-backed status fields', () => {
    const update = buildCanonicalActiveUserStatusUpdate()

    expect(update).toEqual({
      'combined.status': 'ACTIVE',
      'hotmart.status': 'ACTIVE',
      'curseduca.memberStatus': 'ACTIVE',
    })
    expect(update).not.toHaveProperty('status')
    expect(update).not.toHaveProperty('estado')
  })

  it('keeps the Hotmart current module only in UserProduct', () => {
    const base = 'src/services/syncUtilizadoresServices/universalSync'
    const processSyncItem = fs.readFileSync(path.resolve(process.cwd(), `${base}/processSyncItem.ts`), 'utf8')
    const userProductBuilder = fs.readFileSync(path.resolve(process.cwd(), `${base}/builders/userProductMutationPlan.ts`), 'utf8')

    // currentModule is a UserProduct progress field, never a top-level User hotmart field.
    expect(processSyncItem).not.toContain("updateFields['hotmart.currentModule']")
    // update path lives in the builder, create path stays inline in processSyncItem.
    expect(userProductBuilder).toContain("fields['progress.currentModule']")
    expect(processSyncItem).toContain('progressObj.currentModule')
  })
})
