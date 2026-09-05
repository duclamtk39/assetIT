import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { DatabaseModule } from './database/database.module'
import { HealthController } from './health.controller'
import { AssetsModule } from './modules/assets/assets.module'
import { LookupsModule } from './modules/lookups/lookups.module'
import { RequestLoggerMiddleware } from './common/request-logger.middleware'
import { AuthModule } from './auth/auth.module'
import { DirectoryModule } from './modules/directory/directory.module'
import { UsersModule } from './modules/users/users.module'
import { PeopleModule } from './modules/people/people.module'
import { CategoriesModule } from './modules/categories/categories.module'
import { LifecycleModule } from './modules/lifecycle/lifecycle.module'
import { SettingsModule } from './modules/settings/settings.module'
import { MasterDataModule } from './modules/master-data/master-data.module'
import { VendorsModule } from './modules/vendors/vendors.module'
import { InventoryModule } from './modules/inventory/inventory.module'
import { AssetImportsModule } from './modules/asset-imports/asset-imports.module'
import { ObservabilityModule } from './observability/observability.module'
import { DiscoveryModule } from './modules/discovery/discovery.module'
import { IncidentsModule } from './modules/incidents/incidents.module'
import { RenewalsModule } from './modules/renewals/renewals.module'
import { RisksModule } from './modules/risks/risks.module'
import { DisposalsModule } from './modules/disposals/disposals.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    ObservabilityModule,
    AuthModule,
    AssetsModule,
    LookupsModule,
    DirectoryModule,
    UsersModule,
    PeopleModule,
    CategoriesModule,
    LifecycleModule,
    SettingsModule,
    MasterDataModule,
    VendorsModule,
    InventoryModule,
    AssetImportsModule,
    DiscoveryModule,
    IncidentsModule,
    RenewalsModule,
    RisksModule,
    DisposalsModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*')
  }
}
