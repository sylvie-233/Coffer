import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';

export interface PickedImage {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

function guessMimeType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) {
    return 'image/png';
  }
  if (lower.endsWith('.webp')) {
    return 'image/webp';
  }
  if (lower.endsWith('.gif')) {
    return 'image/gif';
  }
  return 'image/jpeg';
}

function toPickedImage(asset: ImagePicker.ImagePickerAsset, index: number): PickedImage {
  const fallbackName = `image-${Date.now()}-${index}.jpg`;
  const name = asset.fileName?.trim() || fallbackName;
  return {
    uri: asset.uri,
    name,
    mimeType: asset.mimeType?.trim() || guessMimeType(name),
    size: asset.fileSize ?? 0,
  };
}

/** 从相册选择多张图片（不读字节，上传时再读）。 */
export async function pickImages(multiple = true): Promise<PickedImage[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: multiple,
    selectionLimit: multiple ? 9 : 1,
    quality: 0.85,
  });
  if (result.canceled) {
    return [];
  }
  return result.assets.map((asset, index) => toPickedImage(asset, index));
}

/** 读取图片明文字节。 */
export async function readImageBytes(image: PickedImage): Promise<Uint8Array> {
  const file = new File(image.uri);
  return file.bytes();
}

/** 把解密后的明文写入缓存目录，供 RN Image 显示。 */
export async function writeTempImage(
  bytes: Uint8Array,
  mimeType: string,
  prefix: string,
): Promise<string> {
  const ext =
    mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/gif'
        ? 'gif'
        : mimeType === 'image/webp'
          ? 'webp'
          : 'jpg';
  const file = new File(
    Paths.cache,
    `coffer-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
  );
  if (!file.exists) {
    file.create({ intermediates: true });
  }
  await file.write(bytes);
  return file.uri;
}

/** 把密文写入临时文件，供 RN FormData 上传使用。 */
export async function writeTempBinary(bytes: Uint8Array, name: string): Promise<string> {
  const file = new File(Paths.cache, `coffer-${name}-${Date.now()}.bin`);
  if (!file.exists) {
    file.create({ intermediates: true });
  }
  await file.write(bytes);
  return file.uri;
}

export function deleteTempFile(uri: string | null | undefined): void {
  if (!uri) {
    return;
  }
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // 缓存文件可能已被系统清理，忽略即可。
  }
}

/** 解密后的头像未记录 MIME，用文件头猜测。 */
export function sniffImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return 'image/jpeg';
}
