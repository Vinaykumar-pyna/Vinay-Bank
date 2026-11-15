import { Iso8583Error } from './codec';

/** Upper bound for one message; anything larger is treated as a protocol error. */
export const MAX_FRAME_BYTES = 8 * 1024;

/** Prefixes a message with its length as a 2-byte big-endian header (the usual ISO 8583 TCP framing). */
export function frame(payload: Buffer): Buffer {
  if (payload.length === 0 || payload.length > MAX_FRAME_BYTES) {
    throw new Iso8583Error(`Cannot frame a message of ${payload.length} bytes`);
  }
  const header = Buffer.alloc(2);
  header.writeUInt16BE(payload.length);
  return Buffer.concat([header, payload]);
}

/**
 * Reassembles length-prefixed messages from a TCP byte stream. TCP has no
 * message boundaries: one read may hold half a message or several messages,
 * so bytes are buffered until a whole frame is available.
 */
export class FrameDecoder {
  private buffer: Buffer = Buffer.alloc(0);

  constructor(private readonly maxFrameBytes = MAX_FRAME_BYTES) {}

  /** Adds received bytes; returns every message that is now complete. */
  push(chunk: Buffer): Buffer[] {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const frames: Buffer[] = [];
    while (this.buffer.length >= 2) {
      const length = this.buffer.readUInt16BE(0);
      if (length === 0 || length > this.maxFrameBytes) {
        throw new Iso8583Error(`Invalid frame length ${length}`);
      }
      if (this.buffer.length < 2 + length) break;
      frames.push(Buffer.from(this.buffer.subarray(2, 2 + length)));
      this.buffer = this.buffer.subarray(2 + length);
    }
    return frames;
  }

  get pendingBytes(): number {
    return this.buffer.length;
  }
}
