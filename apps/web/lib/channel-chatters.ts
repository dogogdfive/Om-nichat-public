import { apiFetch } from "@/lib/api";



export type ApiChatterEntry = {

  login: string;

  userId: string;

};



export type ApiChannelChatters = {

  platform: "twitch" | "kick";

  channel: string;

  chatters: ApiChatterEntry[];

  total: number;

  source: "api" | "activity" | "unavailable";

  error?: string;

};



export async function fetchChannelChatters(

  workspaceId: string,

  channels: { platform: "twitch" | "kick"; login: string }[],

): Promise<ApiChannelChatters[]> {

  if (channels.length === 0) return [];



  const params = new URLSearchParams();

  const twitch = channels.filter((c) => c.platform === "twitch").map((c) => c.login);

  const kick = channels.filter((c) => c.platform === "kick").map((c) => c.login);

  if (twitch.length) params.set("twitch", twitch.join(","));

  if (kick.length) params.set("kick", kick.join(","));



  const res = await apiFetch(

    `/api/workspaces/${encodeURIComponent(workspaceId)}/stream/chatters?${params}`,

  );

  if (!res.ok) return [];

  const data = (await res.json()) as { channels?: ApiChannelChatters[] };

  return data.channels ?? [];

}

