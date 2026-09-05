import { Module } from '@nestjs/common'
import { PeopleAdminController, PeopleLookupController } from './people.controller'
import { PeopleService } from './people.service'
@Module({ controllers: [PeopleLookupController, PeopleAdminController], providers: [PeopleService] })
export class PeopleModule {}
