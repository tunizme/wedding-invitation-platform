/** Bounded frame parser: reject spoofed MIME, free bitrate, corrupt frames and oversized ID3. */
export function mp3Duration(bytes: Buffer): number {
  if (!bytes.length || bytes.length > 20 * 1024 * 1024)
    throw new Error('Invalid MP3');
  let position = 0;
  if (bytes.subarray(0, 3).toString() === 'ID3') {
    if (
      bytes.length < 10 ||
      bytes[3] < 2 ||
      bytes[3] > 4 ||
      bytes.subarray(6, 10).some((v) => v > 127)
    )
      throw new Error('Invalid ID3');
    position =
      10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]);
    if (bytes[3] === 4 && bytes[5] & 16) position += 10;
    if (position > bytes.length) throw new Error('Invalid ID3');
  }
  let duration = 0,
    frames = 0;
  while (position + 4 <= bytes.length) {
    if (
      bytes.length - position === 128 &&
      bytes.subarray(position, position + 3).toString() === 'TAG'
    ) {
      position = bytes.length;
      break;
    }
    const header = bytes.readUInt32BE(position),
      version = (header >>> 19) & 3,
      layer = (header >>> 17) & 3,
      rateIndex = (header >>> 12) & 15,
      sampleIndex = (header >>> 10) & 3;
    if (
      header >>> 21 !== 2047 ||
      version === 1 ||
      layer !== 1 ||
      rateIndex === 0 ||
      rateIndex === 15 ||
      sampleIndex === 3
    )
      throw new Error('Invalid MPEG frame');
    const bitrate = (
      version === 3
        ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
        : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
    )[rateIndex];
    const sample =
      [44100, 48000, 32000][sampleIndex] /
      (version === 3 ? 1 : version === 2 ? 2 : 4);
    const length =
      Math.floor(((version === 3 ? 144000 : 72000) * bitrate) / sample) +
      ((header >>> 9) & 1);
    if (position + length > bytes.length || length < 4)
      throw new Error('Truncated MPEG frame');
    duration += (version === 3 ? 1152 : 576) / sample;
    frames++;
    position += length;
    if (duration > 600) throw new Error('MP3 exceeds10min');
  }
  if (frames < 3 || position !== bytes.length)
    throw new Error('Invalid MP3 stream');
  return Math.ceil(duration * 1000);
}
