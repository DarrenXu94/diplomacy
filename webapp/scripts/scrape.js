// import request from "request-promise-native";
const request = require("request-promise-native");

const fs = require("fs");

const path = require("path");

// import fs from "fs";

// import path from "path";

const {
  GameState,
  maps,
  HoldOrder,
  resolve,
  Unit,
  MoveOrder,
  SupportOrder,
  ConvoyOrder,
  UnitType,
  formatter,
} = require("diplomacy-common");

const teams = new Set([
  "ENGLAND",
  "FRANCE",
  "GERMANY",
  "ITALY",
  "AUSTRIA",
  "RUSSIA",
  "TURKEY",
]);

const totals = { checked: 0, skipped_via: 0, skipped_team: 0 };

function error(msg) {
  debugger;
  return new Error(msg);
}

function* matches(regex, target) {
  let copy = new RegExp(regex, "g");
  let match;
  while ((match = copy.exec(target))) yield match;
}

async function get_history(id, phase, date, phpId) {
  let query = `game_id=${id}&phase=${phase}&gdate=${date}`;
  let data = await game_history(query, phpId);

  let found = false;
  let inputs = {};

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

async function playdiplomacy(path, phpId) {
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

async function game_history(query, phpId) {
  let data;

  data = await playdiplomacy(`/game_history.php?${query}`, phpId);

  return data;
}

async function get_game(id, phpId) {
  let turns = [];
  let history = await game_history(`game_id=${id}`, phpId);

  for (let content of history.split("</br></br>")) {
    let date = turns.length;
    let turn = { orders: {} };

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

async function fetchSingleGame(id, phpId) {
  const game = await get_game(id, phpId);
  // let data = write_game(game);
  // let parsed = read_game(data);

  return game;
}

function parse_orders(game, inputs) {
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

function parse_retreats(evicted, inputs) {
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

function parse_builds(game, inputs) {
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

function run_game(id, turns) {
  let game = new GameState(maps.standard.map, []);

  for (let i = 0; i < turns.length; ++i) {
    console.debug(
      `processing ${i % 2 ? "fall" : "spring"} ${1901 + Math.floor(i / 2)}`
    );

    let remote = parse_orders(game, turns[i].orders);
    let orders = remote.orders.slice();

    if (orders.find((o) => o.type == "move" && o.requireConvoy)) {
      ++totals.skipped_via;
      console.log(
        `skipping ${id} - found VIA CONVOY (${totals.skipped_via} total)`
      );
      return;
    }

    let x = [...game.units].find((u) => !teams.has(u.team));
    if (x) {
      console.log(
        `skipping ${id} - found team ${x.team} (${totals.skipped_team} total)`
      );
      ++totals.skipped_team;
      return;
    }

    for (let unit of game.units) {
      let order = orders.find((o) => o.unit == unit);
      if (order) continue;
      orders.push(new HoldOrder(unit));
    }

    let local = resolve(orders);

    for (let move of local.resolved) {
      if (!game.units.has(move.unit)) debugger;
      game.units.delete(move.unit);
      game.units.add(new Unit(move.target, move.unit.type, move.unit.team));
    }

    for (let order of orders) {
      if (order.type == "move") {
        if (local.resolved.includes(order) != remote.resolved.includes(order)) {
          for (let pair of local.reasons) {
            console.log(`${pair[0]}: ${pair[1]}`);
          }
          console.log(order);
          debugger;
          resolve(orders);
          throw error(`Mismatch in game ${id}`);
        }
      }
    }

    if (local.evicted.length) {
      let evicted = new Set(local.evicted);
      let retreats = parse_retreats(local.evicted, turns[i].retreats);
      for (let retreat of retreats) {
        if (retreat.resolved) {
          if (retreat.target) game.move(retreat.unit, retreat.target);
          else game.units.delete(retreat.unit);
          evicted.delete(retreat.unit);
        }
      }
      for (let unit of evicted) {
        game.units.delete(unit);
      }
    }

    if (i % 2 == 1) {
      let builds = parse_builds(game, turns[i].builds);

      for (let build of builds) {
        if (build.resolved) {
          if (game.units.has(build.unit)) game.units.delete(build.unit);
          else game.units.add(build.unit);
        }
      }
    }

    for (let region of game.map.regions) {
      let units = [...game.units].filter((u) => u.region == region);
      if (units.length > 1) throw error(`Mismatch in game ${id}`);
    }

    if (i === turns.length - 1) {
      console.log("writing to file");
      const newUnits = Array.from(game.units);

      // const folderPath = path.join(__dirname, "../../webapp/src/data");
      const folderPath = path.join(__dirname, "../src/data");

      fs.writeFileSync(
        folderPath + "/final-state1.json",
        JSON.stringify(newUnits, null, 2)
      );
    }
  }

  ++totals.checked;
}

const MY_GAME_ID = 221053;

const runFunction = function(phpKey) {
  const turns = fetchSingleGame(MY_GAME_ID, phpKey);
  // console.log(turns);
  turns.then((res) => {
    // console.log(res);
    const gameFinal = run_game(MY_GAME_ID, res);
  });
};

module.exports = { runFunction };
