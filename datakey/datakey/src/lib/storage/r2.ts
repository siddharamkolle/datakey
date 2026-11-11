import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getR2Client(): S3Client | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  const endpoint =
    process.env.R2_ENDPOINT ||
    `https://${accountId}.r2.cloudflarestorage.com`;

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

const BUCKET_NAME = process.env.R2_BUCKET_NAME || "datakey-vault-storage";

/**
 * Generates a presigned URL for uploading an encrypted chunk to Cloudflare R2.
 */
export async function getPresignedUploadUrl(
  userId: string,
  fileId: string,
  chunkIndex: number,
  expiresInSeconds = 300 // 5 minutes
): Promise<string> {
  const s3 = getR2Client();
  if (!s3) {
    throw new Error("Cloudflare R2 credentials are not configured in environment variables.");
  }

  const key = `vault/${userId}/${fileId}/chunk_${chunkIndex}.bin`;
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: "application/octet-stream",
  });

  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

/**
 * Generates a presigned URL for downloading an encrypted chunk from Cloudflare R2.
 */
export async function getPresignedDownloadUrl(
  userId: string,
  fileId: string,
  chunkIndex: number,
  expiresInSeconds = 300
): Promise<string> {
  const s3 = getR2Client();
  if (!s3) {
    throw new Error("Cloudflare R2 credentials are not configured in environment variables.");
  }

  const key = `vault/${userId}/${fileId}/chunk_${chunkIndex}.bin`;
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

/**
 * Deletes all encrypted chunks for a given file from Cloudflare R2 upon permanent shredding.
 */
export async function deleteFileChunksFromR2(
  userId: string,
  fileId: string,
  totalChunks: number
): Promise<void> {
  const s3 = getR2Client();
  if (!s3) {
    return;
  }

  const objectsToDelete = Array.from({ length: totalChunks }, (_, i) => ({
    Key: `vault/${userId}/${fileId}/chunk_${i}.bin`,
  }));

  if (objectsToDelete.length === 0) return;

  const command = new DeleteObjectsCommand({
    Bucket: BUCKET_NAME,
    Delete: {
      Objects: objectsToDelete,
      Quiet: true,
    },
  });

  await s3.send(command);
}

