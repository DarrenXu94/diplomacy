const { runFunction } = require("../../scraper/out/main");

const { getSessionKey } = require("./getPHPKey");

async function main() {
  const sessionKey = await getSessionKey();
  runFunction(sessionKey);
}

main();
