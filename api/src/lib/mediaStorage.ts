import fs from "node:fs/promises";
import path from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { env, hasR2Config } from "./env.js";
import { AppError } from "./errors.js";

export type StoredAsset = {
  storageKey: string;
  publicUrl: string;
};

let r2Client: S3Client | null = null;

function getClient(): S3Client {
  if (!hasR2Config()) {
    throw new AppError(503, "RECORDING_ERROR", "Recorded greeting storage is not configured");
  }

  if (!r2Client) {
    r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2AccessKeyId,
        secretAccessKey: env.r2SecretAccessKey,
      },
    });
  }

  return r2Client;
}

export async function uploadGreetingFile(localFilePath: string, fileName: string): Promise<StoredAsset> {
  const client = getClient();
  const storageKey = `greetings/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const body = await fs.readFile(localFilePath);

  const upload = new Upload({
    client,
    params: {
      Bucket: env.r2Bucket,
      Key: storageKey,
      Body: body,
      ContentType: "audio/mpeg",
    },
  });

  await upload.done();
  await fs.rm(localFilePath, { force: true });

  return {
    storageKey,
    publicUrl: `${env.r2PublicBaseUrl.replace(/\/$/, "")}/${storageKey}`,
  };
}

export function uploadsDirectory(): string {
  return path.join(process.cwd(), "tmp-uploads");
}
