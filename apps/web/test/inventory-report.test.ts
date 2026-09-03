import assert from 'node:assert/strict'
import test from 'node:test'
import readXlsxFile from 'read-excel-file/node'
import writeXlsxFile from 'write-excel-file/node'
import { inventoryReportFileName,inventoryReportRows,inventoryReportSchema,type InventoryReportSession } from '../src/features/inventory/inventory-report'

const session:InventoryReportSession={inventoryNo:'KK-2026/09 01',name:'Kiểm kê Hà Nội',status:'CLOSED',startedAt:'2026-09-01T01:00:00.000Z',closedAt:'2026-09-02T01:00:00.000Z',creator:{fullName:'Quản trị viên'},scopeDepartment:{name:'IT'},items:[{id:'1',result:'MATCHED',scannedAt:'2026-09-01T02:00:00.000Z',scanner:{fullName:'Nguyễn Đức Lâm'},asset:{assetTag:'TS-001',name:'Laptop',serialNumber:'SN-1',category:{name:'Laptop'}},expectedLocation:{name:'Hà Nội'},expectedCustodian:{fullName:'Vũ Tuấn Anh'},observedLocation:{name:'Hà Nội'},observedCustodian:{fullName:'Vũ Tuấn Anh'}},{id:'2',result:'MISSING',asset:{assetTag:'TS-002',name:'PC',warehouse:{name:'Kho IT'}},expectedCustodian:null}]}

test('inventory reconciliation rows preserve snapshot, observed values and audit actor',()=>{const rows=inventoryReportRows(session);assert.equal(rows.length,2);assert.equal(rows[0].expectedLocation,'Hà Nội');assert.equal(rows[0].observedCustodian,'Vũ Tuấn Anh');assert.equal(rows[0].scannedBy,'Nguyễn Đức Lâm');assert.equal(rows[1].expectedLocation,'Kho IT');assert.equal(rows[1].result,'Thiếu');assert.match(rows[0].scope,/IT/)})
test('inventory export file name is safe on Windows',()=>{const name=inventoryReportFileName(session);assert.match(name,/^doi-soat-KK-2026-09-01-\d{4}-\d{2}-\d{2}\.xlsx$/);assert.doesNotMatch(name,/[\\/:*?"<>|]/)})
test('inventory reconciliation produces a readable Excel workbook',async()=>{const workbook=await writeXlsxFile(inventoryReportRows(session),{columns:inventoryReportSchema()}).toBuffer();const parsed=await readXlsxFile(workbook);assert.equal(workbook.subarray(0,2).toString(),'PK');assert.equal(parsed[0].data[0][0],'STT');assert.equal(parsed[0].data[1][8],'TS-001');assert.equal(parsed[0].data[2][16],'Thiếu')})
