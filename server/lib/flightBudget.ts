import { randomUUID } from 'node:crypto';
import { LIVE_FLIGHT_REFRESH_MS } from '../../shared/contracts.js';
import { BudgetConflict, type FlightBudgetStore } from '../providers/flightBudgetStore.js';
import { DailyQuota, type QuotaState } from './quota.js';

export interface FlightAdmission {
  allowed: boolean;
  reservation?: string;
}
export interface FlightBudget {
  reserve(nowMs: number): Promise<FlightAdmission>;
  complete(reservation: string, nowMs: number, blockedUntil?: number): Promise<void>;
  getState(nowMs: number): QuotaState;
  nextAllowedAt(nowMs: number): number;
  blockedUntil(): number;
}

// Local development/tests retain the existing quota semantics. Production is
// explicitly wired to PersistentFlightBudget at the runtime entry point.
export class LocalFlightBudget implements FlightBudget {
  private blocked = 0;
  constructor(private readonly quota = new DailyQuota(450)) {}
  async reserve(nowMs: number): Promise<FlightAdmission> {
    const allowed = nowMs >= this.blocked && this.quota.tryTake(nowMs, LIVE_FLIGHT_REFRESH_MS);
    return { allowed, ...(allowed ? { reservation: randomUUID() } : {}) };
  }
  async complete(_reservation: string, nowMs: number, blockedUntil = 0) {
    this.blocked = Math.max(this.blocked, blockedUntil);
    this.quota.getState(nowMs);
  }
  getState(nowMs: number) { return this.quota.getState(nowMs); }
  nextAllowedAt(nowMs: number) { return Math.max(this.quota.nextAllowedAt(nowMs), this.blocked); }
  blockedUntil() { return this.blocked; }
}

interface Ledger {
  version: 1;
  day: string;
  count: number;
  nextRequestAt: number;
  blockedUntil: number;
  pending: string | null;
}
const LIMIT = 450;
const MAX_CONFLICTS = 8;
const RETRY_MS = 60_000;
function dayOf(time: number) { return new Date(time).toISOString().slice(0, 10); }
function nextDay(day: string) { return Date.parse(`${day}T00:00:00Z`) + 86_400_000; }
function parseLedger(contents: string): Ledger {
  const value = JSON.parse(contents);
  if (!value || value.version !== 1 || typeof value.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.day)
    || !Number.isFinite(Date.parse(value.day)) || dayOf(Date.parse(value.day)) !== value.day
    || !Number.isInteger(value.count) || value.count < 0 || value.count > LIMIT
    || !Number.isSafeInteger(value.nextRequestAt) || value.nextRequestAt < 0
    || !Number.isSafeInteger(value.blockedUntil) || value.blockedUntil < 0
    || !(value.pending === null || typeof value.pending === 'string' && /^[a-f0-9-]{36}$/.test(value.pending))) {
    throw new Error('Invalid aircraft budget ledger');
  }
  return value;
}
function rollDay(ledger: Ledger, nowMs: number): Ledger {
  const day = dayOf(nowMs);
  // Never roll backwards; a pending attempt and 429 cooldown survive midnight.
  return day > ledger.day ? { ...ledger, day, count: 0, nextRequestAt: 0 } : { ...ledger };
}

export class PersistentFlightBudget implements FlightBudget {
  private observed?: Ledger;
  private failedUntil = 0;
  constructor(private readonly store: FlightBudgetStore, private readonly bootstrapExhausted = true) {}

  async reserve(nowMs: number): Promise<FlightAdmission> {
    return this.update(nowMs, (ledger) => {
      if (ledger.pending || nowMs < ledger.blockedUntil || ledger.count >= LIMIT || nowMs < ledger.nextRequestAt
        || dayOf(nowMs) < ledger.day) return { allowed: false };
      ledger.count++;
      ledger.nextRequestAt = nowMs + LIVE_FLIGHT_REFRESH_MS;
      ledger.pending = randomUUID();
      return { allowed: true, reservation: ledger.pending };
    });
  }

  async complete(reservation: string, nowMs: number, blockedUntil = 0): Promise<void> {
    await this.update(nowMs, (ledger) => {
      // An obsolete completion must never clear another attempt's latch.
      if (ledger.pending !== reservation) throw new Error('Aircraft budget reservation mismatch');
      ledger.blockedUntil = Math.max(ledger.blockedUntil, blockedUntil);
      ledger.pending = null;
    });
  }

  private async update<T>(nowMs: number, change: (ledger: Ledger) => T): Promise<T> {
    try {
      for (let attempt = 0; attempt < MAX_CONFLICTS; attempt++) {
        try {
          const stored = await this.store.read();
          // Memory counters from before migration cannot be reconstructed.
          // Missing/deleted ledgers conservatively close the current UTC day.
          const initial: Ledger = { version: 1, day: dayOf(nowMs), count: this.bootstrapExhausted ? LIMIT : 0, nextRequestAt: 0, blockedUntil: 0, pending: null };
          const before = stored ? parseLedger(stored.contents) : initial;
          const ledger = rollDay(before, nowMs);
          const result = change(ledger);
          if (!stored || JSON.stringify(ledger) !== stored.contents) {
            await this.store.compareAndSwap(JSON.stringify(ledger), stored?.generation);
          }
          this.observed = ledger;
          this.failedUntil = 0;
          return result;
        } catch (error) {
          if (!(error instanceof BudgetConflict)) throw error;
          // Only definitive CAS conflicts may be retried. Each retry rereads.
        }
      }
      throw new Error('Aircraft budget is busy');
    } catch {
      this.failedUntil = Math.max(this.failedUntil, nowMs + RETRY_MS);
      throw new Error('Shared aircraft budget unavailable; upstream requests paused');
    }
  }
  getState(nowMs: number): QuotaState {
    const ledger = this.observed;
    // Observability only: never locally reset a persisted budget without CAS.
    return { day: ledger?.day ?? dayOf(nowMs), count: ledger?.count ?? 0, limit: LIMIT };
  }
  nextAllowedAt(nowMs: number): number {
    const ledger = this.observed;
    return Math.max(nowMs, this.failedUntil, ledger?.blockedUntil ?? 0,
      ledger?.pending ? nowMs + RETRY_MS : 0,
      ledger && ledger.count >= LIMIT ? nextDay(ledger.day) : ledger?.nextRequestAt ?? 0,
      ledger && dayOf(nowMs) < ledger.day ? Date.parse(ledger.day) : 0);
  }
  blockedUntil() { return this.observed?.blockedUntil ?? 0; }
}
