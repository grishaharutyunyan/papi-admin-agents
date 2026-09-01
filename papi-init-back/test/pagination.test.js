const assert = require('node:assert/strict');
const { test } = require('node:test');

// `@Type(() => Number)` needs the `Reflect.getMetadata` polyfill, normally
// installed by importing `reflect-metadata` once at the app's entrypoint
// (`src/main.ts`). This test file is its own entrypoint.
require('reflect-metadata');

const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');

const { PaginationQueryDto } = require('../dist/core/http/pagination.dto.js');

/**
 * Phase 1 exit criterion: "`limit=99999` against a request validated with
 * `PaginationQueryDto` returns 400 (rejected by `@Max(200)`)." The DTO itself
 * has no HTTP surface yet in Phase 1, so this validates it exactly the way
 * the global `ValidationPipe` would: `plainToInstance` (query strings arrive
 * as strings) then `validateSync`.
 */

test('limit=99999 is rejected by @Max(200)', () => {
  const dto = plainToInstance(PaginationQueryDto, { limit: '99999' }, { enableImplicitConversion: false });
  const errors = validateSync(dto);

  const limitError = errors.find((e) => e.property === 'limit');
  assert.ok(limitError, 'expected a validation error on `limit`');
  assert.ok(limitError.constraints.max, 'expected the @Max constraint to fire');
});

test('limit=200 is accepted (the cap itself is inclusive)', () => {
  const dto = plainToInstance(PaginationQueryDto, { limit: '200' }, { enableImplicitConversion: false });
  const errors = validateSync(dto);

  assert.equal(errors.filter((e) => e.property === 'limit').length, 0);
});

test('order only ever accepts a direction, never a column name', () => {
  const dto = plainToInstance(
    PaginationQueryDto,
    { order: 'panel.name' },
    { enableImplicitConversion: false },
  );
  const errors = validateSync(dto);

  const orderError = errors.find((e) => e.property === 'order');
  assert.ok(orderError, 'expected a validation error — order is not an allowlisted direction');
});
