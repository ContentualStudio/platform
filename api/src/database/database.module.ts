import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule, TypeOrmModuleOptions } from "@nestjs/typeorm";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => {
        const useSsl = configService.get<boolean>("database.ssl") ?? false;

        return {
          type: "postgres",
          url: configService.getOrThrow<string>("database.url"),
          autoLoadEntities: true,
          logging: configService.get<boolean>("database.logging") ?? false,
          migrationsRun: false,
          retryAttempts: 5,
          retryDelay: 3000,
          ssl: useSsl ? { rejectUnauthorized: false } : false,
          synchronize:
            configService.get<boolean>("database.synchronize") ?? false,
        };
      },
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
