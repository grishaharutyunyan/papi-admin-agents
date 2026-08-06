import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { Injectable } from '@nestjs/common';

/** Callback-style in Node 24; there is no promise overload. */
const argon2Async = promisify(argon2);

/**
 * OWASP-recommended argon2id parameters (2026). Encoded into every hash, so
 * raising them later does not invalidate existing passwords — an old hash still
 * verifies with its own recorded parameters.
 */
const PARAMS = { memory: 65_536, passes: 3, parallelism: 4, tagLength: 32 } as const;
const SALT_BYTES = 16;
const ARGON2_VERSION = 19;

/**
 * argon2id password hashing on Node's built-in `crypto.argon2` (dossier 0.34).
 *
 * argon2id rather than bcrypt: it is OWASP's current first choice, and bcrypt
 * silently truncates at 72 bytes — a real footgun for passphrases.
 *
 * The KDF is Node's; what this class adds is the standard PHC string encoding
 * so hashes stay portable and any conforming tool can verify them. That
 * encoding is cross-checked against the `argon2` npm package in the test suite.
 *
 * Holds no key material — the salt lives in the hash — so unlike the signing
 * key this is safe to export from CryptoModule.
 */
@Injectable()
export class PasswordHasherService {
  async hash(password: string): Promise<string> {
    const nonce = randomBytes(SALT_BYTES);
    const tag = await argon2Async('argon2id', {
      message: Buffer.from(password, 'utf8'),
      nonce,
      ...PARAMS,
    });

    return [
      '',
      'argon2id',
      `v=${ARGON2_VERSION}`,
      `m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}`,
      b64(nonce),
      b64(tag),
    ].join('$');
  }

  /**
   * Constant-time verification.
   *
   * Returns `false` rather than throwing on a malformed hash: a corrupt stored
   * value must read as "wrong password", never as a server error that
   * distinguishes one account from another.
   */
  async verify(password: string, encoded: string): Promise<boolean> {
    const parsed = parsePhc(encoded);
    if (!parsed) return false;

    const tag = await argon2Async('argon2id', {
      message: Buffer.from(password, 'utf8'),
      nonce: parsed.salt,
      memory: parsed.memory,
      passes: parsed.passes,
      parallelism: parsed.parallelism,
      tagLength: parsed.tag.length,
    });

    return tag.length === parsed.tag.length && timingSafeEqual(tag, parsed.tag);
  }

  /** True when a stored hash was produced with weaker parameters than current. */
  needsRehash(encoded: string): boolean {
    const parsed = parsePhc(encoded);
    if (!parsed) return true;

    return (
      parsed.memory < PARAMS.memory ||
      parsed.passes < PARAMS.passes ||
      parsed.parallelism !== PARAMS.parallelism
    );
  }
}

/** PHC uses unpadded base64. */
function b64(value: Buffer): string {
  return value.toString('base64').replace(/=+$/, '');
}

interface ParsedPhc {
  memory: number;
  passes: number;
  parallelism: number;
  salt: Buffer;
  tag: Buffer;
}

function parsePhc(encoded: string): ParsedPhc | null {
  // $argon2id$v=19$<params>$<salt>$<tag>
  //
  // The parameter segment is parsed as unordered key=value pairs, NOT
  // positionally: PHC does not fix an order and implementations disagree — the
  // argon2 reference and this service emit `m,t,p` while the `argon2` npm
  // package emits `m,p,t`. A positional regex silently fails to verify
  // perfectly valid hashes produced elsewhere (caught in cross-verification).
  const segments = encoded.split('$');
  if (segments.length !== 6 || segments[0] !== '' || segments[1] !== 'argon2id') return null;

  const [, , version, rawParams, salt, tag] = segments;
  if (version !== `v=${ARGON2_VERSION}`) return null;
  if (!rawParams || !salt || !tag) return null;

  const params = new Map<string, number>();
  for (const pair of rawParams.split(',')) {
    const [key, value] = pair.split('=');
    if (!key || value === undefined || !/^\d+$/.test(value)) return null;
    params.set(key, Number(value));
  }

  const memory = params.get('m');
  const passes = params.get('t');
  const parallelism = params.get('p');
  if (memory === undefined || passes === undefined || parallelism === undefined) return null;

  if (!/^[A-Za-z0-9+/]+$/.test(salt) || !/^[A-Za-z0-9+/]+$/.test(tag)) return null;

  return {
    memory,
    passes,
    parallelism,
    salt: Buffer.from(salt, 'base64'),
    tag: Buffer.from(tag, 'base64'),
  };
}
