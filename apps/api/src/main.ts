import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { applyEvidenceBodyLimit } from './evidence/evidence-upload';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  // Behind a load balancer, per-IP throttling must see the client address.
  const hops = config.get<number>('trustProxyHops', 0);
  if (hops > 0) {
    app.set('trust proxy', hops);
  }

  const prefix = config.get<string>('apiPrefix', 'api/v1');
  app.setGlobalPrefix(prefix);
  // Row 252: the evidence route alone accepts bodies up to the evidence limit.
  applyEvidenceBodyLimit(app, config, prefix);
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