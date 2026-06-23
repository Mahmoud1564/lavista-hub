import { useEffect, useState } from "react";
import { getSignedUrl } from "@/lib/storage";

export function useSignedImage(bucket: string, path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    if (!path) { setUrl(null); return; }
    getSignedUrl(bucket, path).then((u) => { if (mounted) setUrl(u); });
    return () => { mounted = false; };
  }, [bucket, path]);
  return url;
}
