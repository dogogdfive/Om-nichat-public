const twitchId = "552120296";

const gqlQuery = {
  query: `query ChannelEmotes($id: String!) {
    user: userByConnection(platform: TWITCH, id: $id) {
      id
      emote_sets {
        id
        name
        emotes {
          id
          name
          data {
            host { url }
          }
        }
      }
    }
  }`,
  variables: { id: twitchId },
};

for (const url of [
  "https://7tv.io/v4/gql",
  "https://7tv.io/v3/gql",
  "https://7tv.io/v3/users/twitch/" + twitchId,
  "https://api.7tv.app/v3/users/twitch/" + twitchId,
]) {
  try {
    const init =
      url.includes("/gql")
        ? { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(gqlQuery) }
        : { headers: { Accept: "application/json" } };
    const res = await fetch(url, init);
    const text = await res.text();
    console.log("\n===", url, res.status, "===");
    console.log(text.slice(0, 800));
  } catch (e) {
    console.log("\n===", url, "ERR", e.message);
  }
}
