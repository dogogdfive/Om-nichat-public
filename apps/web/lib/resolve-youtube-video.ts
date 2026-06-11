import { apiFetch } from "@/lib/api";
import { isYoutubeVideoId } from "@/lib/parse-channel-input";

export async function resolveYoutubeParsedChannel(parsed: {
  platform: string;
  handle: string;
  youtubeVideoId?: string;
}): Promise<{ platform: "youtube"; handle: string } | { error: string }> {
  const videoId =
    parsed.youtubeVideoId ??
    (parsed.platform === "youtube" && isYoutubeVideoId(parsed.handle) ? parsed.handle : null);
  if (!videoId) {
    if (parsed.platform !== "youtube") return { error: "Not a YouTube channel" };
    return { platform: "youtube", handle: parsed.handle };
  }

  const res = await apiFetch(
    `/api/public/youtube/resolve?videoId=${encodeURIComponent(videoId)}`,
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return {
      error:
        body.error ??
        "Could not resolve that YouTube stream — try @channel or youtube.com/@channel instead",
    };
  }

  const body = (await res.json()) as { handle: string };
  return { platform: "youtube", handle: body.handle };
}
