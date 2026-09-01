import { HttpStatus } from '@nestjs/common';

/**
 * RFC 9457 `application/problem+json` body.
 *
 * `type` is deliberately always `about:blank` — this service never defines
 * problem-type-specific documentation pages, so RFC 9457 says the title/status
 * pair alone conveys the meaning. `instance` carries the request id rather
 * than a URI path, per the shared contract in
 * `papi-init-back-module-inventory.md` Part S.2: a user can report
 * "error ref `<id>`" without ever seeing internal text.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  /** Only present for structured DTO validation failures. */
  errors?: string[];
}

/** Human-readable titles for the statuses this service actually throws. */
const STATUS_TITLES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
  [HttpStatus.BAD_GATEWAY]: 'Bad Gateway',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
  [HttpStatus.GATEWAY_TIMEOUT]: 'Gateway Timeout',
};

export function titleFor(status: number): string {
  return STATUS_TITLES[status] ?? 'Error';
}

/**
 * ONE generic message per status-code family (module inventory Part S.2). Any
 * 5xx status not listed here — and every non-`HttpException` throw, which has
 * no status of its own — falls back to the 500 message. There is
 * deliberately no per-endpoint customization: the whole point is that the
 * caller learns nothing about what actually failed.
 */
const GENERIC_MESSAGES: Partial<Record<number, string>> = {
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'An unexpected error occurred.',
  [HttpStatus.BAD_GATEWAY]: 'Bad gateway.',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable.',
  [HttpStatus.GATEWAY_TIMEOUT]: 'Gateway timeout.',
};

export function genericMessageFor(status: number): string {
  return GENERIC_MESSAGES[status] ?? GENERIC_MESSAGES[HttpStatus.INTERNAL_SERVER_ERROR]!;
}
