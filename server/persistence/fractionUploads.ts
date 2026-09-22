import { put } from "@vercel/blob";

type BlobPut = typeof put;

export const MAX_FRACTION_IMAGE_BYTES = 4 * 1024 * 1024;

const IMAGE_TYPES = {
  "image/png": {
    extensions: new Set(["png"]),
    matches: (bytes: Buffer) =>
      bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  "image/jpeg": {
    extensions: new Set(["jpg", "jpeg"]),
    matches: (bytes: Buffer) =>
      bytes.length >= 4 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff &&
      bytes[bytes.length - 2] === 0xff &&
      bytes[bytes.length - 1] === 0xd9,
  },
  "image/gif": {
    extensions: new Set(["gif"]),
    matches: (bytes: Buffer) => {
      const signature = bytes.subarray(0, 6).toString("ascii");
      return signature === "GIF87a" || signature === "GIF89a";
    },
  },
  "image/webp": {
    extensions: new Set(["webp"]),
    matches: (bytes: Buffer) =>
      bytes.length >= 16 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP" &&
      ["VP8 ", "VP8L", "VP8X"].includes(bytes.subarray(12, 16).toString("ascii")),
  },
} satisfies Record<string, { extensions: Set<string>; matches: (bytes: Buffer) => boolean }>;

type SupportedImageType = keyof typeof IMAGE_TYPES;

function validateFractionImage(filename: string, bytes: Buffer, contentType: string): SupportedImageType {
  if (!Buffer.isBuffer(bytes)) {
    throw new Error("Fraction image is invalid: decoded image bytes are required");
  }
  if (bytes.length === 0) {
    throw new Error("Fraction image is invalid: the decoded image is empty");
  }
  if (bytes.length > MAX_FRACTION_IMAGE_BYTES) {
    throw new Error(`Fraction image is too large: maximum decoded size is ${MAX_FRACTION_IMAGE_BYTES} bytes`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(filename) || filename.includes("..")) {
    throw new Error("Fraction image filename is invalid");
  }

  const imageType = IMAGE_TYPES[contentType as SupportedImageType];
  if (!imageType) {
    throw new Error("Fraction image type is not allowed: use PNG, JPEG, GIF, or WEBP");
  }
  const extension = filename.split(".").pop()?.toLowerCase();
  if (!extension || !imageType.extensions.has(extension)) {
    throw new Error("Fraction image filename extension does not match its MIME type");
  }
  if (!imageType.matches(bytes)) {
    throw new Error(`Fraction image bytes do not match ${contentType}`);
  }

  return contentType as SupportedImageType;
}

export async function uploadFractionBlob(
  filename: string,
  bytes: Buffer,
  contentType: string,
  upload: BlobPut = put,
): Promise<string> {
  if (process.env.FRACTION_UPLOAD_STORAGE !== "vercel-blob") {
    throw new Error("Fraction uploads unavailable: configure FRACTION_UPLOAD_STORAGE=vercel-blob");
  }
  if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
    throw new Error("Fraction uploads unavailable: the production Blob store is disabled outside Vercel Production");
  }

  const storeId = process.env.BLOB_STORE_ID;
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  if (!storeId || !oidcToken) {
    throw new Error("Fraction uploads unavailable: BLOB_STORE_ID and Vercel OIDC credentials are required");
  }

  const validatedContentType = validateFractionImage(filename, bytes, contentType);
  try {
    const blob = await upload(`uploads/fractions/${filename}`, bytes, {
      access: "public",
      contentType: validatedContentType,
      addRandomSuffix: true,
      maximumSizeInBytes: MAX_FRACTION_IMAGE_BYTES,
      oidcToken,
      storeId,
    });
    if (!blob.url || !blob.url.startsWith("https://")) {
      throw new Error("Blob storage returned an invalid public URL");
    }
    return blob.url;
  } catch {
    throw new Error("Fraction image could not be persisted to Blob storage");
  }
}