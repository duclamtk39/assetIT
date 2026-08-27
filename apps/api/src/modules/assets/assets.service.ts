import { BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException } from '@nestjs/common'
import { AssetHistoryAction,Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { CreateAssetDto,ListAssetsQuery,UpdateAssetDto } from './assets.dto'

type Actor={id:string;role:string;departmentId:string|null}
const include={category:true,model:true,manufacturer:true,status:true,assignedUser:true,currentCustodian:{include:{department:true,location:true}},department:true,location:true,warehouse:true,assignments:{where:{status:'OPEN' as const},orderBy:{createdAt:'desc' as const},take:1}} as const

@Injectable()
export class AssetsService{
  constructor(private readonly db:PrismaService){}
  private assertOperator(actor:Actor){if(!['ADMIN','IT','HCNS'].includes(actor.role))throw new ForbiddenException('Tài khoản không có quyền quản lý tài sản')}
  private scopedDepartment(actor:Actor,requested?:string){
    if(actor.role!=='HCNS')return requested
    if(!actor.departmentId)throw new ForbiddenException('Tài khoản HCNS chưa được gán phòng ban')
    if(requested&&requested!==actor.departmentId)throw new ForbiddenException('Không được truy cập tài sản ngoài phòng ban được phân quyền')
    return actor.departmentId
  }
  private assertAssetScope(actor:Actor,departmentId?:string|null){if(actor.role==='HCNS'&&departmentId!==actor.departmentId)throw new ForbiddenException('Không được truy cập tài sản ngoài phòng ban được phân quyền')}

  async list(q:ListAssetsQuery,actor:Actor){
    this.assertOperator(actor)
    const term=q.search?.trim(),text=term?{contains:term,mode:'insensitive' as const}:undefined,departmentId=this.scopedDepartment(actor,q.department)
    const search:Prisma.AssetWhereInput[]=text?[
      {assetTag:text},{barcode:text},{name:text},{serialNumber:text},{systemUuid:text},{notes:text},
      {category:{is:{OR:[{code:text},{name:text}]}}},{model:{is:{OR:[{name:text},{modelNumber:text}]}}},{manufacturer:{is:{name:text}}},
      {assignedUser:{is:{OR:[{employeeCode:text},{username:text},{fullName:text},{email:text}]}}},{currentCustodian:{is:{OR:[{employeeCode:text},{fullName:text},{email:text}]}}},
      {department:{is:{OR:[{code:text},{name:text}]}}},{location:{is:{OR:[{code:text},{name:text},{address:text}]}}},{warehouse:{is:{OR:[{code:text},{name:text}]}}},
      {status:{is:{OR:[{code:text},{name:text}]}}},{histories:{some:{OR:[{description:text},{referenceType:text}]}}},
    ]:[]
    const where:Prisma.AssetWhereInput={deletedAt:null,categoryId:q.category,departmentId,locationId:q.location,status:q.status?{code:q.status}:undefined,AND:[...(search.length?[{OR:search}]:[]),...(q.assignedUser?[{OR:[{assignedUserId:q.assignedUser},{currentCustodianId:q.assignedUser}]}]:[])]}
    const allowed=['assetTag','name','createdAt','updatedAt','purchaseCost'],sort=allowed.includes(q.sort)?q.sort:'assetTag'
    const [data,total]=await this.db.$transaction([this.db.asset.findMany({where,include,skip:(q.page-1)*q.limit,take:q.limit,orderBy:{[sort]:q.order}}),this.db.asset.count({where})])
    return {data,meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)}}
  }

  async get(id:string,actor:Actor){this.assertOperator(actor);const value=await this.db.asset.findFirst({where:{id,deletedAt:null},include});if(!value)throw new NotFoundException({code:'ASSET_NOT_FOUND',message:'Không tìm thấy tài sản'});this.assertAssetScope(actor,value.departmentId);return value}
  async scan(rawValue:string,actor:Actor){
    this.assertOperator(actor)
    const value=rawValue.trim(),departmentId=this.scopedDepartment(actor)
    const equals={equals:value,mode:'insensitive' as const}
    const asset=await this.db.asset.findFirst({where:{deletedAt:null,departmentId,OR:[{assetTag:equals},{barcode:equals},{serialNumber:equals}]},include,orderBy:{createdAt:'asc'}})
    if(!asset)throw new NotFoundException({code:'ASSET_SCAN_NOT_FOUND',message:'Không tìm thấy tài sản theo Barcode, QR, mã tài sản hoặc serial'})
    return asset
  }
  async summary(actor:Actor){
    this.assertOperator(actor);const departmentId=this.scopedDepartment(actor),base={deletedAt:null,departmentId}
    const [total,assigned,available,attention,due]=await Promise.all([
      this.db.asset.count({where:base}),this.db.asset.count({where:{...base,currentCustodianId:{not:null}}}),this.db.asset.count({where:{...base,status:{code:'READY'}}}),
      this.db.asset.count({where:{...base,status:{code:{in:['MAINTENANCE','BROKEN','LOST']}}}}),this.db.assetAssignment.count({where:{status:'OPEN',expectedReturnDate:{lt:new Date()},...(departmentId?{departmentId}:{})}}),
    ]);return {total,assigned,available,due,attention}
  }
  async history(id:string,actor:Actor){await this.get(id,actor);return {data:await this.db.assetHistory.findMany({where:{assetId:id},include:{actor:{select:{fullName:true}}},orderBy:{createdAt:'desc'}})}}

  async create(body:CreateAssetDto,actor:Actor){
    if(!['ADMIN','IT'].includes(actor.role))throw new ForbiddenException('Chỉ Admin hoặc IT được nhập kho tài sản')
    try{return await this.db.$transaction(async tx=>{
      const status=await tx.assetStatus.findUnique({where:{code:'READY'}});if(!status)throw new BadRequestException('Thiếu trạng thái READY; hãy chạy migration mới nhất')
      const warehouse=await tx.warehouse.findFirst({where:{id:body.warehouseId,status:'ACTIVE'}});if(!warehouse)throw new BadRequestException('Kho nhập không hợp lệ')
      if(body.locationId&&body.locationId!==warehouse.locationId)throw new BadRequestException('Vị trí nhập phải thuộc kho đã chọn')
      const asset=await tx.asset.create({data:{assetTag:body.assetTag.trim(),name:body.name.trim(),serialNumber:body.serialNumber?.trim()||null,systemUuid:body.systemUuid?.trim()||null,barcode:body.barcode.trim(),categoryId:body.categoryId,modelId:body.modelId,manufacturerId:body.manufacturerId,statusId:status.id,warehouseId:warehouse.id,locationId:warehouse.locationId,purchaseDate:body.purchaseDate?new Date(body.purchaseDate):undefined,purchaseCost:body.purchaseCost,warrantyMonths:body.warrantyMonths,cpu:body.cpu?.trim(),ram:body.ram?.trim(),storage:body.storage?.trim(),operatingSystem:body.operatingSystem?.trim(),ipAddress:body.ipAddress?.trim(),macAddress:body.macAddress?.trim(),notes:body.notes?.trim()},include})
      await tx.assetHistory.create({data:{assetId:asset.id,action:AssetHistoryAction.CREATED,toLocationId:warehouse.locationId,description:`Nhập kho ${warehouse.name}`,performedBy:actor.id}})
      await tx.auditLog.create({data:{userId:actor.id,action:'ASSET_RECEIVED',entityType:'Asset',entityId:asset.id,newValues:{assetTag:asset.assetTag,status:'READY',warehouseId:warehouse.id} as Prisma.InputJsonValue}});return asset
    })}catch(error:any){if(error?.code==='P2002')throw new ConflictException({code:'ASSET_IDENTITY_EXISTS',message:'Mã tài sản, barcode hoặc serial đã tồn tại'});throw error}
  }

  async update(id:string,body:UpdateAssetDto,actor:Actor){
    const current=await this.get(id,actor),normalized={...body,assetTag:body.assetTag?.trim(),name:body.name?.trim(),barcode:body.barcode?.trim(),serialNumber:body.serialNumber?.trim()||undefined,systemUuid:body.systemUuid?.trim()||undefined,purchaseDate:body.purchaseDate?new Date(body.purchaseDate):undefined,cpu:body.cpu?.trim(),ram:body.ram?.trim(),storage:body.storage?.trim(),operatingSystem:body.operatingSystem?.trim(),ipAddress:body.ipAddress?.trim(),macAddress:body.macAddress?.trim()}
    try{return await this.db.$transaction(async tx=>{const asset=await tx.asset.update({where:{id},data:normalized,include});await tx.assetHistory.create({data:{assetId:id,action:AssetHistoryAction.UPDATED,description:'Cập nhật thông tin tài sản',performedBy:actor.id}});await tx.auditLog.create({data:{userId:actor.id,action:'ASSET_METADATA_UPDATED',entityType:'Asset',entityId:id,oldValues:{assetTag:current.assetTag,name:current.name,serialNumber:current.serialNumber} as Prisma.InputJsonValue,newValues:body as Prisma.InputJsonValue}});return asset})}catch(error:any){if(error?.code==='P2002')throw new ConflictException('Mã tài sản, barcode hoặc serial đã tồn tại');throw error}
  }

  async remove(id:string,actor:Actor){
    const asset=await this.get(id,actor);if(!['ADMIN','IT'].includes(actor.role))throw new ForbiddenException('Chỉ Admin hoặc IT được ngừng theo dõi tài sản');if(asset.status.code!=='READY'||asset.currentCustodianId)throw new BadRequestException('Chỉ tài sản Sẵn sàng, chưa cấp phát mới được ngừng theo dõi');if(await this.db.assetAssignment.count({where:{assetId:id}}) )throw new BadRequestException('Tài sản đã có lịch sử nghiệp vụ; hãy thanh lý thay vì xóa')
    return this.db.$transaction(async tx=>{const deletedAt=new Date(),tombstone=`DELETED-${id}`;await tx.assetHistory.create({data:{assetId:id,action:AssetHistoryAction.UPDATED,description:`Ngừng theo dõi tài sản ${asset.assetTag} (soft delete)`,performedBy:actor.id}});await tx.auditLog.create({data:{userId:actor.id,action:'ASSET_SOFT_DELETED',entityType:'Asset',entityId:id,oldValues:{assetTag:asset.assetTag,barcode:asset.barcode,serialNumber:asset.serialNumber,systemUuid:asset.systemUuid} as Prisma.InputJsonValue,newValues:{deletedAt:deletedAt.toISOString()} as Prisma.InputJsonValue}});await tx.asset.update({where:{id},data:{archivedAssetTag:asset.assetTag,archivedBarcode:asset.barcode,archivedSerialNumber:asset.serialNumber,archivedSystemUuid:asset.systemUuid,assetTag:tombstone,barcode:tombstone,serialNumber:null,systemUuid:null,deletedAt}});return {success:true}})
  }
}
