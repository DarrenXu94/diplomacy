import zlib from "zlib";

// import fs from "fs-extra";
import request from "request-promise-native";

import { error, matches } from "./util";

import {
  GameState,
  maps,
  HoldOrder,
  Unit,
  MoveOrder,
  SupportOrder,
  ConvoyOrder,
  UnitType,
} from "../../common/out/index";

export type Inputs = { [team: string]: string[] };

export interface Turn {
  orders: Inputs;
  retreats?: Inputs;
  builds?: Inputs;
}

const session_key = `mmqci5vml3dt5gnq5m0adign46`;

async function playdiplomacy(path: string, phpId: string) {
  let url = `https://www.playdiplomacy.com${path}`;
  try {
    let response = await request(url, {
      headers: { cookie: `PHPSESSID=${phpId}` },
      resolveWithFullResponse: true,
      followRedirect: false,
    });

    if (response.statusCode != 200) throw error("invalid status code");
    return response.body;
  } catch (e) {
    debugger;
    throw e;
  }
}

async function game_history(query: string, phpId) {
  let cache = `cache/${query}`;

  let data;
  //   try {
  //     data = fs.readFileSync(cache, "utf8");
  //   } catch (e) {
  data = await playdiplomacy(`/game_history.php?${query}`, phpId);
  //   await fs.writeFile(cache, data, "utf8");
  //   }

  return data;
}

async function get_history(id: number, phase: string, date: number, phpId) {
  let query = `game_id=${id}&phase=${phase}&gdate=${date}`;
  let data = await game_history(query, phpId);

  let found = false;
  let inputs: Inputs = {};

  for (let match of matches(/<b>(\w+)<\/b><ul>(.*?)<\/ul>/, data)) {
    let team = match[1];
    let list = [];

    for (let part of matches(/<li>(.*?)<\/li>/, match[2])) {
      list.push(part[1]);
    }
    if (list.length == 0) continue;

    found = true;
    inputs[team] = list;
  }

  if (found) return inputs;

  return undefined;
}

export async function get_game(id: number, phpId) {
  let turns = [];
  let history = await game_history(`game_id=${id}`, phpId);

  for (let content of history.split("</br></br>")) {
    let date = turns.length;
    let turn: Turn = { orders: {} };

    let found = false;
    for (let match of matches(
      /<b><a href='game_history\.php\?game_id=(\d+)&phase=(\w)&gdate=(\d+)'>[^<]+<\/a><\/b>&nbsp;&nbsp;/,
      content
    )) {
      if (id != parseInt(match[1]))
        throw error(`Failed to parse game history: ${id}`);
      if (date != parseInt(match[3]))
        throw error(`Failed to parse game history: ${id}`);

      let phase = match[2];
      let inputs = await get_history(id, phase, date, phpId);
      if (inputs == null && phase != "O") continue;

      found = true;
      switch (phase) {
        case "O":
          turn.orders = inputs || {};
          break;
        case "R":
          turn.retreats = inputs;
          break;
        case "B":
          turn.builds = inputs;
          break;
      }
    }

    if (!found) continue;

    turns.push(turn);
  }

  return turns;
}

export async function get_page(page: number) {
  let url = `/games.php?subpage=all_finished&variant-0=1&map_variant-0=1&current_page=${page}`;
  let data = await playdiplomacy(url, session_key);

  let ids = new Set<number>();
  for (let match of matches(
    /<a href="game_play_details\.php\?game_id=(\d+)/,
    data
  )) {
    let gameId = parseInt(match[1]);
    ids.add(gameId);
  }

  return [...ids];
}

export function read_game(raw: Buffer) {
  let data = zlib.gunzipSync(raw);
  let game = JSON.parse(data.toString("utf8")) as Turn[];

  for (let turn of game) {
    if (turn.builds && Object.keys(turn.builds).length == 0) {
      delete turn.builds;
    }
    if (turn.retreats && Object.keys(turn.retreats).length == 0) {
      delete turn.retreats;
    }
    if (Object.keys(turn.orders).length == 0) {
      // sometimes games have an empty last turn with no orders
      if (turn.builds || turn.retreats || game.indexOf(turn) + 1 != game.length)
        throw error(`missing orders: ${game.indexOf(turn)}`);
      game.pop();
      break;
    }
  }

  return game;
}

export function write_game(turns: Turn[]) {
  let data = Buffer.from(JSON.stringify(turns), "utf8");
  return zlib.gzipSync(data);
}

// export async function run() {
//   fs.mkdirpSync("data");
//   fs.mkdirpSync("cache");

//   let errors = 0;
//   let oldKnown;
//   let newKnown = { newest: 0, count: 0 };
//   try {
//     oldKnown = fs.readJSONSync("data/known.json") as typeof newKnown;
//     console.log(`known: ${oldKnown.newest} +${oldKnown.count}`);
//   } catch (e) {
//     oldKnown = null;
//   }

//   let skip = 0;
//   for (let i = 1; i <= 1000 && errors < 10; ++i) {
//     if (skip >= 15) {
//       skip -= 15;
//       continue;
//     }

//     console.log(`fetching page ${i}`);
//     let ids = await get_page(i);

//     for (let id of ids) {
//       if (newKnown.newest == 0) newKnown.newest = id;

//       if (oldKnown && id == oldKnown.newest) {
//         skip = oldKnown.count;
//         newKnown.count += oldKnown.count;
//         oldKnown = null;
//       }

//       if (skip >= 1) {
//         skip -= 1;
//         console.log(`skipping game ${id}`);
//         continue;
//       }

//       console.log(`fetching game ${id}`);
//       try {
//         let outputFile = `data/${id}`;
//         if (!fs.pathExistsSync(outputFile)) {
//           let game = await get_game(id, session_key);
//           let data = write_game(game);
//           let parsed = read_game(data);

//           if (JSON.stringify(parsed) != JSON.stringify(game))
//             throw error("game encoding failed");

//           fs.writeFileSync(outputFile, data);
//         }

//         if (errors == 0) {
//           ++newKnown.count;
//         }
//       } catch (e) {
//         ++errors;
//         fs.appendFileSync("errors.txt", `${id} ${e}`, "utf8");
//         console.error(id, e);
//       }
//     }

//     if (oldKnown == null) {
//       fs.writeJSONSync("data/known.json", newKnown);
//       console.log(`known: ${newKnown.newest} +${newKnown.count}`);
//     }
//   }
// }

// export async function check() {
//   fs.mkdirpSync("data");
//   fs.mkdirpSync("cache");

//   let count = 0;
//   let allIds = fs.readdirSync("data");

//   for (let id of allIds) {
//     if (id == "known.json") continue;

//     let game = read_game(fs.readFileSync(`data/${id}`));

//     let turns = 0;
//     let history = await game_history(`game_id=${id}`, session_key);

//     for (let content of history.split("</br></br>")) {
//       let found = false;
//       for (let _ of matches(
//         /<b><a href='game_history\.php\?game_id=(\d+)&phase=(\w)&gdate=(\d+)'>[^<]+<\/a><\/b>&nbsp;&nbsp;/,
//         content
//       )) {
//         found = true;
//         break;
//       }

//       if (!found) continue;
//       ++turns;
//     }

//     if (turns != game.length) {
//       game = await get_game(parseInt(id), session_key);
//       if (turns != game.length) {
//         throw error(`Mismatch: ${id} ${turns} ${game.length}`);
//       }
//     }

//     let builds = 0;
//     let retreats = 0;
//     for (let i = 0; i < game.length; ++i) {
//       if (game[i].builds) builds++;
//       if (game[i].retreats) retreats++;
//     }

//     if (builds == 0 && retreats == 0) {
//       game = await get_game(parseInt(id), session_key);
//       console.log(
//         `${(++count).toString().padStart(allIds.length.toString().length)} / ${
//           allIds.length
//         } ${id} ${turns} *`
//       );
//     } else {
//       console.log(
//         `${(++count).toString().padStart(allIds.length.toString().length)} / ${
//           allIds.length
//         } ${id} ${turns}`
//       );
//     }

//     let data = write_game(game);
//     fs.writeFileSync(`data/${id}`, data);
//   }
// }

export function parse_orders(game: GameState, inputs: Inputs) {
  let isNew = game.units.size == 0;
  let fleets = new Set([
    maps.standard.regions.LON,
    maps.standard.regions.EDI,
    maps.standard.regions.BRE,
    maps.standard.regions.NAP,
    maps.standard.regions.KIE,
    maps.standard.regions.TRI,
    maps.standard.regions.ANK,
    maps.standard.regions.SEV,
    maps.standard.regions.STP_SOUTH,
  ]);

  let orders = [];
  let resolved = [];

  for (let team in inputs) {
    for (let raw of inputs[team]) {
      let match = /(.*?)(HOLD|MOVE|SUPPORT|CONVOY)(.*)->(.*)/.exec(raw);
      if (match == null) throw error(`failed to match order: ${raw}`);

      let regionName = match[1].trim();
      let op = match[2];
      let args = match[3].trim();
      let result = match[4].trim();

      if (result == "Invalid order or syntax error") continue;

      let region = game.map.regions.find((r) => r.name == regionName);
      if (region == null)
        throw error(`failed to find region for order: ${raw} `);

      let unit = [...game.units].find(
        (u) => u.region == region && u.team == team
      );
      if (unit == null) {
        if (isNew)
          game.units.add(
            (unit = new Unit(
              region,
              fleets.has(region) ? UnitType.Water : UnitType.Land,
              team
            ))
          );
        else throw error(`Unit does not exist: ${team} ${region.name} `);
      }

      let order;

      if (op == "HOLD" || result == "Illegal order replaced with Hold order") {
        order = new HoldOrder(unit);
      } else if (op == "MOVE") {
        let moveArgs = args.split("VIA");

        let rawTarget = moveArgs[0].trim();
        let target = maps.standard.map.regions.find((r) => r.name == rawTarget);
        if (target == null)
          throw error(`failed to find target region for move order: ${args} `);

        order = new MoveOrder(unit, target, moveArgs.length > 1);
        if (result == "resolved") {
          resolved.push(order);
        }
      } else if (op == "SUPPORT") {
        let [rawSrc, rawDst] = args.split(" to "); // 'X to hold' or 'X to Y'

        let src = maps.standard.map.regions.find((r) => r.name == rawSrc);
        if (src == null)
          throw error(
            `failed to find target region for support order: ${rawSrc} `
          );

        if (rawDst == "hold") order = new SupportOrder(unit, src);
        else {
          let dst = maps.standard.map.regions.find((r) => r.name == rawDst);
          if (dst == null)
            throw error(
              `failed to find attack region for support order: ${rawDst} `
            );

          order = new SupportOrder(unit, src, dst);
        }
      } else if (op == "CONVOY") {
        let [rawSrc, rawDst] = args.split(" to "); // 'X to Y'

        let src = maps.standard.map.regions.find((r) => r.name == rawSrc);
        if (src == null)
          throw error(
            `failed to find start region for convoy order: ${rawSrc} `
          );

        let dst = maps.standard.map.regions.find((r) => r.name == rawDst);
        if (dst == null)
          throw error(`failed to find end region for convoy order: ${rawDst} `);

        order = new ConvoyOrder(unit, src, dst);
      } else {
        throw error(`invalid order: ${op}`);
      }

      orders.push(order);
    }
  }

  return { orders, resolved };
}

export function parse_retreats(evicted: Unit[], inputs: Inputs) {
  let retreats = [];

  for (let team in inputs) {
    for (let raw of inputs[team]) {
      let match = /((.*)RETREAT(.*)|(.*)DESTROY)\s+->(.*)/.exec(raw);
      if (match == null) throw error(`failed to match retreat: ${raw} `);

      let result = match[5].trim();
      if (match[2]) {
        let rawSrc = match[2].trim();
        let rawDst = match[3].trim();

        let src = maps.standard.map.regions.find((r) => r.name == rawSrc);
        if (src == null)
          throw error(`failed to find region for retreat: ${raw}`);

        let dst = maps.standard.map.regions.find((r) => r.name == rawDst);
        if (dst == null)
          throw error(`failed to find region for retreat: ${raw}`);

        let unit = evicted.find((u) => u.region == src && u.team == team);
        if (unit == null)
          throw error(`failed to find unit for retreat: ${raw} ${team}`);

        retreats.push({ unit, target: dst, resolved: result == "resolved" });
      } else {
        let rawRegion = match[4].trim();

        let region = maps.standard.map.regions.find((r) => r.name == rawRegion);
        if (region == null)
          throw error(`failed to find region for retreat: ${raw}`);

        let unit = [...evicted].find(
          (u) => u.region == region && u.team == team
        );
        if (unit == null)
          throw error(`failed to find unit for retreat: ${raw} ${team}`);

        retreats.push({ unit, target: null, resolved: result == "resolved" });
      }
    }
  }

  return retreats;
}

export function parse_builds(game: GameState, inputs: Inputs) {
  let builds = [];

  for (let team in inputs) {
    for (let raw of inputs[team]) {
      let match = /(BUILD\s+(fleet|army)\s+(.*)|(.*)DESTROY)\s+->(.*)/.exec(
        raw
      );
      if (match == null) throw error(`failed to match build: ${raw}`);

      let result = match[5].trim();

      if (match[2]) {
        let type = match[2].trim();
        let rawRegion = match[3].trim();

        let region = maps.standard.map.regions.find((r) => r.name == rawRegion);
        if (region == null)
          throw error(`failed to find region for build: ${raw}`);

        let unit = new Unit(
          region,
          type == "fleet" ? UnitType.Water : UnitType.Land,
          team
        );

        builds.push({ unit, resolved: result == "resolved" });
      } else {
        let rawRegion = match[4].trim();

        let region = maps.standard.map.regions.find((r) => r.name == rawRegion);
        if (region == null)
          throw error(`failed to find region for build: ${raw}`);

        let unit = [...game.units].find(
          (u) => u.region == region && u.team == team
        );
        if (unit == null) {
          if (result != "resolved") continue;
          else throw error(`failed to find unit for build: ${raw} ${team}`);
        }

        builds.push({ unit, resolved: result == "resolved" });
      }
    }
  }

  return builds;
}

// export async function fetchGameData() {
//   // get game history phase O
//   const inputs = await get_history(221053, "O", 0, session_key);
//   console.log(inputs);
//   fs.writeFileSync("game-data.json", JSON.stringify(inputs, null, 2));
// }

export async function fetchSingleGame(id: number, phpId = session_key) {
  const game = await get_game(id, phpId);
  let data = write_game(game);
  let parsed = read_game(data);

  return parsed;
}

export async function getSessionKey() {
  console.log("get session key");
  const options = {
    uri: "https://www.playdiplomacy.com",
    resolveWithFullResponse: true, // Needed to get the full response including headers
    simple: false, // Prevents throwing an error on non-2xx responses
  };

  try {
    const response = await request(options);
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
    } else {
      console.log("Session Key not found");
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}
