import { describe, it, expect } from 'vitest';
import { mp3Duration } from '../../../src/modules/invitation-assets/application/mp3';
describe('bounded MP3 inspection', () => {
  it('reads frame duration and rejects MIME-spoofing bytes, truncation and over10min', () => {
    const frame = Buffer.alloc(417);
    frame.writeUInt32BE(0xfffb9000);
    expect(mp3Duration(Buffer.concat([frame, frame, frame]))).toBe(79);
    expect(() =>
      mp3Duration(Buffer.from('<script>not mp3</script>')),
    ).toThrow();
    expect(() =>
      mp3Duration(Buffer.concat([frame, frame, frame]).subarray(0, -1)),
    ).toThrow();
    expect(() =>
      mp3Duration(Buffer.concat(Array.from({ length: 23000 }, () => frame))),
    ).toThrow();
  });
});
