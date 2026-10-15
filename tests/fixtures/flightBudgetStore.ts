import { BudgetConflict, type BudgetRead, type FlightBudgetStore } from '../../server/providers/flightBudgetStore';

// Independent clients share only this remote object, never a quota instance.
export class TestBudgetStore implements FlightBudgetStore {
  contents: string | null = null;
  generation = 0;
  async read(): Promise<BudgetRead | null> {
    return this.contents === null ? null : { contents: this.contents, generation: String(this.generation) };
  }
  async compareAndSwap(contents: string, generation?: string): Promise<void> {
    if (generation !== (this.contents === null ? undefined : String(this.generation))) throw new BudgetConflict();
    this.contents = contents;
    this.generation++;
  }
}
