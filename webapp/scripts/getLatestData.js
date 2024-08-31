const { runFunction } = require("../../scraper/out/main");

const { getSessionKey } = require("./getPHPKey");

const fs = require("fs");

async function main() {
  await getSessionKey();
  const sessionKey = fs.readFileSync("sessionKey.txt", "utf8").trim();
  runFunction(sessionKey);
}

main();
