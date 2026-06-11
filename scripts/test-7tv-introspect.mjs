const introspection = {
  query: `query { __schema { queryType { fields { name } } } }`,
};

const res = await fetch("https://7tv.io/v4/gql", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(introspection),
});
console.log(await res.text());
