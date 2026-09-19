/** Stateful linear resampler for signed 16-bit little-endian mono PCM. */
export class Pcm16Resampler {
  private previous: number | undefined;
  private inputPosition = 0;
  private nextOutputPosition = 0;
  private readonly step: number;

  constructor(inputRate: number, outputRate: number) {
    this.step = inputRate / outputRate;
  }

  reset(): void {
    this.previous = undefined;
    this.inputPosition = 0;
    this.nextOutputPosition = 0;
  }

  process(input: Buffer): Buffer {
    const sampleCount = Math.floor(input.byteLength / 2);
    if (sampleCount === 0) return Buffer.alloc(0);

    const output: number[] = [];
    for (let i = 0; i < sampleCount; i += 1) {
      const current = input.readInt16LE(i * 2);
      if (this.previous === undefined) {
        this.previous = current;
        output.push(current);
        this.nextOutputPosition = this.step;
        continue;
      }

      this.inputPosition += 1;
      while (this.nextOutputPosition <= this.inputPosition) {
        const fraction = this.nextOutputPosition - (this.inputPosition - 1);
        output.push(Math.round(this.previous + (current - this.previous) * fraction));
        this.nextOutputPosition += this.step;
      }
      this.previous = current;
    }

    const result = Buffer.allocUnsafe(output.length * 2);
    output.forEach((sample, index) => result.writeInt16LE(sample, index * 2));
    return result;
  }
}
