/**
 * Per-platform circuit breaker — trip after repeated failures; manual resume.
 */

export type BreakerState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private failures = 0;
  private state: BreakerState = 'closed';
  private lastError = '';
  private openedAt = 0;
  private readonly threshold: number;
  private readonly name: string;
  private log: (m: string) => void;

  constructor(name: string, threshold = 5, log?: (m: string) => void) {
    this.name = name;
    this.threshold = threshold;
    this.log = log || ((m) => console.log(`[breaker:${name}] ${m}`));
  }

  getState(): BreakerState {
    return this.state;
  }

  getLastError(): string {
    return this.lastError;
  }

  allow(): boolean {
    return this.state !== 'open';
  }

  recordSuccess(): void {
    this.failures = 0;
    if (this.state !== 'closed') {
      this.state = 'closed';
      this.log('closed (healthy)');
    }
  }

  recordFailure(err: string): void {
    this.failures += 1;
    this.lastError = err;
    if (this.failures >= this.threshold && this.state !== 'open') {
      this.state = 'open';
      this.openedAt = Date.now();
      this.log(`OPEN after ${this.failures} failures: ${err}`);
    }
  }

  /** Operator resume */
  resume(): void {
    this.failures = 0;
    this.state = 'closed';
    this.log('manually resumed');
  }

  pause(): void {
    this.state = 'open';
    this.openedAt = Date.now();
    this.log('manually paused');
  }

  statusLine(): string {
    return `${this.name}: ${this.state}` +
      (this.lastError ? ` (last: ${this.lastError.slice(0, 60)})` : '') +
      (this.openedAt ? ` since ${new Date(this.openedAt).toISOString()}` : '');
  }
}
