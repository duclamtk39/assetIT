import { BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException } from '@nestjs/common'
import { AssetAssignmentStatus,AssetHistoryAction,MaintenanceStatus,Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../../database/prisma.service'
import { AssignAssetDto,CompleteMaintenanceDto,OpenMaintenanceDto,ReturnAssetDto,TransferAssetDto } from './lifecycle.dto'
import { assignmentTarget,assertMaintenanceOpenAllowed,assertTransferAllowed,maintenanceTarget,returnTarget } from './lifecycle.rules'

type Actor={id:string;role:string;departmentId:string|null}
const lifecycleInclude={status:true,currentCustodian:true,department:true,location:true,warehouse:true} as const

@Injectable()
export class LifecycleService{
  constructor(private readonly db:PrismaService){}
  private reference(prefix:string){const date=new Date().toISOString().slice(0,10).replace(/-/g,'');return `${prefix}-${date}-${randomUUID().slice(0,8).toUpperCase()}`}
  private assertOperator(actor:Actor){if(!['ADMIN','IT','HCNS'].includes(actor.role))throw new ForbiddenException('Tài khoản không có quyền thực hiện nghiệp vụ tài sản')}
  private assertDepartmentScope(actor:Actor,departmentId?:string|null){if(actor.role==='HCNS'&&(!actor.departmentId||departmentId!==actor.departmentId))throw new ForbiddenException('HCNS chỉ được thao tác tài sản thuộc phòng ban được phân quyền')}
  private rule(action:()=>string|void){try{return action()}catch(error:any){const messages:Record<string,string>={ASSET_NOT_READY:'Chỉ tài sản Sẵn sàng trong kho mới được cấp phát hoặc cho mượn',ASSET_NOT_ASSIGNED:'Chỉ tài sản đang sử dụng hoặc đang mượn mới được thu hồi',ASSET_DISPOSED:'Tài sản đã thanh lý là trạng thái cuối và không thể tiếp tục nghiệp vụ',MAINTENANCE_NOT_ALLOWED:'Chỉ tài sản Sẵn sàng, Đã thu hồi hoặc Hỏng mới được mở bảo trì',ASSET_NOT_IN_MAINTENANCE:'Tài sản không ở trạng thái Bảo trì',DISPOSAL_WORKFLOW_REQUIRED:'Không được thanh lý trực tiếp từ bảo trì; hãy hoàn tất về Hỏng/Sẵn sàng rồi tạo hồ sơ Thanh lý & Hủy bỏ'};throw new BadRequestException(messages[error?.message]||'Chuyển trạng thái tài sản không hợp lệ')}}
  private async status(tx:Prisma.TransactionClient,code:string){const status=await tx.assetStatus.findUnique({where:{code}});if(!status)throw new BadRequestException(`Thiếu trạng thái hệ thống ${code}; hãy chạy migration mới nhất`);return status}
  private async asset(tx:Prisma.TransactionClient,id:string){const asset=await tx.asset.findFirst({where:{id,deletedAt:null},include:lifecycleInclude});if(!asset)throw new NotFoundException('Không tìm thấy tài sản');return asset}
  private conflict(error:any):never{if(error?.code==='P2002')throw new ConflictException('Tài sản đang có một nghiệp vụ mở hoặc số phiếu đã tồn tại');throw error}

  async assign(assetId:string,body:AssignAssetDto,actor:Actor){this.assertOperator(actor);try{return await this.db.$transaction(async tx=>{
    const asset=await this.asset(tx,assetId);const person=await tx.person.findFirst({where:{id:body.assignedToId,status:'ACTIVE'}});if(!person)throw new BadRequestException('Người nhận không tồn tại hoặc đã ngừng hoạt động');this.assertDepartmentScope(actor,person.departmentId)
    const location=await tx.location.findFirst({where:{id:body.locationId,status:'ACTIVE'}});if(!location)throw new BadRequestException('Vị trí bàn giao không hợp lệ')
    const target=this.rule(()=>assignmentTarget(asset.status.code,body.type)) as string
    if(asset.currentCustodianId)throw new BadRequestException('Tài sản đang có người sử dụng; phải thu hồi trước khi cấp cho người khác')
    const expected=body.expectedReturnDate?new Date(body.expectedReturnDate):null;if(body.type==='LOAN'&&(!expected||expected<=new Date()))throw new BadRequestException('Cho mượn bắt buộc có ngày trả dự kiến trong tương lai')
    const targetStatus=await this.status(tx,target);const assignment=await tx.assetAssignment.create({data:{assignmentNo:this.reference(body.type==='LOAN'?'PM':'PCP'),assetId,type:body.type,assignedToId:person.id,departmentId:person.departmentId,locationId:location.id,expectedReturnDate:expected,conditionOut:body.conditionOut.trim(),note:body.note?.trim(),assignedBy:actor.id}})
    await tx.asset.update({where:{id:assetId},data:{statusId:targetStatus.id,currentCustodianId:person.id,assignedUserId:person.linkedUserId,departmentId:person.departmentId,locationId:location.id,warehouseId:null}})
    await tx.assetHistory.create({data:{assetId,action:AssetHistoryAction.ASSIGNED,toUserId:person.linkedUserId,toLocationId:location.id,referenceType:'AssetAssignment',referenceId:assignment.id,description:`${body.type==='LOAN'?'Cho mượn':'Cấp phát'} cho ${person.fullName}`,performedBy:actor.id}})
    await tx.auditLog.create({data:{userId:actor.id,action:body.type==='LOAN'?'ASSET_LOANED':'ASSET_ASSIGNED',entityType:'Asset',entityId:assetId,newValues:{assignmentId:assignment.id,assignedToId:person.id,status:target} as Prisma.InputJsonValue}});return assignment
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(error){this.conflict(error)}}

  async returnAsset(assetId:string,body:ReturnAssetDto,actor:Actor){this.assertOperator(actor);try{return await this.db.$transaction(async tx=>{
    const asset=await this.asset(tx,assetId);this.assertDepartmentScope(actor,asset.departmentId);const target=this.rule(()=>returnTarget(asset.status.code,body.outcome)) as string
    const assignment=await tx.assetAssignment.findFirst({where:{assetId,status:AssetAssignmentStatus.OPEN},include:{assignedTo:true}});if(!assignment)throw new BadRequestException('Không tìm thấy phiếu cấp phát hoặc cho mượn đang mở')
    const warehouse=body.warehouseId?await tx.warehouse.findFirst({where:{id:body.warehouseId,status:'ACTIVE'},include:{location:true}}):null;if(body.warehouseId&&!warehouse)throw new BadRequestException('Kho nhận không hợp lệ');if(body.outcome==='READY'&&!warehouse)throw new BadRequestException('Tài sản về trạng thái Sẵn sàng phải được nhập vào một kho')
    const locationId=warehouse?.locationId||body.locationId;if(!locationId)throw new BadRequestException('Cần chọn vị trí nhận tài sản');const location=warehouse?.location||await tx.location.findFirst({where:{id:locationId,status:'ACTIVE'}});if(!location)throw new BadRequestException('Vị trí nhận không hợp lệ')
    const targetStatus=await this.status(tx,target);const returned=await tx.assetReturn.create({data:{returnNo:this.reference('PTH'),assignmentId:assignment.id,assetId,warehouseId:warehouse?.id,locationId,conditionIn:body.conditionIn.trim(),outcome:body.outcome,note:body.note?.trim(),returnedBy:actor.id}})
    if(body.outcome==='MAINTENANCE')await tx.maintenanceRecord.create({data:{maintenanceNo:this.reference('PBT'),assetId,warehouseId:warehouse?.id,issue:body.note?.trim()||`Kiểm tra sau thu hồi: ${body.conditionIn.trim()}`,performedBy:actor.id}})
    await tx.assetAssignment.update({where:{id:assignment.id},data:{status:AssetAssignmentStatus.CLOSED,closedAt:new Date()}});await tx.asset.update({where:{id:assetId},data:{statusId:targetStatus.id,currentCustodianId:null,assignedUserId:null,departmentId:null,locationId,warehouseId:warehouse?.id||null}})
    await tx.assetHistory.create({data:{assetId,action:AssetHistoryAction.RETURNED,fromUserId:assignment.assignedTo.linkedUserId,fromLocationId:asset.locationId,toLocationId:locationId,referenceType:'AssetReturn',referenceId:returned.id,description:`Thu hồi từ ${assignment.assignedTo.fullName}; kết quả ${body.outcome}`,performedBy:actor.id}})
    await tx.auditLog.create({data:{userId:actor.id,action:'ASSET_RETURNED',entityType:'Asset',entityId:assetId,newValues:{returnId:returned.id,outcome:body.outcome,status:target} as Prisma.InputJsonValue}});return returned
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(error){this.conflict(error)}}

  async transfer(assetId:string,body:TransferAssetDto,actor:Actor){this.assertOperator(actor);return this.db.$transaction(async tx=>{
    const asset=await this.asset(tx,assetId);this.assertDepartmentScope(actor,asset.departmentId);this.rule(()=>assertTransferAllowed(asset.status.code))
    const warehouse=body.toWarehouseId?await tx.warehouse.findFirst({where:{id:body.toWarehouseId,status:'ACTIVE'},include:{location:true}}):null;if(body.toWarehouseId&&!warehouse)throw new BadRequestException('Kho đích không hợp lệ');const locationId=warehouse?.locationId||body.toLocationId;if(!locationId)throw new BadRequestException('Cần chọn kho hoặc vị trí đích');const location=warehouse?.location||await tx.location.findFirst({where:{id:locationId,status:'ACTIVE'}});if(!location)throw new BadRequestException('Vị trí đích không hợp lệ');if(asset.locationId===locationId&&asset.warehouseId===(warehouse?.id||null))throw new BadRequestException('Vị trí đích phải khác vị trí hiện tại')
    const transfer=await tx.assetTransfer.create({data:{transferNo:this.reference('PDC'),assetId,fromLocationId:asset.locationId,toLocationId:locationId,fromWarehouseId:asset.warehouseId,toWarehouseId:warehouse?.id,condition:body.condition?.trim(),reason:body.reason.trim(),transferredBy:actor.id}});await tx.asset.update({where:{id:assetId},data:{locationId,warehouseId:warehouse?.id||null}});await tx.assetHistory.create({data:{assetId,action:AssetHistoryAction.TRANSFERRED,fromLocationId:asset.locationId,toLocationId:locationId,referenceType:'AssetTransfer',referenceId:transfer.id,description:`Điều chuyển đến ${location.name}`,performedBy:actor.id}});await tx.auditLog.create({data:{userId:actor.id,action:'ASSET_TRANSFERRED',entityType:'Asset',entityId:assetId,newValues:{transferId:transfer.id,toLocationId:locationId,toWarehouseId:warehouse?.id||null} as Prisma.InputJsonValue}});return transfer
  })}

  async openMaintenance(assetId:string,body:OpenMaintenanceDto,actor:Actor){this.assertOperator(actor);try{return await this.db.$transaction(async tx=>{
    const asset=await this.asset(tx,assetId);this.assertDepartmentScope(actor,asset.departmentId);this.rule(()=>assertMaintenanceOpenAllowed(asset.status.code));if(await tx.assetAssignment.findFirst({where:{assetId,status:AssetAssignmentStatus.OPEN}}))throw new BadRequestException('Phải thu hồi và đóng phiếu cấp phát trước khi mở bảo trì');const warehouse=body.warehouseId?await tx.warehouse.findFirst({where:{id:body.warehouseId,status:'ACTIVE'}}):null;if(body.warehouseId&&!warehouse)throw new BadRequestException('Kho bảo trì không hợp lệ');const targetStatus=await this.status(tx,'MAINTENANCE');const record=await tx.maintenanceRecord.create({data:{maintenanceNo:this.reference('PBT'),assetId,warehouseId:warehouse?.id,issue:body.issue.trim(),performedBy:actor.id}});await tx.asset.update({where:{id:assetId},data:{statusId:targetStatus.id,currentCustodianId:null,assignedUserId:null}});await tx.assetHistory.create({data:{assetId,action:AssetHistoryAction.MAINTENANCE,referenceType:'MaintenanceRecord',referenceId:record.id,description:`Mở bảo trì: ${body.issue.trim()}`,performedBy:actor.id}});return record
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable})}catch(error){this.conflict(error)}}

  async completeMaintenance(recordId:string,body:CompleteMaintenanceDto,actor:Actor){this.assertOperator(actor);return this.db.$transaction(async tx=>{
    const record=await tx.maintenanceRecord.findFirst({where:{id:recordId,status:MaintenanceStatus.OPEN},include:{asset:{include:lifecycleInclude}}});if(!record)throw new NotFoundException('Không tìm thấy phiếu bảo trì đang mở');this.assertDepartmentScope(actor,record.asset.departmentId);const target=this.rule(()=>maintenanceTarget(record.asset.status.code,body.outcome)) as string;let warehouse=null;if(body.outcome==='READY'){if(!body.warehouseId)throw new BadRequestException('Hoàn tất về Sẵn sàng phải chọn kho');warehouse=await tx.warehouse.findFirst({where:{id:body.warehouseId,status:'ACTIVE'}});if(!warehouse)throw new BadRequestException('Kho nhận không hợp lệ')};const targetStatus=await this.status(tx,target);const completed=await tx.maintenanceRecord.update({where:{id:recordId},data:{status:MaintenanceStatus.COMPLETED,completedAt:new Date(),resolution:body.resolution.trim(),outcome:body.outcome,cost:body.cost,warehouseId:warehouse?.id||record.warehouseId}});await tx.asset.update({where:{id:record.assetId},data:{statusId:targetStatus.id,warehouseId:warehouse?.id||(body.outcome==='DISPOSED'?null:record.asset.warehouseId),locationId:warehouse?.locationId||record.asset.locationId,currentCustodianId:null,assignedUserId:null,departmentId:body.outcome==='DISPOSED'?null:record.asset.departmentId}});await tx.assetHistory.create({data:{assetId:record.assetId,action:body.outcome==='DISPOSED'?AssetHistoryAction.DISPOSED:AssetHistoryAction.MAINTENANCE,referenceType:'MaintenanceRecord',referenceId:record.id,description:`Hoàn tất bảo trì: ${body.outcome}`,performedBy:actor.id}});await tx.auditLog.create({data:{userId:actor.id,action:'MAINTENANCE_COMPLETED',entityType:'Asset',entityId:record.assetId,newValues:{maintenanceId:record.id,outcome:body.outcome,status:target} as Prisma.InputJsonValue}});return completed
  })}

  async history(assetId:string,actor:Actor){this.assertOperator(actor);const asset=await this.db.asset.findFirst({where:{id:assetId,deletedAt:null}});if(!asset)throw new NotFoundException('Không tìm thấy tài sản');this.assertDepartmentScope(actor,asset.departmentId);const [assignments,returns,transfers,maintenance]=await Promise.all([this.db.assetAssignment.findMany({where:{assetId},include:{assignedTo:true,department:true,location:true,actor:{select:{fullName:true}}},orderBy:{createdAt:'desc'}}),this.db.assetReturn.findMany({where:{assetId},include:{warehouse:true,location:true,actor:{select:{fullName:true}}},orderBy:{createdAt:'desc'}}),this.db.assetTransfer.findMany({where:{assetId},include:{fromLocation:true,toLocation:true,actor:{select:{fullName:true}}},orderBy:{createdAt:'desc'}}),this.db.maintenanceRecord.findMany({where:{assetId},include:{actor:{select:{fullName:true}}},orderBy:{createdAt:'desc'}})]);return {assignments,returns,transfers,maintenance}}
  async allHistory(actor:Actor){
    this.assertOperator(actor)
    if(actor.role==='HCNS'&&!actor.departmentId)throw new ForbiddenException('Tài khoản HCNS chưa được gán phòng ban')
    const data=await this.db.assetHistory.findMany({
      where:{asset:{deletedAt:null,...(actor.role==='HCNS'?{departmentId:actor.departmentId}:{})}},
      include:{asset:{select:{id:true,assetTag:true,name:true}},actor:{select:{fullName:true}},fromLocation:{select:{name:true}},toLocation:{select:{name:true}}},
      orderBy:{createdAt:'desc'},take:1000,
    })
    const assignmentIds=data.filter(item=>item.referenceType==='AssetAssignment'&&item.referenceId).map(item=>item.referenceId!)
    const assignments=assignmentIds.length?await this.db.assetAssignment.findMany({
      where:{id:{in:assignmentIds}},
      include:{assignedTo:{include:{department:true}},department:true,location:true},
    }):[]
    const assignmentById=new Map(assignments.map(item=>[item.id,item]))
    return {data:data.map(item=>({...item,assignment:item.referenceType==='AssetAssignment'&&item.referenceId?assignmentById.get(item.referenceId)||null:null}))}
  }
}
