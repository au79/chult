/**
 * Injects map image data into an image element. Accepts an optional
 * base64 override for tests; otherwise loads the runtime map data module.
 */
export async function injectMapImage(
  imageElement: HTMLImageElement,
  imageBase64?: string,
) {
  if (typeof imageBase64 === 'string' && imageBase64.length > 0) {
    const bytes = base64ToUint8(imageBase64);
    const objectUrl = createObjectUrl(bytes);
    imageElement.src = objectUrl;
    return;
  }

  try {
    const mapImageDataPath = `${window.location.origin}/js/mapImageData.js`;
    const module = await import(/* @vite-ignore */ mapImageDataPath);
    const resolvedImage = String(module?.mapImageBase64 || '');
    const bytes = base64ToUint8(resolvedImage);
    const objectUrl = createObjectUrl(bytes);
    imageElement.src = objectUrl;
  } catch (error) {
    console.error('Failed to load map image', error);
  }
}

/**
 * Decodes a base64 image payload into raw bytes for Blob/ObjectURL creation.
 */
export function base64ToUint8(base64Data: string) {
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }
  return bytes;
}

/**
 * Creates a blob URL for the map image bytes and revokes it on page unload.
 */
export function createObjectUrl(bytes: Uint8Array) {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
  const objectUrl = URL.createObjectURL(blob);
  window.addEventListener(
    'unload',
    () => {
      URL.revokeObjectURL(objectUrl);
    },
    { once: true },
  );
  return objectUrl;
}
