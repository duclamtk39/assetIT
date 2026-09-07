import { Module } from '@nestjs/common'
import { ComplianceController } from './compliance.controller'
import { ComplianceService } from './compliance.service'
import { DocumentStorage } from './document-storage'

@Module({ controllers: [ComplianceController], providers: [ComplianceService, DocumentStorage] })
export class ComplianceModule {}
