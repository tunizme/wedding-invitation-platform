// Local-only: downloads CC0/public-domain images and MP3 audio from Openverse into
// .artifacts/library-seed/ with a provenance manifest. T046 ingests that folder.
// Usage: node apps/api/scripts/library-fetch-open.cjs [--per-category=6] [--audio=12] [--only=slug,slug]
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../../.artifacts/library-seed');
const arg = (name, fallback) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const perCategory = Number(arg('per-category', 6));
const audioCount = Number(arg('audio', 12));
const only = arg('only', '')
  .split(',')
  .filter(Boolean);

// Category taxonomy mirrors the surveyed editor; queries are English because the source index is.
const STOCK = [
  ['yeu-to-dam-cuoi', 'Yếu tố đám cưới', 'wedding ring'],
  ['van-hoa-viet', 'Văn hóa Việt', 'vietnam traditional'],
  ['nhan-vat', 'Nhân vật', 'bride groom illustration'],
  ['hoa-cuoi', 'Hoa cưới', 'bouquet flowers'],
  ['chu-hy', 'Chữ hỷ', 'red chinese paper cut'],
  ['trai-tim', 'Trái tim', 'heart'],
  ['ket-hop-chu', 'Kết hợp chữ', 'calligraphy lettering'],
  ['so-va-chu-cai', 'Số và chữ cái', 'alphabet letters'],
  ['trang-tri-khong-gian', 'Trang trí không gian', 'garland decoration'],
  ['chuc-mung-sinh-nhat', 'Chúc mừng sinh nhật', 'birthday balloon'],
  ['mat-troi', 'Mặt trời', 'sun'],
  ['le-hoi-noi-bat', 'Lễ hội nổi bật', 'festival lantern'],
  ['ngoi-sao', 'Ngôi sao', 'star'],
  ['me-va-be', 'Mẹ và bé', 'mother baby'],
  ['bieu-tuong-luu-do', 'Biểu tượng lưu đồ', 'arrow icon'],
  ['ban-do', 'Bản đồ', 'world map'],
  ['hinh-dang', 'Hình dạng', 'geometric shape'],
  ['khung-vien', 'Khung viền', 'ornamental frame'],
  ['duong-phan-cach', 'Đường phân cách', 'divider ornament'],
];
const BACKGROUNDS = [['nen-hoa-van', 'Nền hoa văn', 'floral pattern texture']];
const AUDIO = [
  ['nhac-ngoai', 'Nhạc ngoại', 'romantic piano'],
  ['v-pop', 'V-POP', 'guitar instrumental'],
];

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

async function api(pathAndQuery) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`https://api.openverse.org/v1/${pathAndQuery}`, {
      headers: { 'User-Agent': 'wedding-platform-dev-seed/1.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 429) {
      await sleep(15000 * (attempt + 1));
      continue;
    }
    if (!response.ok) throw new Error(`Openverse ${response.status} for ${pathAndQuery}`);
    return response.json();
  }
  throw new Error('Openverse rate limit not clearing');
}

async function download(url, file, maxBytes) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'wedding-platform-dev-seed/1.0' },
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error(`download ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > maxBytes) throw new Error('size out of range');
  fs.writeFileSync(file, bytes);
  return bytes.length;
}

function provenance(item, extra) {
  return {
    title: item.title || '',
    creator: item.creator || '',
    license: item.license,
    licenseVersion: item.license_version,
    licenseUrl: item.license_url,
    sourceUrl: item.foreign_landing_url,
    provider: item.provider,
    openverseId: item.id,
    ...extra,
  };
}

async function fetchImages(kind, [key, label, query], manifest) {
  const dir = path.join(root, kind.toLowerCase(), key);
  fs.mkdirSync(dir, { recursive: true });
  const data = await api(
    `images/?q=${encodeURIComponent(query)}&license=cc0,pdm&page_size=${Math.min(20, perCategory * 3)}&mature=false`,
  );
  let kept = 0;
  for (const item of data.results ?? []) {
    if (kept >= perCategory) break;
    // Openverse thumbnails are ~600px JPEG/PNG: small enough for the 10MiB limit, large enough to test.
    const source = item.thumbnail;
    if (!source) continue;
    const name = `${slug(item.title || item.id)}-${item.id.slice(0, 8)}.jpg`;
    try {
      const size = await download(source, path.join(dir, name), 5 * 1024 * 1024);
      manifest.push(
        provenance(item, { kind, category: key, categoryLabel: label, file: `${kind.toLowerCase()}/${key}/${name}`, bytes: size }),
      );
      kept++;
    } catch (error) {
      console.warn(`  skip ${item.id}: ${error.message}`);
    }
  }
  console.log(`${kind} ${key}: ${kept}/${perCategory}`);
}

async function fetchAudio([key, label, query], manifest, count) {
  const dir = path.join(root, 'audio', key);
  fs.mkdirSync(dir, { recursive: true });
  const data = await api(
    `audio/?q=${encodeURIComponent(query)}&license=cc0,pdm&page_size=${Math.min(20, count * 4)}&mature=false`,
  );
  let kept = 0;
  for (const item of data.results ?? []) {
    if (kept >= count) break;
    const duration = item.duration ?? 0;
    // Library limits: MP3 only, 1ms..10min, 20MiB.
    if (item.filetype !== 'mp3' || !item.url || duration < 15000 || duration > 600000) continue;
    const name = `${slug(item.title || item.id)}-${item.id.slice(0, 8)}.mp3`;
    try {
      const size = await download(item.url, path.join(dir, name), 20 * 1024 * 1024);
      manifest.push(
        provenance(item, { kind: 'AUDIO', category: key, categoryLabel: label, durationMs: duration, file: `audio/${key}/${name}`, bytes: size }),
      );
      kept++;
    } catch (error) {
      console.warn(`  skip ${item.id}: ${error.message}`);
    }
  }
  console.log(`AUDIO ${key}: ${kept}/${count}`);
}

(async () => {
  if (process.env.NODE_ENV === 'production') throw new Error('Local development only.');
  fs.mkdirSync(root, { recursive: true });
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : [];
  const have = new Set(manifest.map((m) => m.openverseId));
  const fresh = [];
  const wanted = (key) => only.length === 0 || only.includes(key);
  for (const row of STOCK.filter(([k]) => wanted(k))) {
    await fetchImages('DECORATION', row, fresh);
    await sleep(4000);
  }
  for (const row of BACKGROUNDS.filter(([k]) => wanted(k))) {
    await fetchImages('BACKGROUND', row, fresh);
    await sleep(4000);
  }
  for (const row of AUDIO.filter(([k]) => wanted(k))) {
    await fetchAudio(row, fresh, Math.ceil(audioCount / AUDIO.length));
    await sleep(4000);
  }
  const merged = [...manifest, ...fresh.filter((m) => !have.has(m.openverseId))];
  fs.writeFileSync(manifestPath, JSON.stringify(merged, null, 2));
  console.log(`manifest: ${merged.length} items -> ${manifestPath}`);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
