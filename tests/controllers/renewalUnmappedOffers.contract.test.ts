import type { Request, Response, NextFunction } from 'express'
import { listOffers } from '../../src/controllers/renewal.controller'
import RenewalOffer from '../../src/models/RenewalOffer'
import { getUnmappedBaseOffers } from '../../src/services/renewal/unmappedBaseOffers.service'
jest.mock('../../src/models/RenewalOffer', () => ({__esModule:true,default:{find:jest.fn()}}))
jest.mock('../../src/services/renewal/unmappedBaseOffers.service', () => ({getUnmappedBaseOffers:jest.fn()}))
jest.mock('../../src/services/cron/scheduler', () => ({__esModule:true,default:{}}))
beforeEach(() => jest.clearAllMocks())
test('returns real unmapped offers inside the canonical data envelope', async () => {
 const find = {sort:jest.fn().mockReturnThis(),limit:jest.fn().mockReturnThis(),lean:jest.fn().mockReturnThis(),exec:jest.fn().mockResolvedValue([])}
 jest.mocked(RenewalOffer.find).mockReturnValue(find as never)
 const unmapped = [{offerCode:'synthetic',offerName:'Synthetic base',periodYYMM:null,alunosAfetados:2,salesCount:3,priceValue:100,currency:'EUR',lastSeenAt:new Date('2026-01-01')}]
 jest.mocked(getUnmappedBaseOffers).mockResolvedValue(unmapped)
 const res={json:jest.fn()} as unknown as Response
 const next=jest.fn() as NextFunction
 await listOffers({query:{}} as Request,res,next)
 expect(res.json).toHaveBeenCalledWith({success:true,data:{offers:[],semTurma:unmapped},meta:{total:0}})
 expect(next).not.toHaveBeenCalled()
})
test('fails explicitly if the unmapped read fails instead of claiming no pending offers', async () => {
 const find={sort:jest.fn().mockReturnThis(),limit:jest.fn().mockReturnThis(),lean:jest.fn().mockReturnThis(),exec:jest.fn().mockResolvedValue([])}
 jest.mocked(RenewalOffer.find).mockReturnValue(find as never)
 jest.mocked(getUnmappedBaseOffers).mockRejectedValue(new Error('read failed'))
 const res={json:jest.fn()} as unknown as Response
 const next=jest.fn()
 await listOffers({query:{}} as Request,res,next)
 expect(next).toHaveBeenCalledWith(expect.objectContaining({code:'RENEWAL_LIST_FAILED'}))
 expect(res.json).not.toHaveBeenCalled()
})
