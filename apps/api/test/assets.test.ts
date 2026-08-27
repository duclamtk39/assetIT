import assert from 'node:assert/strict'
import test from 'node:test'
import { AssetsService } from '../src/modules/assets/assets.service'

test('scan queries PostgreSQL by asset tag, barcode or serial',async()=>{
  let captured:any
  const expected={id:'asset-1',assetTag:'TS-2026-001'}
  const db={asset:{findFirst:({where}:any)=>{captured=where;return Promise.resolve(expected)}}}
  const service=new AssetsService(db as any)
  assert.equal(await service.scan('  BC-000001  ',{id:'admin',role:'ADMIN',departmentId:null}),expected)
  assert.equal(captured.deletedAt,null)
  assert.deepEqual(captured.OR.map((item:any)=>Object.keys(item)[0]),['assetTag','barcode','serialNumber'])
  assert.equal(captured.OR[1].barcode.equals,'BC-000001')
})

test('HCNS scan cannot resolve assets outside its department',async()=>{
  let captured:any
  const db={asset:{findFirst:({where}:any)=>{captured=where;return Promise.resolve(null)}}}
  const service=new AssetsService(db as any)
  await assert.rejects(()=>service.scan('TS-OTHER-001',{id:'hr',role:'HCNS',departmentId:'department-hr'}),/Không tìm thấy tài sản/)
  assert.equal(captured.departmentId,'department-hr')
})

test('soft delete archives and releases all active asset identifiers',async()=>{
  let updated:any,oldValues:any
  const asset={id:'10000000-0000-4000-8000-000000000099',assetTag:'TS-001',barcode:'BC-001',serialNumber:'SN-001',systemUuid:'UUID-001',currentCustodianId:null,departmentId:null,status:{code:'READY'}}
  const tx={
    assetHistory:{create:async()=>({})},
    auditLog:{create:async({data}:any)=>{oldValues=data.oldValues;return{}}},
    asset:{update:async({data}:any)=>{updated=data;return{}}},
  }
  const db={asset:{findFirst:async()=>asset},assetAssignment:{count:async()=>0},$transaction:(work:any)=>work(tx)}
  const service=new AssetsService(db as any)
  assert.deepEqual(await service.remove(asset.id,{id:'admin',role:'ADMIN',departmentId:null}),{success:true})
  assert.deepEqual(oldValues,{assetTag:'TS-001',barcode:'BC-001',serialNumber:'SN-001',systemUuid:'UUID-001'})
  assert.equal(updated.archivedAssetTag,'TS-001')
  assert.equal(updated.archivedBarcode,'BC-001')
  assert.equal(updated.archivedSerialNumber,'SN-001')
  assert.equal(updated.archivedSystemUuid,'UUID-001')
  assert.equal(updated.assetTag,`DELETED-${asset.id}`)
  assert.equal(updated.barcode,`DELETED-${asset.id}`)
  assert.equal(updated.serialNumber,null)
  assert.equal(updated.systemUuid,null)
  assert.ok(updated.deletedAt instanceof Date)
})
