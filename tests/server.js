// Minimal statisk filserver för testerna.
//  - http  :8613  (appen; localhost är secure context)
//  - https :8614  (självsignerat cert; domänlås-testet behöver https på en
//                  "riktig" domän för att crypto.subtle ska finnas, precis
//                  som på riktiga GitHub Pages)
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const selfsigned = require("selfsigned");

const root = path.join(__dirname, "..");
const HTTP_PORT = 8613;
const HTTPS_PORT = 8614;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function handler(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let p = path.normalize(path.join(root, urlPath));
  if (!p.startsWith(root)) {
    res.writeHead(403);
    return res.end();
  }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  fs.readFile(p, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("not found");
    }
    res.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream" });
    res.end(data);
  });
}

http.createServer(handler).listen(HTTP_PORT, () =>
  console.log(`testserver: http://localhost:${HTTP_PORT}`));

const pems = selfsigned.generate(
  [{ name: "commonName", value: "kenny.github.io" }],
  { days: 2, keySize: 2048, extensions: [{ name: "subjectAltName", altNames: [
    { type: 2, value: "kenny.github.io" }, { type: 2, value: "localhost" },
  ]}]},
);
https.createServer({ key: pems.private, cert: pems.cert }, handler).listen(HTTPS_PORT, () =>
  console.log(`testserver: https://localhost:${HTTPS_PORT} (självsignerad)`));
