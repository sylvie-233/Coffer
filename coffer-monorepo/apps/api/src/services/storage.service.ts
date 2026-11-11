import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

/**
 * RustFS 对象存储（S3 兼容）。
 * 服务器只在中转密文文件，不持有任何解密能力。
 */
const client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

const bucket = env.S3_BUCKET;

/** 启动时确保桶存在；失败只记录警告，不阻塞 API 启动。 */
export async function ensureBucket(): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (error) {
      console.warn(`[api:storage] 无法创建桶 ${bucket}，附件功能可能不可用`, error);
    }
  }
}

export async function storageHealthy(): Promise<boolean> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch {
    return false;
  }
}

export async function putObject(key: string, bytes: Uint8Array): Promise<void> {
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: 'application/octet-stream',
        ContentLength: bytes.length,
      }),
    );
  } catch (error) {
    console.error('[api:storage] 上传失败', error);
    throw new HttpError(503, '对象存储不可用，请检查 RustFS 是否已启动');
  }
}

export async function getObject(key: string): Promise<Uint8Array> {
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = response.Body;
    if (!body) {
      throw new Error('对象内容为空');
    }
    return await body.transformToByteArray();
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    console.error('[api:storage] 读取失败', error);
    throw new HttpError(404, '附件文件不存在或已被清理');
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (!key) {
    return;
  }
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    console.warn('[api:storage] 删除失败', key, error);
  }
}
