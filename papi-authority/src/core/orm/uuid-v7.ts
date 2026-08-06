import { randomBytes } from 'node:crypto';

/**
 * UUIDv7 generator — RFC 9562 §5.7.
 *
 * Implemented here rather than pulled from the `uuid` package for two reasons:
 * `uuid@11+` is ESM-only and this service compiles to CommonJS (pinning back to
 * `uuid@10` would mean shipping a four-major-old dependency in a new project),
 * and this removes a supply-chain dependency from the identity core, where
 * primary keys are generated.
 *
 * All entropy comes from `crypto.randomBytes`; the rest is a fixed bit layout:
 *
 *   0                   1                   2                   3
 *   0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |                    unix_ts_ms (48 bits)                       |
 *  +-------------------------------+-------------------------------+
 *  |  ver (4) |      rand_a (12)   | var (2) |   rand_b (62 bits)   |
 *  +-------------------------------+-------------------------------+
 *
 * The leading millisecond timestamp is what makes v7 time-ordered, so inserts
 * append to the clustered index instead of scattering through it the way v4
 * would — while remaining unguessable, which is why B.9 chose UUIDs over
 * sequential ids in the first place.
 */
/** Highest value representable in rand_a's 12 bits. */
const COUNTER_MAX = 0xfff;

/**
 * Seed the counter in the lower half of its range so a single millisecond has
 * ~2048 increments of headroom before it can overflow.
 */
const COUNTER_SEED_MASK = 0x7ff;

let lastTimestamp = -1;
let counter = 0;

export function uuidv7(): string {
  const bytes = randomBytes(16);

  let now = Date.now();

  if (now === lastTimestamp) {
    counter += 1;

    // Exhausted this millisecond's counter space — spin to the next one rather
    // than emit a non-monotonic id.
    if (counter > COUNTER_MAX) {
      while (now === lastTimestamp) now = Date.now();
      lastTimestamp = now;
      counter = bytes.readUInt16BE(6) & COUNTER_SEED_MASK;
    }
  } else {
    lastTimestamp = now;
    // Random seed rather than 0: starting every millisecond at a fixed value
    // would leak how many ids that millisecond produced.
    counter = bytes.readUInt16BE(6) & COUNTER_SEED_MASK;
  }

  // Bytes 0-5: 48-bit big-endian Unix milliseconds. Valid until year 10889.
  bytes.writeUIntBE(now, 0, 6);

  // Bytes 6-7: version (4 bits) = 7, then the 12-bit monotonic counter (rand_a).
  bytes.writeUInt16BE(0x7000 | counter, 6);

  // Byte 8, top two bits: variant = 0b10. Remaining 62 bits stay random.
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8);

  const hex = bytes.toString('hex');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** Extracts the embedded creation timestamp. Used by tests and forensics. */
export function uuidv7Timestamp(uuid: string): Date {
  const hex = uuid.replace(/-/g, '').slice(0, 12);
  return new Date(Number.parseInt(hex, 16));
}
