const rp = require("request-promise-native");
require("dotenv").config();

async function getSessionKey() {
  const options = {
    method: "POST",
    uri: "https://www.playdiplomacy.com/login.php",
    form: {
      // Replace these with your actual login credentials
      username: process.env.NETLIFY_USERNAME,
      password: process.env.NETLIFY_DIPLO_PW,
    },
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.54 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.playdiplomacy.com/",
    },
    resolveWithFullResponse: true, // Needed to get the full response including headers
    simple: false, // Prevents throwing an error on non-2xx responses
  };

  try {
    const response = await rp(options);
    console.log("Response:", response.headers);
    // The session key will be in the 'set-cookie' header
    const cookies = response.headers["set-cookie"];
    let sessionKey = null;

    // Search for the PHPSESSID cookie
    if (cookies) {
      cookies.forEach((cookie) => {
        if (cookie.startsWith("PHPSESSID=")) {
          sessionKey = cookie.split(";")[0].split("=")[1];
        }
      });
    }

    if (sessionKey) {
      console.log("Session Key:", sessionKey);
      // fs.writeFileSync("sessionKey.txt", sessionKey);
      return sessionKey;
    } else {
      console.log("Session Key not found");
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

// getSessionKey();

module.exports = { getSessionKey };
