export function isImagePostSearch(search = '') {
  return /(?:^|[?&])createType=8(?:&|$)/.test(search);
}

/** @param {number[]} areas element surface areas in document order */
export function pickBodyMirrorIndex(areas, { imagePost, documentOrder } = {}) {
  if (!areas.length) return -1;
  if (areas.length === 1) return 0;
  if (imagePost) {
    let best = 0;
    for (let i = 1; i < areas.length; i += 1) {
      if (areas[i] > areas[best]) best = i;
    }
    return best;
  }
  const order = documentOrder?.length === areas.length ? documentOrder : areas.map((_, i) => i);
  const sorted = [...order].sort((a, b) => a - b);
  return sorted[1] ?? sorted[0];
}
