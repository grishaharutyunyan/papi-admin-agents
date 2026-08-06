import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { json, urlencoded } from 'express';
import helmet from 'helmet';

import { AppModule } from '$/app.module';
import { authConfig, coreConfig } from '$/configs/index.configs';
import { requestIdMiddleware } from '$/core/request-context/request-id';
import { ShutdownService } from '$/core/shutdown/shutdown.service';

/** Hard ceiling on `app.close()` so a hung connection pool cannot block SIGTERM. */
const CLOSE_TIMEOUT_MS = 15_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');

  const core = app.get<ConfigType<typeof coreConfig>>(coreConfig.KEY);
  const auth = app.get<ConfigType<typeof authConfig>>(authConfig.KEY);

  /**
   * MUST come before anything that reads a client IP — the throttler keys on
   * it and the audit trail records it. papi-back omits this and trusts
   * `x-forwarded-for` blindly, making both spoofable (dossier D.3b).
   */
  app.set('trust proxy', core.trustedProxyHops);

  // First in the chain: every later log line and error can be correlated.
  app.use(requestIdMiddleware);

  // `/live` and `/ready` stay unprefixed for infrastructure probes, and
  // `.well-known` is a reserved URI prefix (RFC 8615) that consumers expect at
  // the domain root.
  app.setGlobalPrefix('api', { exclude: ['live', 'ready', '.well-known/jwks.json'] });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // No 'unsafe-inline' — papi-back allows it in scriptSrc.
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  app.use(json({ limit: core.bodyLimit }));
  app.use(urlencoded({ extended: false, limit: core.bodyLimit }));

  /**
   * Exact-origin allow-list; never `*`. The invitation/join page is on its own
   * subdomain and therefore cross-origin (dossier 0.19), so it is included
   * explicitly. Requests with no `Origin` header are permitted: those are the
   * server-to-server calls the forks make (dossier B.5), not browser
   * cross-origin requests.
   */
  const allowedOrigins = new Set(core.corsOrigins);
  if (auth.invitationOrigin) allowedOrigins.add(auth.invitationOrigin);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      if (core.isLocal && allowedOrigins.size === 0) return callback(null, true);
      // `callback(null, false)` — NOT an Error. Passing an Error surfaces a
      // misleading HTTP 500 for what is simply a disallowed origin, polluting
      // error monitoring. Omitting the header is the correct CORS semantic:
      // the browser blocks the response.
      return callback(null, false);
    },
    credentials: true,
  });

  /**
   * `enableImplicitConversion` is deliberately absent: silent coercion
   * interacts badly with `forbidNonWhitelisted`. DTOs declare `@Type()`
   * explicitly instead.
   */
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );

  /**
   * `app.enableShutdownHooks()` is deliberately NOT called.
   *
   * It only exists to register process signal listeners, and Nest treats an
   * EMPTY array as "listen to every signal" (nest-application-context.js:169
   * — `if (isEmpty(signals)) signals = <all>`), so `enableShutdownHooks([])`
   * does the opposite of what it reads like. Its handler calls `app.close()`
   * immediately, racing the drain below: verified, `/ready` returned
   * connection-refused instead of 503 during the window, and TypeORM's
   * shutdown hook then threw from running twice.
   *
   * Lifecycle hooks (onModuleDestroy / onApplicationShutdown) still run — they
   * are triggered by the explicit `app.close()` in `shutdown()`, not by this.
   */

  const shutdownService = app.get(ShutdownService);
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.log(`${signal} received — draining for ${core.readinessDrainMs}ms`);

    // Flip /ready to 503 FIRST, then give load balancers a window to observe
    // it before connections are cut. papi-back closes immediately, so its
    // drain never actually drains.
    shutdownService.markShuttingDown();
    await delay(core.readinessDrainMs);

    await Promise.race([app.close(), delay(CLOSE_TIMEOUT_MS)]);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen(core.port);
  logger.log(`${core.appName} listening on ${core.port} [${core.nodeEnv}]`);
}

void bootstrap();
