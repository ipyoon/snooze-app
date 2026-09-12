/** Local visual similarity, not semantic object recognition or liveness detection. */
export type Fingerprint = { gray: number[]; color: number[]; edges: number[]; contrast: number; mean: number };
export type ReferencePhoto = { uri: string; fingerprint: Fingerprint; createdAt: number };
export function fingerprint(data: ArrayLike<number>, width: number, height: number): Fingerprint {
  const size = 16;
  const gray = Array(256).fill(0), color = Array(48).fill(0), counts = Array(256).fill(0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const cell = Math.min(15, Math.floor(y * size / height)) * size + Math.min(15, Math.floor(x * size / width));
    const r = data[i], g = data[i + 1], b = data[i + 2];
    gray[cell] += (r * .299 + g * .587 + b * .114) / 255; counts[cell]++;
    color[Math.floor(r / 16)]++; color[16 + Math.floor(g / 16)]++; color[32 + Math.floor(b / 16)]++;
  }
  for (let i = 0; i < gray.length; i++) gray[i] /= Math.max(1, counts[i]);
  for (let i = 0; i < color.length; i++) color[i] /= width * height * 3;
  // Smooth adjacent intensity bins so a small exposure change does not erase overlap.
  const smoothColor = Array(48).fill(0);
  for (let channel = 0; channel < 3; channel++) for (let bin = 0; bin < 16; bin++) {
    for (const [delta, weight] of [[-1,.25],[0,.5],[1,.25]]) {
      smoothColor[channel*16 + Math.max(0, Math.min(15,bin+delta))] += color[channel*16+bin]*weight;
    }
  }
  const mean = gray.reduce((a, b) => a + b, 0) / gray.length;
  const contrast = Math.sqrt(gray.reduce((a, b) => a + (b - mean) ** 2, 0) / gray.length);
  const normalized = gray.map(x => (x - mean) / Math.max(.03, contrast));
  const edges: number[] = [];
  for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
    const i = y * 16 + x;
    edges.push(Math.hypot(normalized[i + 1] - normalized[i], normalized[i + 16] - normalized[i]));
  }
  return { gray: normalized, color: smoothColor, edges, contrast, mean };
}
function cosine(a: number[], b: number[]) {
  const dot = a.reduce((sum, x, i) => sum + x * b[i], 0);
  return dot / Math.max(1e-9, Math.sqrt(a.reduce((s, x) => s + x*x, 0) * b.reduce((s, x) => s + x*x, 0)));
}
export function photoQuality(photo: Fingerprint): boolean {
  return photo.contrast >= .065 && photo.mean > .08 && photo.mean < .94;
}
export type MatchLevel = 'relaxed' | 'balanced' | 'strict';
export function comparePhotos(reference: Fingerprint, candidate: Fingerprint, level: MatchLevel = 'relaxed') {
  const structure = Math.max(0, cosine(reference.gray, candidate.gray));
  const edges = Math.max(0, cosine(reference.edges, candidate.edges));
  const color = reference.color.reduce((sum, v, i) => sum + Math.min(v, candidate.color[i]), 0);
  const score = .55 * structure + .25 * edges + .2 * color;
  // Conservative prototype thresholds; deliberately fail closed for blank/dark images.
  const thresholds = { relaxed: [.45, .4, .60], balanced: [.6, .55, .7], strict: [.76, .7, .8] }[level];
  return { score, match: photoQuality(reference) && photoQuality(candidate) && structure >= thresholds[0] && edges >= thresholds[1] && score >= thresholds[2] };
}
