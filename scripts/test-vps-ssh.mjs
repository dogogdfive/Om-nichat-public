import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "package.json"));
const { Client } = require("ssh2");

const pass = process.argv[2] ?? process.env.VPS_PASSWORD;
const conn = new Client();
conn
  .on("ready", () => {
    console.log("LOGIN_OK");
    conn.exec("echo ok", (err, stream) => {
      if (err) {
        console.log("EXEC_ERR", err.message);
        conn.end();
        return;
      }
      stream.on("data", (d) => process.stdout.write(d));
      stream.on("close", (code) => {
        console.log("EXEC_EXIT", code);
        conn.end();
      });
    });
  })
  .on("error", (e) => {
    console.log("LOGIN_ERR", e.message);
    process.exit(1);
  })
  .connect({ host: "167.233.69.105", username: "root", password: pass, readyTimeout: 15000 });
