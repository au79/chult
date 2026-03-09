export async function injectMapImage(imageBase64?: string) {
  const imageElement = document.querySelector('[data-map-image]');
  if (!imageElement) return;

  if (typeof imageBase64 === 'string' && imageBase64.length > 0) {
    const bytes = base64ToUint8(imageBase64);
    const objectUrl = createObjectUrl(bytes);
    imageElement.setAttribute('href', objectUrl);
    imageElement.setAttribute('xlink:href', objectUrl);
    return;
  }

  try {
    const mapImageDataPath = `${window.location.origin}/js/mapImageData.js`;
    const module = await import(/* @vite-ignore */ mapImageDataPath);
    const resolvedImage = String(module?.mapImageBase64 || '');
    const bytes = base64ToUint8(resolvedImage);
    const objectUrl = createObjectUrl(bytes);
    imageElement.setAttribute('href', objectUrl);
    imageElement.setAttribute('xlink:href', objectUrl);
  } catch (error) {
    console.error('Failed to load map image', error);
  }
}

export function base64ToUint8(base64Data: string) {
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }
  return bytes;
}

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
