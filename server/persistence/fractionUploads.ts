import { put } from "@vercel/blob";

type BlobPut = typeof put;

export async function uploadFractionBlob(
  filename: string,
  bytes: Buffer,
  contentType: string,
  upload: BlobPut = put,
): Promise<string> {
  if (process.env.FRACTION_UPLOAD_STORAGE !== "vercel-blob" || !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Fraction uploads unavailable: configure FRACTION_UPLOAD_STORAGE=vercel-blob and BLOB_READ_WRITE_TOKEN");
  }
  try {
    const blob = await upload(`uploads/fractions/${filename}`, bytes, {
      access: "public",
      contentType,
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return blob.url;
  } catch {
    throw new Error("Fraction image could not be persisted to Blob storage");
  }
}