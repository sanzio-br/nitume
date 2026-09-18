import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix(config.get<string>('apiPrefix', 'api/v1'));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors({ origin: true, credentials: true });
  app.enableShutdownHooks();

  const port = config.get<number>('port', 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`Nitume API listening on :${port} (${config.get<string>('nodeEnv')})`);
}

void bootstrap();