import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "public/index.html",
  "public/styles.css",
  "public/game.js",
  "server/index.js"
];

for (const file of requiredFiles) {
  await access(file);
}

const html = await readFile("public/index.html", "utf8");
for (const asset of ["./styles.css", "./game.js"]) {
  if (!html.includes(asset)) {
    throw new Error(`Missing asset reference: ${asset}`);
  }
}

console.log("Asset check passed");
