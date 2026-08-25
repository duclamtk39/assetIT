import assert from 'node:assert/strict'
import test from 'node:test'
import { MasterDataService } from '../src/modules/master-data/master-data.service'
import { SettingsService } from '../src/modules/settings/settings.service'

test('only administrators can persist application settings',async()=>{
  const service=new SettingsService({} as never)
  await assert.rejects(()=>service.update({key:'regional',value:{language:'vi-VN'}},{id:'user',role:'IT'}),/Chỉ Admin/)
})

test('public identity exposes shared branding without leaking unrelated settings',async()=>{
  const db={applicationSetting:{findMany:async()=>[
    {key:'branding',value:{appName:'AssetFlow',companyName:'Tinh Van Software',tagline:'Asset management',logoDataUrl:'data:image/webp;base64,abc',primaryColor:'#2457b2',companyAddress:'private',secret:'hidden'}},
    {key:'regional',value:{language:'vi-VN',timezone:'Asia/Ho_Chi_Minh',dateFormat:'DD/MM/YYYY',timeFormat:'24h',firstDayOfWeek:'monday',internal:'hidden'}},
  ]}}
  const result=await new SettingsService(db as never).publicIdentity()
  assert.deepEqual(result.branding,{appName:'AssetFlow',companyName:'Tinh Van Software',tagline:'Asset management',logoDataUrl:'data:image/webp;base64,abc',primaryColor:'#2457b2'})
  assert.equal('secret' in result.branding,false)
  assert.equal('companyAddress' in result.branding,false)
  assert.equal('internal' in result.regional,false)
})

test('only administrators can modify master data',async()=>{
  const service=new MasterDataService({} as never)
  await assert.rejects(()=>service.createDepartment({code:'IT',name:'IT'},{id:'user',role:'IT'}),/Chỉ Admin/)
})
