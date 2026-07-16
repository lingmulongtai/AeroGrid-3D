export interface QuotaState {
  day: string;
  count: number;
  limit: number;
}

export class DailyQuota {
  private day = '';
  private count = 0;

  constructor(private readonly limit: number) {}

  tryTake(nowMs = Date.now()): boolean {
    this.rollDay(nowMs);
    if (this.count >= this.limit) return false;
    this.count += 1;
    return true;
  }

  getState(nowMs = Date.now()): QuotaState {
    this.rollDay(nowMs);
    return { day: this.day, count: this.count, limit: this.limit };
  }

  private rollDay(nowMs: number): void {
    const nextDay = new Date(nowMs).toISOString().slice(0, 10);
    if (nextDay === this.day) return;
    this.day = nextDay;
    this.count = 0;
  }
}
