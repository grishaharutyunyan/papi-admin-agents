import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { json, urlencoded } from 'express';
import helmet from 'helmet';

import { AppModule } from '$/app.module';
import { coreConfig } from '$/configs/index.configs';
import { AllExceptionsFilter } from '$/core/errors/all-exceptions.filter';
import { bodyParserErrorMiddleware } from '$/core/http/body-parser-error-middleware';
import { requestIdMiddleware } from '$/core/request-context/request-id';
import { ShutdownService } from '$/core/shutdown/shutdown.service';

/** Hard ceiling on `app.close()` so a hung connection cannot block SIGTERM. */
const CLOSE_TIMEOUT_MS = 15_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');

  const core = app.get<ConfigType<typeof coreConfig>>(coreConfig.KEY);

  /**
   * MUST come before anything that reads a client IP — the throttler keys on
   * it, and it is what makes `req.ip` trustworthy for the `X-Forwarded-For`
   * this service will set on its own outbound calls to papi-authority
   * (Part P.6, from Phase 3). Old papi-back omits this and trusts
   * `x-forwarded-for` blindly, making both spoofable.
   */
  app.set('trust proxy', core.trustedProxyHops);

  // First in the chain: every later log line and error can be correlated.
  app.use(requestIdMiddleware);

  // `/live` and `/ready` stay unprefixed for infrastructure probes.
  app.setGlobalPrefix('api', { exclude: ['live', 'ready'] });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // No 'unsafe-inline' — old papi-back allows it in scriptSrc.
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
  // See body-parser-error-middleware.ts: neutralizes a request-body leak in
  // the SyntaxError NestJS raises for malformed JSON, before Nest's own
  // wrapping discards the type information needed to catch it later.
  app.use(bodyParserErrorMiddleware);

  /**
   * Exact-origin allow-list; never `*`. Requests with no `Origin` header are
   * permitted: those are server-to-server calls, not browser cross-origin
   * requests.
   */
  const allowedOrigins = new Set(core.corsOrigins);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      if (core.isLocal && allowedOrigins.size === 0) return callback(null, true);
      // `callback(null, false)` — NOT an Error. Passing an Error surfaces a
      // misleading HTTP 500 for what is simply a disallowed origin.
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
   * RFC-9457 `application/problem+json`, registered globally in EVERY
   * environment (dossier 0.63, module inventory Part S.2) — see
   * `src/core/errors/all-exceptions.filter.ts` for the full contract.
   */
  app.useGlobalFilters(new AllExceptionsFilter());

  /**
   * `app.enableShutdownHooks()` is deliberately NOT called — passing it an
   * empty array makes Nest listen to EVERY signal, and its handler calls
   * `app.close()` immediately, racing the drain below. Lifecycle hooks
   * (onModuleDestroy / onApplicationShutdown) still run — they are triggered
   * by the explicit `app.close()` in `shutdown()`, not by this.
   */

  const shutdownService = app.get(ShutdownService);
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.log(`${signal} received — draining for ${core.readinessDrainMs}ms`);

    // Flip /ready to 503 FIRST, then give load balancers a window to observe
    // it before connections are cut.
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
