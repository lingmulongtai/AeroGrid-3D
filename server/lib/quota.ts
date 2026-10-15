export interface QuotaState {
  day: string;
  count: number;
  limit: number;
}

export class DailyQuota {
  private day = '';
  private count = 0;
  private nextRequestAt = 0;

  constructor(private readonly limit: number) {}

  // Opt-in pacing lives on the shared quota, including across provider sessions.
  tryTake(nowMs = Date.now(), minimumIntervalMs = 0): boolean {
    this.rollDay(nowMs);
    if (this.count >= this.limit || nowMs < this.nextRequestAt) return false;
    this.count += 1;
    this.nextRequestAt = nowMs + minimumIntervalMs;
    return true;
  }

  nextAllowedAt(nowMs = Date.now()): number {
    this.rollDay(nowMs);
    if (this.count < this.limit) return Math.max(nowMs, this.nextRequestAt);
    const date = new Date(this.day);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  }

  getState(nowMs = Date.now()): QuotaState {
    this.rollDay(nowMs);
    return { day: this.day, count: this.count, limit: this.limit };
  }

  private rollDay(nowMs: number): void {
    const nextDay = new Date(nowMs).toISOString().slice(0, 10);
    // Late async completions and clock corrections cannot reopen an older day.
    if (nextDay <= this.day) return;
    this.day = nextDay;
    this.count = 0;
    this.nextRequestAt = 0;
  }
}
