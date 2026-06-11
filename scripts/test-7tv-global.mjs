const globalQuery = {
  query: `query {
    set: namedEmoteSet(name: GLOBAL) {
      id
      name
      emotes { id name data { host { url } } }
    }
  }`,
};

const res = await fetch("https://7tv.io/v3/gql", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(globalQuery),
});
const json = await res.json();
const emotes = json.data?.set?.emotes ?? [];
console.log("global", res.status, "emotes:", emotes.length, "sample:", emotes.slice(0, 3).map((e) => e.name));
if (json.errors) console.log("errors:", json.errors);
