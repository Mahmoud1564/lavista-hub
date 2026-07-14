import { supabase } from "@/integrations/supabase/client";

/**
 * For images stored in private buckets we save the storage PATH in image_url
 * (e.g. "abcd1234.jpg") and resolve a signed URL on demand. If image_url is
 * already an absolute URL we return it as-is.
 */
export async function getSignedUrl(
  bucket: string,
  path: string | null | undefined,
  expiresIn = 60 * 60 * 24 * 7,
): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

export async function getSignedUrls(
  bucket: string,
  paths: string[],
  expiresIn = 60 * 60 * 24 * 7,
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const remote = paths.filter((p) => p && !p.startsWith("http"));
  paths.forEach((p) => {
    if (p?.startsWith("http")) map[p] = p;
  });
  if (remote.length === 0) return map;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(remote, expiresIn);
  data?.forEach((d) => {
    if (d.signedUrl && d.path) map[d.path] = d.signedUrl;
  });
  return map;
}

export async function uploadFile(bucket: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  return path;
}

export async function deleteFile(bucket: string, path: string): Promise<void> {
  if (!path || path.startsWith("http")) return;
  await supabase.storage.from(bucket).remove([path]);
}
