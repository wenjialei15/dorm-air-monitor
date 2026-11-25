import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const assets = new Map([
  ["/", ["index.html", "text/html"]],
  ["/index.html", ["index.html", "text/html"]],
  ["/style.css", ["style.css", "text/css"]],
  ["/app.js", ["app.js", "text/javascript"]],
  ["/model.js", ["model.js", "text/javascript"]],
  ["/chart.js", ["chart.js", "text/javascript"]],
]);
const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new RangeError("PORT must be from 1 to 65535");

const server = createServer(async (request, response) => {
  const path = request.url.split("?")[0];
  const asset = assets.get(path);
  if (!asset || !["GET", "HEAD"].includes(request.method)) {
    response.writeHead(asset ? 405 : 404).end();
    return;
  }
  try {
    const content = await readFile(new URL(`../docs/${asset[0]}`, import.meta.url));
    response.writeHead(200, { "Content-Type": `${asset[1]}; charset=utf-8`, "Content-Length": content.length });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    console.error(error.message);
    response.writeHead(500).end();
  }
});
server.listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}`));
