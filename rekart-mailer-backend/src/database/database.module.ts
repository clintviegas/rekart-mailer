import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        // Try all possible ways to read the URI — most direct first
        const uri =
          process.env.MONGODB_URI ||
          config.get<string>('MONGODB_URI') ||
          config.get<string>('db.uri');

        // Debug log — remove after confirming connection
        console.log(
          '[DatabaseModule] URI source:',
          process.env.MONGODB_URI
            ? 'process.env.MONGODB_URI ✓'
            : config.get<string>('MONGODB_URI')
              ? 'ConfigService(MONGODB_URI) ✓'
              : config.get<string>('db.uri')
                ? 'ConfigService(db.uri) ✓'
                : '✗ ALL UNDEFINED — check .env file',
        );

        if (!uri) {
          throw new Error(
            '[DatabaseModule] MONGODB_URI is not defined.\n' +
              'Make sure your .env file is in the project root and contains:\n' +
              'MONGODB_URI=mongodb+srv://...',
          );
        }

        return {
          uri,
          retryAttempts: Infinity,
          retryDelay: 5000,
          connectionFactory: (connection) => {
            connection.on('connected', () =>
              console.log('[MongoDB] ✓ Connected to Atlas'),
            );
            connection.on('error', (err: Error) =>
              console.error('[MongoDB] ✗ Error:', err.message),
            );
            connection.on('disconnected', () =>
              console.warn('[MongoDB] ⚠ Disconnected'),
            );
            return connection;
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
