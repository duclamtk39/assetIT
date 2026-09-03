export type InventoryResultCode='PENDING'|'MATCHED'|'LOCATION_MISMATCH'|'CUSTODIAN_MISMATCH'|'BOTH_MISMATCH'|'MISSING'|'UNEXPECTED'

type Named={name:string}
type Person={fullName:string}
export interface InventoryReportItem{id:string;result:InventoryResultCode;scannedAt?:string|null;note?:string|null;asset:{assetTag:string;name:string;serialNumber?:string|null;category?:Named|null;warehouse?:Named|null};expectedLocation?:Named|null;observedLocation?:Named|null;expectedCustodian?:Person|null;observedCustodian?:Person|null;scanner?:Person|null}
export interface InventoryReportSession{inventoryNo:string;name:string;status:'OPEN'|'CLOSED'|'CANCELLED';startedAt:string;closedAt?:string|null;creator?:Person|null;scopeDepartment?:Named|null;scopeLocation?:Named|null;scopeWarehouse?:Named|null;scopeCategory?:Named|null;items:InventoryReportItem[]}

const resultLabels:Record<InventoryResultCode,string>={PENDING:'Chưa kiểm',MATCHED:'Khớp',LOCATION_MISMATCH:'Sai vị trí',CUSTODIAN_MISMATCH:'Sai người sử dụng',BOTH_MISMATCH:'Sai vị trí và người sử dụng',MISSING:'Thiếu',UNEXPECTED:'Ngoài phạm vi'}
const statusLabels={OPEN:'Đang mở',CLOSED:'Đã chốt',CANCELLED:'Đã hủy'} as const
const dateTime=(value?:string|null)=>value?new Date(value).toLocaleString('vi-VN'):'—'
const scope=(session:InventoryReportSession)=>[session.scopeDepartment&&`Phòng ban: ${session.scopeDepartment.name}`,session.scopeLocation&&`Vị trí: ${session.scopeLocation.name}`,session.scopeWarehouse&&`Kho: ${session.scopeWarehouse.name}`,session.scopeCategory&&`Nhóm: ${session.scopeCategory.name}`].filter(Boolean).join(' · ')||'Toàn bộ tài sản được phân quyền'

export const inventoryResultLabel=(value:InventoryResultCode)=>resultLabels[value]
export const inventoryReportRows=(session:InventoryReportSession)=>session.items.map((item,index)=>({order:index+1,inventoryNo:session.inventoryNo,inventoryName:session.name,sessionStatus:statusLabels[session.status],scope:scope(session),startedAt:dateTime(session.startedAt),closedAt:dateTime(session.closedAt),createdBy:session.creator?.fullName||'—',assetTag:item.asset.assetTag,assetName:item.asset.name,serialNumber:item.asset.serialNumber||'',category:item.asset.category?.name||'',expectedLocation:item.expectedLocation?.name||item.asset.warehouse?.name||'—',expectedCustodian:item.expectedCustodian?.fullName||'Chưa gán',observedLocation:item.observedLocation?.name||'—',observedCustodian:item.observedCustodian?.fullName||'Chưa ghi nhận',result:resultLabels[item.result],scannedAt:dateTime(item.scannedAt),scannedBy:item.scanner?.fullName||'—',note:item.note||''}))
const safeFilePart=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')||'kiem-ke'
export const inventoryReportFileName=(session:InventoryReportSession)=>`doi-soat-${safeFilePart(session.inventoryNo)}-${new Date().toISOString().slice(0,10)}.xlsx`
export const inventoryReportSchema=()=>{
  type Row=ReturnType<typeof inventoryReportRows>[number]
  const columns:Array<[string,keyof Row,number,typeof String|typeof Number]>=[['STT','order',7,Number],['Mã đợt','inventoryNo',20,String],['Tên đợt','inventoryName',28,String],['Trạng thái đợt','sessionStatus',16,String],['Phạm vi','scope',38,String],['Bắt đầu','startedAt',20,String],['Chốt lúc','closedAt',20,String],['Người tạo','createdBy',22,String],['Mã tài sản','assetTag',22,String],['Tên tài sản','assetName',28,String],['Serial','serialNumber',20,String],['Nhóm tài sản','category',20,String],['Vị trí theo sổ','expectedLocation',24,String],['Người giữ theo sổ','expectedCustodian',24,String],['Vị trí thực tế','observedLocation',24,String],['Người giữ thực tế','observedCustodian',24,String],['Kết quả đối soát','result',27,String],['Thời điểm kiểm','scannedAt',20,String],['Người kiểm','scannedBy',22,String],['Ghi chú / Bằng chứng','note',36,String]]
  return columns.map(([header,key,width,type])=>({header:{value:header,type:String,fontWeight:'bold' as const,backgroundColor:'#DCE6F1'},cell:(row:Row)=>({value:row[key],type}),width}))
}

export async function exportInventoryReport(session:InventoryReportSession){
  const writeXlsxFile=(await import('write-excel-file/browser')).default
  const rows=inventoryReportRows(session)
  await writeXlsxFile(rows,{columns:inventoryReportSchema()}).toFile(inventoryReportFileName(session))
}
