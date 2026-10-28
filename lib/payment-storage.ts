import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import WebSocket from "ws";

const bucketName = "payment-receipts";

export function getPaymentStorage() {
  return getSupabaseClient().storage.from(bucketName);
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new Error("PAYMENT_STORAGE_NOT_CONFIGURED");

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsedUrl.hostname)) throw new Error();
  } catch {
    throw new Error("PAYMENT_STORAGE_NOT_CONFIGURED");
  }

  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    realtime: { transport: WebSocket as unknown as WebSocketLikeConstructor },
  });
}

export async function assertPaymentBucketIsPrivate() {
  const client = getSupabaseClient();
  const { data, error } = await client.storage.listBuckets();
  if (error) throw new Error("PAYMENT_STORAGE_UNAVAILABLE");
  const bucket = data.find((item) => item.name === bucketName);
  if (!bucket || bucket.public) throw new Error("PAYMENT_BUCKET_MUST_BE_PRIVATE");
  return client.storage.from(bucketName);
}