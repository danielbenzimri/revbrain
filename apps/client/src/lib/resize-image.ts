/**
 * Client-side image resize utility for avatar uploads.
 *
 * Resizes to a square crop (center) at the target size, outputs as WebP.
 * Uses Canvas API — no dependencies, works in all modern browsers.
 */

const DEFAULT_SIZE = 256;
const DEFAULT_QUALITY = 0.85;
const OUTPUT_TYPE = 'image/webp';

/**
 * Resize and crop an image file to a square at the given size.
 * Returns a new File object in WebP format.
 */
export async function resizeImageForAvatar(
  file: File,
  size = DEFAULT_SIZE,
  quality = DEFAULT_QUALITY
): Promise<File> {
  const bitmap = await createImageBitmap(file);

  // Center-crop to square
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: OUTPUT_TYPE, quality });
  return new File([blob], 'avatar.webp', { type: OUTPUT_TYPE });
}
