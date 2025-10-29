import {
  CanvasRenderingContext2D,
  createCanvas,
  loadImage,
  registerFont,
} from "canvas";
import path from "path";

import type { WelcomeCardConfig } from "../../config";

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 576;
const AVATAR_RADIUS = 96;
const AVATAR_BASE_CENTER_X = CANVAS_WIDTH / 2;
const AVATAR_BASE_CENTER_Y = CANVAS_HEIGHT / 2;
const BODY_MAX_WIDTH = 760;

const DEFAULT_AVATAR_OFFSET_Y = -AVATAR_RADIUS;
const DEFAULT_TITLE_OFFSET_Y = 20;
const DEFAULT_SUBTITLE_OFFSET_Y = 50;
const DEFAULT_BODY_OFFSET_Y = 50;
const DEFAULT_TITLE_FONT_SIZE = 64;
const DEFAULT_SUBTITLE_FONT_SIZE = 44;
const DEFAULT_BODY_FONT_SIZE = 28;
const MIN_FONT_SIZE = 12;

const resolveNumber = (value: number | null | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const fontRegistry = new Map<string, string>();
const DEFAULT_FONT_STACK =
  '"Noto Sans JP","Hiragino Sans","Yu Gothic","Meiryo",sans-serif';

const resolveAssetPath = (
  assetPath: string,
  basePath?: string
): string => {
  if (/^data:/i.test(assetPath)) {
    return assetPath;
  }

  if (/^https?:\/\//i.test(assetPath)) {
    return assetPath;
  }

  const normalized = assetPath.replace(/^["']|["']$/g, "");

  if (path.isAbsolute(normalized)) {
    return normalized;
  }

  const root = basePath ? path.resolve(basePath) : process.cwd();
  return path.resolve(root, normalized);
};

const ensureFontRegistered = (
  fontPath: string | undefined,
  basePath?: string
): string | null => {
  if (!fontPath) {
    return null;
  }

  if (/^data:/i.test(fontPath)) {
    return null;
  }

  const resolvedPath = resolveAssetPath(fontPath, basePath);

  let family = fontRegistry.get(resolvedPath);
  if (family) {
    return family;
  }

  family = `welcome-card-font-${fontRegistry.size + 1}`;
  registerFont(resolvedPath, { family });
  fontRegistry.set(resolvedPath, family);
  return family;
};

const resolveFontFamily = (
  cardConfig: WelcomeCardConfig,
  assetsBasePath?: string
) => {
  const preferred = cardConfig.font_family?.trim();
  const registered = ensureFontRegistered(
    cardConfig.font_path,
    assetsBasePath
  );

  if (preferred && preferred.length > 0) {
    return normalizeFontFamily(preferred);
  }

  if (registered) {
    return normalizeFontFamily(`"${registered}"`);
  }

  return DEFAULT_FONT_STACK;
};

const normalizeFontFamily = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_FONT_STACK;
  }

  if (trimmed.includes(",")) {
    return trimmed;
  }

  if (/^["'].*["']$/.test(trimmed)) {
    return `${trimmed}, sans-serif`;
  }

  if (/\s/.test(trimmed)) {
    return `"${trimmed}", sans-serif`;
  }

  return `${trimmed}, sans-serif`;
};

const drawCoverImage = async (
  ctx: CanvasRenderingContext2D,
  imagePath: string,
  basePath?: string
) => {
  const resolvedPath = resolveAssetPath(imagePath, basePath);
  const image = await loadImage(resolvedPath);

  const scale = Math.max(
    CANVAS_WIDTH / image.width,
    CANVAS_HEIGHT / image.height
  );

  const width = image.width * scale;
  const height = image.height * scale;
  const x = (CANVAS_WIDTH - width) / 2;
  const y = (CANVAS_HEIGHT - height) / 2;

  ctx.drawImage(image, x, y, width, height);
};

const drawAvatar = async (
  ctx: CanvasRenderingContext2D,
  avatarUrl: string,
  centerX: number,
  centerY: number,
  borderColor?: string | null
) => {
  try {
    const image = await loadImage(avatarUrl);
    const top = centerY - AVATAR_RADIUS;

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, AVATAR_RADIUS, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(
      image,
      centerX - AVATAR_RADIUS,
      top,
      AVATAR_RADIUS * 2,
      AVATAR_RADIUS * 2
    );
    ctx.restore();

    if (borderColor) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, AVATAR_RADIUS, 0, Math.PI * 2);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 6;
      ctx.stroke();
    }
  } catch {
    ctx.beginPath();
    ctx.arc(centerX, centerY, AVATAR_RADIUS, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = borderColor ?? "#5865f2";
    ctx.fill();
  }
};

const printFittedText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  color: string,
  x: number,
  y: number,
  baseSize: number,
  maxWidth: number,
  weight: "normal" | "bold" = "bold"
) => {
  let size = baseSize;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  while (size >= MIN_FONT_SIZE) {
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    const width = ctx.measureText(text).width;
    if (width <= maxWidth) {
      break;
    }
    size -= 2;
  }

  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
};

const wrapBodyText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  fontSize: number
) => {
  ctx.font = `normal ${fontSize}px ${fontFamily}`;
  const words = text.split(/\s+/);
  const lines: string[] = [];

  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = ctx.measureText(candidate).width;
    if (width > BODY_MAX_WIDTH && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
};

export type WelcomeCardRenderInput = {
  cardConfig: WelcomeCardConfig;
  text: {
    title: string;
    subtitle: string;
    body?: string | null;
  };
  avatarUrl: string;
  assetsBasePath?: string;
};

export const renderWelcomeCard = async (
  input: WelcomeCardRenderInput
): Promise<Buffer> => {
  const { cardConfig, text, avatarUrl, assetsBasePath } = input;

  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext("2d");

  await drawCoverImage(ctx, cardConfig.background_image, assetsBasePath);

  if (cardConfig.overlay_color) {
    ctx.fillStyle = cardConfig.overlay_color;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  const resolvedFontFamily = resolveFontFamily(cardConfig, assetsBasePath);

  const avatarCenterX =
    AVATAR_BASE_CENTER_X + resolveNumber(cardConfig.avatar_offset_x, 0);
  const avatarCenterY =
    AVATAR_BASE_CENTER_Y +
    resolveNumber(cardConfig.avatar_offset_y, DEFAULT_AVATAR_OFFSET_Y);

  await drawAvatar(
    ctx,
    avatarUrl,
    avatarCenterX,
    avatarCenterY,
    cardConfig.avatar_border_color
  );

  const titleFontSize = resolveNumber(
    cardConfig.title_font_size,
    DEFAULT_TITLE_FONT_SIZE
  );
  const titleX =
    AVATAR_BASE_CENTER_X +
    resolveNumber(cardConfig.title_offset_x, 0);
  const titleY =
    avatarCenterY +
    AVATAR_RADIUS +
    resolveNumber(cardConfig.title_offset_y, DEFAULT_TITLE_OFFSET_Y);

  const sanitizedTitle = text.title?.trim() ?? "";
  if (sanitizedTitle) {
    printFittedText(
      ctx,
      sanitizedTitle,
      resolvedFontFamily,
      cardConfig.text_color,
      titleX,
      titleY,
      titleFontSize,
      BODY_MAX_WIDTH
    );
  }

  const subtitleFontSize = resolveNumber(
    cardConfig.subtitle_font_size,
    DEFAULT_SUBTITLE_FONT_SIZE
  );
  const subtitleX =
    AVATAR_BASE_CENTER_X +
    resolveNumber(cardConfig.subtitle_offset_x, 0);
  const subtitleY =
    titleY +
    resolveNumber(cardConfig.subtitle_offset_y, DEFAULT_SUBTITLE_OFFSET_Y);

  const sanitizedSubtitle = text.subtitle?.trim() ?? "";
  if (sanitizedSubtitle) {
    printFittedText(
      ctx,
      sanitizedSubtitle,
      resolvedFontFamily,
      cardConfig.accent_color,
      subtitleX,
      subtitleY,
      subtitleFontSize,
      BODY_MAX_WIDTH
    );
  }

  const bodyFontSize = resolveNumber(
    cardConfig.body_font_size,
    DEFAULT_BODY_FONT_SIZE
  );
  const bodyBaseX =
    AVATAR_BASE_CENTER_X +
    resolveNumber(cardConfig.body_offset_x, 0);
  const bodyStartY =
    subtitleY +
    resolveNumber(cardConfig.body_offset_y, DEFAULT_BODY_OFFSET_Y);
  const bodyLineHeight = Math.max(
    Math.round(bodyFontSize * 1.35),
    bodyFontSize + 4
  );

  const body = text.body?.trim();
  if (body) {
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = cardConfig.text_color;
    ctx.font = `normal ${bodyFontSize}px ${resolvedFontFamily}`;

    const paragraphs = body.split(/\r?\n/);
    let offsetY = bodyStartY;
    for (const paragraph of paragraphs) {
      const lines = wrapBodyText(
        ctx,
        paragraph,
        resolvedFontFamily,
        bodyFontSize
      );
      for (const line of lines) {
        ctx.fillText(line, bodyBaseX, offsetY);
        offsetY += bodyLineHeight;
      }
      offsetY += Math.round(bodyLineHeight / 2);
    }
  }

  return canvas.toBuffer("image/png");
};
