const twitchId = "552120296";

const channelQuery = {
  query: `query UserEmotes($id: String!) {
    user: userByConnection(platform: TWITCH, id: $id) {
      id
      emote_sets {
        id
        name
        emotes {
          id
          name
          data { host { url } }
        }
      }
    }
  }`,
  variables: { id: twitchId },
};

const globalQuery = {
  query: `query {
    emoteSet(id: "global") {
      id
      name
      emotes { id name data { host { url } } }
    }
  }`,
};

for (const [name, body] of [
  ["channel", channelQuery],
  ["global", globalQuery],
]) {
  const res = await fetch("https://7tv.io/v3/gql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  const emotes =
    name === "channel"
      ? json.data?.user?.emote_sets?.flatMap((s) => s.emotes ?? []) ?? []
      : json.data?.emoteSet?.emotes ?? [];
  console.log(name, res.status, "emotes:", emotes.length, "sample:", emotes.slice(0, 3).map((e) => e.name));
  if (json.errors) console.log("errors:", json.errors);
}
