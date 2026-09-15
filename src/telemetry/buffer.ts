/** Fixed-capacity FIFO; push is O(1), chronological snapshots are O(retained samples). */
export class RingBuffer<T> {
  readonly capacity: number;
  private values: Array<T | undefined>;
  private head = 0;
  private length = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1)
      throw new RangeError('Buffer capacity must be a positive integer.');
    this.capacity = capacity;
    this.values = new Array<T | undefined>(capacity);
  }

  get size(): number {
    return this.length;
  }

  push(value: T): void {
    this.values[(this.head + this.length) % this.capacity] = value;
    if (this.length === this.capacity) this.head = (this.head + 1) % this.capacity;
    else this.length += 1;
  }

  toArray(): T[] {
    return Array.from(
      { length: this.length },
      (_, index) => this.values[(this.head + index) % this.capacity] as T,
    );
  }

  clear(): void {
    this.values = new Array<T | undefined>(this.capacity);
    this.head = 0;
    this.length = 0;
  }
}
