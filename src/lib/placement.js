// 把导入按钮放在「创作」左侧，并避开同一行已有按钮。
// 展开后面板落到这一行按钮下方，避免盖住「创作」或草稿箱入口。

export const PANEL_GAP = 12;
export const COLLAPSED_WIDTH = 188;
export const EXPANDED_MAX_WIDTH = 380;
export const EXPANDED_MAX_HEIGHT = 640;
export const LOG_PANEL_MIN_HEIGHT = 480;
export const LOG_PANEL_MAX_HEIGHT = 720;

export function placePanel({ mode, viewport, anchor, obstacles = [] }) {
  const logMode = mode === 'log';
  const expanded = mode === 'expanded' || logMode;
  const width = expanded ? Math.min(EXPANDED_MAX_WIDTH, viewport.width - 48) : COLLAPSED_WIDTH;
  const height = expanded ? (logMode ? LOG_PANEL_MAX_HEIGHT : EXPANDED_MAX_HEIGHT) : collapsedHeight(anchor);

  if (anchor) {
    const beside = placeBesideAnchor({ viewport, anchor, obstacles, width, height, expanded, logMode });
    return clampBox(viewport, beside, anchor);
  }

  const cluster = topRightCluster(viewport, obstacles);
  if (cluster) {
    const top = expanded ? cluster.top : cluster.top + (cluster.height - height) / 2;
    const beside = slideLeft({
      viewport,
      obstacles,
      top,
      right: viewport.width - cluster.left + PANEL_GAP,
      width,
      height,
    });
    if (beside) return clampBox(viewport, beside, null);
  }

  return clampBox(
    viewport,
    {
      top: Math.max(24, viewport.height - height - 24),
      right: 24,
      width,
      height,
    },
    null,
  );
}

export function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function placeBesideAnchor({ viewport, anchor, obstacles, width, height, expanded, logMode = false }) {
  const mates = obstacles.filter((item) => item.bottom > anchor.top - 4 && item.top < anchor.bottom + 4);
  const rowBottom = Math.max(anchor.bottom, ...mates.map((item) => item.bottom));
  if (expanded) {
    const top = rowBottom + PANEL_GAP;
    const available = viewport.height - top - 16;
    const minHeight = logMode ? LOG_PANEL_MIN_HEIGHT : 160;
    const target = logMode ? Math.min(LOG_PANEL_MAX_HEIGHT, Math.max(LOG_PANEL_MIN_HEIGHT, available)) : height;
    return {
      top,
      right: viewport.width - anchor.left + PANEL_GAP,
      width,
      height: Math.min(target, Math.max(minHeight, available)),
    };
  }

  const onRow = slideLeft({
    viewport,
    obstacles,
    top: anchor.top + (anchor.height - height) / 2,
    right: viewport.width - anchor.left + PANEL_GAP,
    width,
    height,
  });
  if (onRow) return onRow;

  const below = slideLeft({
    viewport,
    obstacles,
    top: rowBottom + PANEL_GAP,
    right: viewport.width - anchor.left + PANEL_GAP,
    width,
    height,
  });
  if (below) return below;

  return {
    top: rowBottom + PANEL_GAP,
    right: Math.max(PANEL_GAP, viewport.width - anchor.right),
    width,
    height,
  };
}

function slideLeft({ viewport, obstacles, top, right, width, height }) {
  let nextRight = right;
  for (let step = 0; step < 16; step += 1) {
    const box = boxFromRight(viewport.width, { top, right: nextRight, width, height });
    if (box.left < 8) return null;
    const hit = obstacles.find((item) => rectsOverlap(box, item));
    if (!hit) return { top, right: nextRight, width, height };
    const shifted = viewport.width - hit.left + PANEL_GAP;
    if (shifted <= nextRight + 0.5) return null;
    nextRight = shifted;
  }
  return null;
}

function topRightCluster(viewport, obstacles) {
  const band = obstacles.filter(
    (item) => item.top >= 0 && item.top < 160 && item.left > viewport.width * 0.45 && item.width <= 240 && item.height <= 80,
  );
  if (!band.length) return null;
  const top = Math.min(...band.map((item) => item.top));
  const bottom = Math.max(...band.map((item) => item.bottom));
  return {
    left: Math.min(...band.map((item) => item.left)),
    top,
    height: bottom - top,
  };
}

function collapsedHeight(anchor) {
  if (!anchor) return 36;
  return Math.round(Math.max(36, Math.min(anchor.height, 48)));
}

function clampBox(viewport, box, anchor) {
  let { top, right, width, height } = box;
  if (top < 8) top = 8;
  if (top + height > viewport.height - 8) {
    const fitted = viewport.height - top - 8;
    if (fitted >= 120) height = fitted;
    else top = Math.max(8, viewport.height - height - 8);
  }
  let left = viewport.width - right - width;
  if (left < 8) {
    const fitted = viewport.width - right - 8;
    if (fitted >= 148) width = fitted;
    else right = Math.max(8, viewport.width - width - 8);
    left = viewport.width - right - width;
  }
  if (anchor && rectsOverlap(boxFromRight(viewport.width, { top, right, width, height }), anchor)) {
    top = anchor.bottom + PANEL_GAP;
  }
  return { top, right, width, height };
}

function boxFromRight(viewportWidth, { top, right, width, height }) {
  const edge = viewportWidth - right;
  return { top, left: edge - width, right: edge, bottom: top + height, width, height };
}
