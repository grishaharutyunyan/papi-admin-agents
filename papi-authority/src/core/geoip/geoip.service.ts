import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import { open } from 'maxmind';

import { auditConfig } from '$/configs/index.configs';

import type { AsnResponse, CityResponse, Reader } from 'maxmind';

export interface GeoLocation {
  country: string | null;
  city: string | null;
  asn: string | null;
}

const EMPTY: GeoLocation = { country: null, city: null, asn: null };

/**
 * Geo-IP enrichment for the audit trail, from LOCAL MaxMind databases
 * (dossier 0.53).
 *
 * Two properties matter more than the enrichment itself:
 *
 *  1. **No network call.** The `.mmdb` is memory-mapped and queried in-process,
 *     so a lookup costs microseconds and nothing leaves the host. A remote
 *     provider would place a third-party dependency on the authentication path
 *     and disclose every administrator IP — including failed-login IPs — which
 *     is the data the trail exists to protect.
 *
 *  2. **It can never fail an authentication.** Every lookup is wrapped: a
 *     missing file, an unparseable database or a malformed address yields
 *     nulls, never an exception. An unaudited login is bad; a login REFUSED
 *     because a city database was corrupt would be absurd.
 */
@Injectable()
export class GeoIpService implements OnModuleInit {
  private cityReader: Reader<CityResponse> | null = null;
  private asnReader: Reader<AsnResponse> | null = null;

  constructor(@Inject(auditConfig.KEY) private readonly config: ConfigType<typeof auditConfig>) {}

  /**
   * Databases are opened ONCE at boot, not per lookup.
   *
   * A failure here is logged by absence, not by throwing: the service must
   * still start if the ops team has not yet placed the files. Enrichment then
   * degrades to nulls, which is exactly what `GEOIP_ENABLED=0` produces.
   */
  async onModuleInit(): Promise<void> {
    if (!this.config.geoIpEnabled) return;

    if (this.config.geoIpCityDb) {
      this.cityReader = await openQuietly<CityResponse>(this.config.geoIpCityDb);
    }
    if (this.config.geoIpAsnDb) {
      this.asnReader = await openQuietly<AsnResponse>(this.config.geoIpAsnDb);
    }
  }

  /** Whether enrichment is actually live — config on AND a database loaded. */
  get isActive(): boolean {
    return this.cityReader !== null || this.asnReader !== null;
  }

  lookup(ip: string | null): GeoLocation {
    if (!ip || !this.isActive) return EMPTY;

    // A proxied request can carry a port or an IPv4-mapped IPv6 form; the
    // reader wants a bare address and throws on anything else.
    const address = normalize(ip);
    if (!address) return EMPTY;

    return {
      country: this.city(address),
      city: this.cityName(address),
      asn: this.asn(address),
    };
  }

  private city(address: string): string | null {
    const record = safeGet(this.cityReader, address);
    return record?.country?.iso_code ?? null;
  }

  private cityName(address: string): string | null {
    const record = safeGet(this.cityReader, address);
    return record?.city?.names?.en ?? null;
  }

  private asn(address: string): string | null {
    const record = safeGet(this.asnReader, address);
    if (!record?.autonomous_system_number) return null;

    const organization = record.autonomous_system_organization;
    return organization
      ? `AS${record.autonomous_system_number} ${organization}`.slice(0, 64)
      : `AS${record.autonomous_system_number}`;
  }
}

async function openQuietly<T extends CityResponse | AsnResponse>(
  path: string,
): Promise<Reader<T> | null> {
  try {
    return await open<T>(path);
  } catch {
    // Swallowed deliberately: a missing or unreadable geo database must not
    // stop the service from booting. `isActive` reports the real state.
    return null;
  }
}

function safeGet<T extends CityResponse | AsnResponse>(
  reader: Reader<T> | null,
  address: string,
): T | null {
  if (!reader) return null;

  try {
    return reader.get(address);
  } catch {
    return null;
  }
}

/**
 * Reduces what Express may hand us to a bare address.
 *
 * `::ffff:203.0.113.5` is how an IPv4 client appears on a dual-stack socket,
 * and MaxMind will not resolve it in that form — without this, every IPv4
 * login on a dual-stack host would silently enrich to nulls.
 */
function normalize(ip: string): string | null {
  const trimmed = ip.trim();
  if (!trimmed) return null;

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
  if (mapped?.[1]) return mapped[1];

  // Strip a trailing port from `1.2.3.4:5678` (never from bare IPv6, which
  // contains colons of its own).
  const withPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(trimmed);
  if (withPort?.[1]) return withPort[1];

  return trimmed;
}
