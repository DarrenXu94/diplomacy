const { getSessionKey } = require("../../scripts/getPHPKey");

exports.handler = async function(event, context) {
  const sessionKey = await getSessionKey();

  return {
    statusCode: 200,
    body: sessionKey,
  };
};
