const scatterPadding = 60;

interface Glyph {
  char: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  angle: number;
}

interface GlyphLayer {
  color: string;
  font: string;
  glyphs: Glyph[];
}

function glyph(char: string, x: number, y: number, seed: number): Glyph {
  const direction = seed * 2.399963;
  const distance = 18 + (seed * 17 % 39);
  return {
    char,
    x,
    y,
    dx: Math.cos(direction) * distance,
    dy: Math.sin(direction) * distance,
    angle: Math.sin(seed * 13.7),
  };
}

export function createClockFragmentPainter(
  canvas: HTMLCanvasElement,
  layers: readonly (HTMLPreElement | null)[],
  numerals: HTMLDivElement,
) {
  const face = layers[0];
  const size = face?.clientWidth;
  const context = canvas.getContext("2d");
  if (!face || !size || !context) return null;

  const extent = size + scatterPadding * 2;
  const resolution = Math.min(window.devicePixelRatio || 1, 2);
  const pixels = Math.round(extent * resolution);
  canvas.width = pixels;
  canvas.height = pixels;
  context.textAlign = "center";
  context.textBaseline = "middle";

  const scene: GlyphLayer[] = [];
  const captureLayer = (element: HTMLElement) => {
    const style = getComputedStyle(element);
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const layer: GlyphLayer = { color: style.color, font, glyphs: [] };
    context.font = font;
    scene.push(layer);
    return { layer, style, spacing: context.measureText("M").width };
  };

  layers.forEach((element, index) => {
    if (!element?.textContent) return;
    const { layer, style, spacing } = captureLayer(element);
    const lineHeight = parseFloat(style.lineHeight);
    for (const [row, line] of element.textContent.split("\n").entries()) {
      const left = (size - spacing * line.length) / 2;
      for (const [column, char] of Array.from(line).entries()) {
        if (char !== " ") {
          layer.glyphs.push(glyph(char, left + (column + .5) * spacing, (row + .5) * lineHeight, index * 2797 + row * 73 + column));
        }
      }
    }
  });

  const { layer, spacing } = captureLayer(numerals);
  for (const [index, number] of Array.from(numerals.children).entries()) {
    if (!(number instanceof HTMLElement)) continue;
    const text = number.textContent ?? "";
    for (const [column, char] of Array.from(text).entries()) {
      const x = number.offsetLeft + (column + .5 - text.length / 2) * spacing;
      layer.glyphs.push(glyph(char, x, number.offsetTop, 19001 + index * 3 + column));
    }
  }

  return (spread: number) => {
    const bounds = face.getBoundingClientRect();
    const scale = bounds.width / size;
    if (scale <= 0) return;
    const viewport = document.documentElement.clientWidth;
    const left = Math.min(scatterPadding, Math.max(0, Math.floor(bounds.left / scale)));
    const right = Math.min(scatterPadding, Math.max(0, Math.floor((viewport - bounds.right) / scale)));
    const width = size + left + right;
    const cssLeft = `${-left}px`;
    const cssWidth = `${width}px`;
    if (canvas.style.left !== cssLeft) canvas.style.left = cssLeft;
    if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;

    // Keep the backing canvas fixed even when we crop at the viewport edges.
    const sx = pixels / width;
    const sy = pixels / extent;
    context.resetTransform();
    context.clearRect(0, 0, pixels, pixels);

    for (const { color, font, glyphs } of scene) {
      context.fillStyle = color;
      context.font = font;
      for (const { char, x, y, dx, dy, angle } of glyphs) {
        const cosine = Math.cos(angle * spread);
        const sine = Math.sin(angle * spread);
        context.setTransform(
          sx * cosine, sy * sine, -sx * sine, sy * cosine,
          sx * (left + x + dx * spread), sy * (scatterPadding + y + dy * spread),
        );
        context.fillText(char, 0, 0);
      }
    }
  };
}
