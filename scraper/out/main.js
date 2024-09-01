'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var fs = _interopDefault(require('fs'));
var path = _interopDefault(require('path'));
var diplomacyCommon = require('diplomacy-common');
var zlib = _interopDefault(require('zlib'));
var fs$1 = _interopDefault(require('fs-extra'));
var request = _interopDefault(require('request-promise-native'));

/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

function __awaiter(thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function error(msg) {
    debugger;
    return new Error(msg);
}
function* matches(regex, target) {
    let copy = new RegExp(regex, 'g');
    let match;
    while (match = copy.exec(target))
        yield match;
}

const session_key = `mmqci5vml3dt5gnq5m0adign46`;
function playdiplomacy(path, phpId) {
    return __awaiter(this, void 0, void 0, function* () {
        let url = `https://www.playdiplomacy.com${path}`;
        try {
            let response = yield request(url, {
                headers: { cookie: `PHPSESSID=${phpId}` },
                resolveWithFullResponse: true,
                followRedirect: false,
            });
            if (response.statusCode != 200)
                throw error("invalid status code");
            return response.body;
        }
        catch (e) {
            debugger;
            throw e;
        }
    });
}
function game_history(query, phpId) {
    return __awaiter(this, void 0, void 0, function* () {
        let data;
        //   try {
        //     data = fs.readFileSync(cache, "utf8");
        //   } catch (e) {
        data = yield playdiplomacy(`/game_history.php?${query}`, phpId);
        //   await fs.writeFile(cache, data, "utf8");
        //   }
        return data;
    });
}
function get_history(id, phase, date, phpId) {
    return __awaiter(this, void 0, void 0, function* () {
        let query = `game_id=${id}&phase=${phase}&gdate=${date}`;
        let data = yield game_history(query, phpId);
        let found = false;
        let inputs = {};
        for (let match of matches(/<b>(\w+)<\/b><ul>(.*?)<\/ul>/, data)) {
            let team = match[1];
            let list = [];
            for (let part of matches(/<li>(.*?)<\/li>/, match[2])) {
                list.push(part[1]);
            }
            if (list.length == 0)
                continue;
            found = true;
            inputs[team] = list;
        }
        if (found)
            return inputs;
        return undefined;
    });
}
function get_game(id, phpId) {
    return __awaiter(this, void 0, void 0, function* () {
        let turns = [];
        let history = yield game_history(`game_id=${id}`, phpId);
        for (let content of history.split("</br></br>")) {
            let date = turns.length;
            let turn = { orders: {} };
            let found = false;
            for (let match of matches(/<b><a href='game_history\.php\?game_id=(\d+)&phase=(\w)&gdate=(\d+)'>[^<]+<\/a><\/b>&nbsp;&nbsp;/, content)) {
                if (id != parseInt(match[1]))
                    throw error(`Failed to parse game history: ${id}`);
                if (date != parseInt(match[3]))
                    throw error(`Failed to parse game history: ${id}`);
                let phase = match[2];
                let inputs = yield get_history(id, phase, date, phpId);
                if (inputs == null && phase != "O")
                    continue;
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
            if (!found)
                continue;
            turns.push(turn);
        }
        return turns;
    });
}
function get_page(page) {
    return __awaiter(this, void 0, void 0, function* () {
        let url = `/games.php?subpage=all_finished&variant-0=1&map_variant-0=1&current_page=${page}`;
        let data = yield playdiplomacy(url, session_key);
        let ids = new Set();
        for (let match of matches(/<a href="game_play_details\.php\?game_id=(\d+)/, data)) {
            let gameId = parseInt(match[1]);
            ids.add(gameId);
        }
        return [...ids];
    });
}
function read_game(raw) {
    let data = zlib.gunzipSync(raw);
    let game = JSON.parse(data.toString("utf8"));
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
function write_game(turns) {
    let data = Buffer.from(JSON.stringify(turns), "utf8");
    return zlib.gzipSync(data);
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        fs$1.mkdirpSync("data");
        fs$1.mkdirpSync("cache");
        let errors = 0;
        let oldKnown;
        let newKnown = { newest: 0, count: 0 };
        try {
            oldKnown = fs$1.readJSONSync("data/known.json");
            console.log(`known: ${oldKnown.newest} +${oldKnown.count}`);
        }
        catch (e) {
            oldKnown = null;
        }
        let skip = 0;
        for (let i = 1; i <= 1000 && errors < 10; ++i) {
            if (skip >= 15) {
                skip -= 15;
                continue;
            }
            console.log(`fetching page ${i}`);
            let ids = yield get_page(i);
            for (let id of ids) {
                if (newKnown.newest == 0)
                    newKnown.newest = id;
                if (oldKnown && id == oldKnown.newest) {
                    skip = oldKnown.count;
                    newKnown.count += oldKnown.count;
                    oldKnown = null;
                }
                if (skip >= 1) {
                    skip -= 1;
                    console.log(`skipping game ${id}`);
                    continue;
                }
                console.log(`fetching game ${id}`);
                try {
                    let outputFile = `data/${id}`;
                    if (!fs$1.pathExistsSync(outputFile)) {
                        let game = yield get_game(id, session_key);
                        let data = write_game(game);
                        let parsed = read_game(data);
                        if (JSON.stringify(parsed) != JSON.stringify(game))
                            throw error("game encoding failed");
                        fs$1.writeFileSync(outputFile, data);
                    }
                    if (errors == 0) {
                        ++newKnown.count;
                    }
                }
                catch (e) {
                    ++errors;
                    fs$1.appendFileSync("errors.txt", `${id} ${e}`, "utf8");
                    console.error(id, e);
                }
            }
            if (oldKnown == null) {
                fs$1.writeJSONSync("data/known.json", newKnown);
                console.log(`known: ${newKnown.newest} +${newKnown.count}`);
            }
        }
    });
}
function check() {
    return __awaiter(this, void 0, void 0, function* () {
        fs$1.mkdirpSync("data");
        fs$1.mkdirpSync("cache");
        let count = 0;
        let allIds = fs$1.readdirSync("data");
        for (let id of allIds) {
            if (id == "known.json")
                continue;
            let game = read_game(fs$1.readFileSync(`data/${id}`));
            let turns = 0;
            let history = yield game_history(`game_id=${id}`, session_key);
            for (let content of history.split("</br></br>")) {
                let found = false;
                for (let _ of matches(/<b><a href='game_history\.php\?game_id=(\d+)&phase=(\w)&gdate=(\d+)'>[^<]+<\/a><\/b>&nbsp;&nbsp;/, content)) {
                    found = true;
                    break;
                }
                if (!found)
                    continue;
                ++turns;
            }
            if (turns != game.length) {
                game = yield get_game(parseInt(id), session_key);
                if (turns != game.length) {
                    throw error(`Mismatch: ${id} ${turns} ${game.length}`);
                }
            }
            let builds = 0;
            let retreats = 0;
            for (let i = 0; i < game.length; ++i) {
                if (game[i].builds)
                    builds++;
                if (game[i].retreats)
                    retreats++;
            }
            if (builds == 0 && retreats == 0) {
                game = yield get_game(parseInt(id), session_key);
                console.log(`${(++count).toString().padStart(allIds.length.toString().length)} / ${allIds.length} ${id} ${turns} *`);
            }
            else {
                console.log(`${(++count).toString().padStart(allIds.length.toString().length)} / ${allIds.length} ${id} ${turns}`);
            }
            let data = write_game(game);
            fs$1.writeFileSync(`data/${id}`, data);
        }
    });
}
function parse_orders(game, inputs) {
    let isNew = game.units.size == 0;
    let fleets = new Set([
        diplomacyCommon.maps.standard.regions.LON,
        diplomacyCommon.maps.standard.regions.EDI,
        diplomacyCommon.maps.standard.regions.BRE,
        diplomacyCommon.maps.standard.regions.NAP,
        diplomacyCommon.maps.standard.regions.KIE,
        diplomacyCommon.maps.standard.regions.TRI,
        diplomacyCommon.maps.standard.regions.ANK,
        diplomacyCommon.maps.standard.regions.SEV,
        diplomacyCommon.maps.standard.regions.STP_SOUTH,
    ]);
    let orders = [];
    let resolved = [];
    for (let team in inputs) {
        for (let raw of inputs[team]) {
            let match = /(.*?)(HOLD|MOVE|SUPPORT|CONVOY)(.*)->(.*)/.exec(raw);
            if (match == null)
                throw error(`failed to match order: ${raw}`);
            let regionName = match[1].trim();
            let op = match[2];
            let args = match[3].trim();
            let result = match[4].trim();
            if (result == "Invalid order or syntax error")
                continue;
            let region = game.map.regions.find((r) => r.name == regionName);
            if (region == null)
                throw error(`failed to find region for order: ${raw} `);
            let unit = [...game.units].find((u) => u.region == region && u.team == team);
            if (unit == null) {
                if (isNew)
                    game.units.add((unit = new diplomacyCommon.Unit(region, fleets.has(region) ? diplomacyCommon.UnitType.Water : diplomacyCommon.UnitType.Land, team)));
                else
                    throw error(`Unit does not exist: ${team} ${region.name} `);
            }
            let order;
            if (op == "HOLD" || result == "Illegal order replaced with Hold order") {
                order = new diplomacyCommon.HoldOrder(unit);
            }
            else if (op == "MOVE") {
                let moveArgs = args.split("VIA");
                let rawTarget = moveArgs[0].trim();
                let target = diplomacyCommon.maps.standard.map.regions.find((r) => r.name == rawTarget);
                if (target == null)
                    throw error(`failed to find target region for move order: ${args} `);
                order = new diplomacyCommon.MoveOrder(unit, target, moveArgs.length > 1);
                if (result == "resolved") {
                    resolved.push(order);
                }
            }
            else if (op == "SUPPORT") {
                let [rawSrc, rawDst] = args.split(" to "); // 'X to hold' or 'X to Y'
                let src = diplomacyCommon.maps.standard.map.regions.find((r) => r.name == rawSrc);
                if (src == null)
                    throw error(`failed to find target region for support order: ${rawSrc} `);
                if (rawDst == "hold")
                    order = new diplomacyCommon.SupportOrder(unit, src);
                else {
                    let dst = diplomacyCommon.maps.standard.map.regions.find((r) => r.name == rawDst);
                    if (dst == null)
                        throw error(`failed to find attack region for support order: ${rawDst} `);
                    order = new diplomacyCommon.SupportOrder(unit, src, dst);
                }
            }
            else if (op == "CONVOY") {
                let [rawSrc, rawDst] = args.split(" to "); // 'X to Y'
                let src = diplomacyCommon.maps.standard.map.regions.find((r) => r.name == rawSrc);
                if (src == null)
                    throw error(`failed to find start region for convoy order: ${rawSrc} `);
                let dst = diplomacyCommon.maps.standard.map.regions.find((r) => r.name == rawDst);
                if (dst == null)
                    throw error(`failed to find end region for convoy order: ${rawDst} `);
                order = new diplomacyCommon.ConvoyOrder(unit, src, dst);
            }
            else {
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
            if (match == null)
                throw error(`failed to match retreat: ${raw} `);
            let result = match[5].trim();
            if (match[2]) {
                let rawSrc = match[2].trim();
                let rawDst = match[3].trim();
                let src = diplomacyCommon.maps.standard.map.regions.find((r) => r.name == rawSrc);
                if (src == null)
                    throw error(`failed to find region for retreat: ${raw}`);
                let dst = diplomacyCommon.maps.standard.map.regions.find((r) => r.name == rawDst);
                if (dst == null)
                    throw error(`failed to find region for retreat: ${raw}`);
                let unit = evicted.find((u) => u.region == src && u.team == team);
                if (unit == null)
                    throw error(`failed to find unit for retreat: ${raw} ${team}`);
                retreats.push({ unit, target: dst, resolved: result == "resolved" });
            }
            else {
                let rawRegion = match[4].trim();
                let region = diplomacyCommon.maps.standard.map.regions.find((r) => r.name == rawRegion);
                if (region == null)
                    throw error(`failed to find region for retreat: ${raw}`);
                let unit = [...evicted].find((u) => u.region == region && u.team == team);
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
            let match = /(BUILD\s+(fleet|army)\s+(.*)|(.*)DESTROY)\s+->(.*)/.exec(raw);
            if (match == null)
                throw error(`failed to match build: ${raw}`);
            let result = match[5].trim();
            if (match[2]) {
                let type = match[2].trim();
                let rawRegion = match[3].trim();
                let region = diplomacyCommon.maps.standard.map.regions.find((r) => r.name == rawRegion);
                if (region == null)
                    throw error(`failed to find region for build: ${raw}`);
                let unit = new diplomacyCommon.Unit(region, type == "fleet" ? diplomacyCommon.UnitType.Water : diplomacyCommon.UnitType.Land, team);
                builds.push({ unit, resolved: result == "resolved" });
            }
            else {
                let rawRegion = match[4].trim();
                let region = diplomacyCommon.maps.standard.map.regions.find((r) => r.name == rawRegion);
                if (region == null)
                    throw error(`failed to find region for build: ${raw}`);
                let unit = [...game.units].find((u) => u.region == region && u.team == team);
                if (unit == null) {
                    if (result != "resolved")
                        continue;
                    else
                        throw error(`failed to find unit for build: ${raw} ${team}`);
                }
                builds.push({ unit, resolved: result == "resolved" });
            }
        }
    }
    return builds;
}
function fetchGameData() {
    return __awaiter(this, void 0, void 0, function* () {
        // get game history phase O
        const inputs = yield get_history(221053, "O", 0, session_key);
        console.log(inputs);
        fs$1.writeFileSync("game-data.json", JSON.stringify(inputs, null, 2));
    });
}
function fetchSingleGame(id, phpId = session_key) {
    return __awaiter(this, void 0, void 0, function* () {
        const game = yield get_game(id, phpId);
        let data = write_game(game);
        let parsed = read_game(data);
        return parsed;
    });
}
function getSessionKey() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("get session key");
        const options = {
            uri: "https://www.playdiplomacy.com",
            resolveWithFullResponse: true,
            simple: false,
        };
        try {
            const response = yield request(options);
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
            }
            else {
                console.log("Session Key not found");
            }
        }
        catch (err) {
            console.error("Error:", err.message);
        }
    });
}

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
function run_game(id, turns) {
    let game = new diplomacyCommon.GameState(diplomacyCommon.maps.standard.map, []);
    for (let i = 0; i < turns.length; ++i) {
        console.debug(`processing ${i % 2 ? "fall" : "spring"} ${1901 + Math.floor(i / 2)}`);
        let remote = parse_orders(game, turns[i].orders);
        let orders = remote.orders.slice();
        if (orders.find((o) => o.type == "move" && o.requireConvoy)) {
            ++totals.skipped_via;
            console.log(`skipping ${id} - found VIA CONVOY (${totals.skipped_via} total)`);
            return;
        }
        let x = [...game.units].find((u) => !teams.has(u.team));
        if (x) {
            console.log(`skipping ${id} - found team ${x.team} (${totals.skipped_team} total)`);
            ++totals.skipped_team;
            return;
        }
        for (let unit of game.units) {
            let order = orders.find((o) => o.unit == unit);
            if (order)
                continue;
            orders.push(new diplomacyCommon.HoldOrder(unit));
        }
        let local = diplomacyCommon.resolve(orders);
        for (let move of local.resolved) {
            if (!game.units.has(move.unit))
                debugger;
            game.units.delete(move.unit);
            game.units.add(new diplomacyCommon.Unit(move.target, move.unit.type, move.unit.team));
        }
        for (let order of orders) {
            if (order.type == "move") {
                if (local.resolved.includes(order) != remote.resolved.includes(order)) {
                    for (let pair of local.reasons) {
                        console.log(`${pair[0]}: ${pair[1]}`);
                    }
                    console.log(order);
                    debugger;
                    diplomacyCommon.resolve(orders);
                    throw error(`Mismatch in game ${id}`);
                }
            }
        }
        if (local.evicted.length) {
            let evicted = new Set(local.evicted);
            let retreats = parse_retreats(local.evicted, turns[i].retreats);
            for (let retreat of retreats) {
                if (retreat.resolved) {
                    if (retreat.target)
                        game.move(retreat.unit, retreat.target);
                    else
                        game.units.delete(retreat.unit);
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
                    if (game.units.has(build.unit))
                        game.units.delete(build.unit);
                    else
                        game.units.add(build.unit);
                }
            }
        }
        for (let region of game.map.regions) {
            let units = [...game.units].filter((u) => u.region == region);
            if (units.length > 1)
                throw error(`Mismatch in game ${id}`);
        }
        if (i === turns.length - 1) {
            console.log("writing to file");
            const newUnits = Array.from(game.units);
            const folderPath = path.join(__dirname, "../../webapp/src/data");
            fs.writeFileSync(folderPath + "/final-state.json", JSON.stringify(newUnits, null, 2));
        }
    }
    ++totals.checked;
}
// async function run() {
//   fs.mkdirpSync("data");
//   fs.mkdirpSync("cache");
//   // run_game(150168, scrape.read_game(fs.readFileSync('data/150168')));
//   let allIds = fs.readdirSync("data");
//   for (let id of allIds) {
//     if (id == "known.json") continue;
//     if (ignored_games.has(parseInt(id))) continue;
//     console.log(`processing game ${id}`);
//     let game = scrape.read_game(fs.readFileSync(`data/${id}`));
//     run_game(parseInt(id), game);
//   }
//   console.log(totals);
// }
let x = global;
if (x.devtoolsFormatters == null)
    x.devtoolsFormatters = [];
x.devtoolsFormatters.push(diplomacyCommon.formatter);
let op = process.argv[2];
const MY_GAME_ID = 221053;
if (op == "scrape")
    run();
else if (op == "check")
    check();
// else if (op == "run") run();
else if (op == "fetch")
    fetchGameData();
// else if (op == "test") scrape.fetchSingleGame(MY_GAME_ID);
else if (op == "key")
    getSessionKey();
else if (op == "test") {
    const turns = fetchSingleGame(MY_GAME_ID);
    turns.then((res) => {
        const gameFinal = run_game(MY_GAME_ID, res);
        // console.log(gameFinal);
    });
}
else {
    console.log("unknown or missing command");
}
// module.exports.runFunction = function (phpKey) {
//   const turns = scrape.fetchSingleGame(MY_GAME_ID, phpKey);
//   turns.then((res) => {
//     const gameFinal = run_game(MY_GAME_ID, res);
//   });
// };
const runFunction = function (phpKey) {
    const turns = fetchSingleGame(MY_GAME_ID, phpKey);
    turns.then((res) => {
        const gameFinal = run_game(MY_GAME_ID, res);
    });
};

exports.runFunction = runFunction;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsiLi4vc3JjL3V0aWwudHMiLCIuLi9zcmMvc2NyYXBlLnRzIiwiLi4vc3JjL21haW4udHMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGZ1bmN0aW9uIGVycm9yKG1zZzogc3RyaW5nKSB7XG4gICAgZGVidWdnZXI7XG4gICAgcmV0dXJuIG5ldyBFcnJvcihtc2cpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24qIG1hdGNoZXMocmVnZXg6IFJlZ0V4cCwgdGFyZ2V0OiBzdHJpbmcpIHtcbiAgICBsZXQgY29weSA9IG5ldyBSZWdFeHAocmVnZXgsICdnJyk7XG4gICAgbGV0IG1hdGNoO1xuICAgIHdoaWxlIChtYXRjaCA9IGNvcHkuZXhlYyh0YXJnZXQpKVxuICAgICAgICB5aWVsZCBtYXRjaDtcbn1cbiIsImltcG9ydCB6bGliIGZyb20gXCJ6bGliXCI7XG5cbmltcG9ydCBmcyBmcm9tIFwiZnMtZXh0cmFcIjtcbmltcG9ydCByZXF1ZXN0IGZyb20gXCJyZXF1ZXN0LXByb21pc2UtbmF0aXZlXCI7XG5cbmltcG9ydCB7IGVycm9yLCBtYXRjaGVzIH0gZnJvbSBcIi4vdXRpbFwiO1xuaW1wb3J0IHtcbiAgR2FtZVN0YXRlLFxuICBtYXBzLFxuICBIb2xkT3JkZXIsXG4gIFVuaXQsXG4gIE1vdmVPcmRlcixcbiAgU3VwcG9ydE9yZGVyLFxuICBDb252b3lPcmRlcixcbiAgVW5pdFR5cGUsXG59IGZyb20gXCJkaXBsb21hY3ktY29tbW9uXCI7XG5cbmV4cG9ydCB0eXBlIElucHV0cyA9IHsgW3RlYW06IHN0cmluZ106IHN0cmluZ1tdIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHVybiB7XG4gIG9yZGVyczogSW5wdXRzO1xuICByZXRyZWF0cz86IElucHV0cztcbiAgYnVpbGRzPzogSW5wdXRzO1xufVxuXG5jb25zdCBzZXNzaW9uX2tleSA9IGBtbXFjaTV2bWwzZHQ1Z25xNW0wYWRpZ240NmA7XG5cbmFzeW5jIGZ1bmN0aW9uIHBsYXlkaXBsb21hY3kocGF0aDogc3RyaW5nLCBwaHBJZDogc3RyaW5nKSB7XG4gIGxldCB1cmwgPSBgaHR0cHM6Ly93d3cucGxheWRpcGxvbWFjeS5jb20ke3BhdGh9YDtcbiAgdHJ5IHtcbiAgICBsZXQgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0KHVybCwge1xuICAgICAgaGVhZGVyczogeyBjb29raWU6IGBQSFBTRVNTSUQ9JHtwaHBJZH1gIH0sXG4gICAgICByZXNvbHZlV2l0aEZ1bGxSZXNwb25zZTogdHJ1ZSxcbiAgICAgIGZvbGxvd1JlZGlyZWN0OiBmYWxzZSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXNDb2RlICE9IDIwMCkgdGhyb3cgZXJyb3IoXCJpbnZhbGlkIHN0YXR1cyBjb2RlXCIpO1xuICAgIHJldHVybiByZXNwb25zZS5ib2R5O1xuICB9IGNhdGNoIChlKSB7XG4gICAgZGVidWdnZXI7XG4gICAgdGhyb3cgZTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnYW1lX2hpc3RvcnkocXVlcnk6IHN0cmluZywgcGhwSWQpIHtcbiAgbGV0IGNhY2hlID0gYGNhY2hlLyR7cXVlcnl9YDtcblxuICBsZXQgZGF0YTtcbiAgLy8gICB0cnkge1xuICAvLyAgICAgZGF0YSA9IGZzLnJlYWRGaWxlU3luYyhjYWNoZSwgXCJ1dGY4XCIpO1xuICAvLyAgIH0gY2F0Y2ggKGUpIHtcbiAgZGF0YSA9IGF3YWl0IHBsYXlkaXBsb21hY3koYC9nYW1lX2hpc3RvcnkucGhwPyR7cXVlcnl9YCwgcGhwSWQpO1xuICAvLyAgIGF3YWl0IGZzLndyaXRlRmlsZShjYWNoZSwgZGF0YSwgXCJ1dGY4XCIpO1xuICAvLyAgIH1cblxuICByZXR1cm4gZGF0YTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0X2hpc3RvcnkoaWQ6IG51bWJlciwgcGhhc2U6IHN0cmluZywgZGF0ZTogbnVtYmVyLCBwaHBJZCkge1xuICBsZXQgcXVlcnkgPSBgZ2FtZV9pZD0ke2lkfSZwaGFzZT0ke3BoYXNlfSZnZGF0ZT0ke2RhdGV9YDtcbiAgbGV0IGRhdGEgPSBhd2FpdCBnYW1lX2hpc3RvcnkocXVlcnksIHBocElkKTtcblxuICBsZXQgZm91bmQgPSBmYWxzZTtcbiAgbGV0IGlucHV0czogSW5wdXRzID0ge307XG5cbiAgZm9yIChsZXQgbWF0Y2ggb2YgbWF0Y2hlcygvPGI+KFxcdyspPFxcL2I+PHVsPiguKj8pPFxcL3VsPi8sIGRhdGEpKSB7XG4gICAgbGV0IHRlYW0gPSBtYXRjaFsxXTtcbiAgICBsZXQgbGlzdCA9IFtdO1xuXG4gICAgZm9yIChsZXQgcGFydCBvZiBtYXRjaGVzKC88bGk+KC4qPyk8XFwvbGk+LywgbWF0Y2hbMl0pKSB7XG4gICAgICBsaXN0LnB1c2gocGFydFsxXSk7XG4gICAgfVxuICAgIGlmIChsaXN0Lmxlbmd0aCA9PSAwKSBjb250aW51ZTtcblxuICAgIGZvdW5kID0gdHJ1ZTtcbiAgICBpbnB1dHNbdGVhbV0gPSBsaXN0O1xuICB9XG5cbiAgaWYgKGZvdW5kKSByZXR1cm4gaW5wdXRzO1xuXG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRfZ2FtZShpZDogbnVtYmVyLCBwaHBJZCkge1xuICBsZXQgdHVybnMgPSBbXTtcbiAgbGV0IGhpc3RvcnkgPSBhd2FpdCBnYW1lX2hpc3RvcnkoYGdhbWVfaWQ9JHtpZH1gLCBwaHBJZCk7XG5cbiAgZm9yIChsZXQgY29udGVudCBvZiBoaXN0b3J5LnNwbGl0KFwiPC9icj48L2JyPlwiKSkge1xuICAgIGxldCBkYXRlID0gdHVybnMubGVuZ3RoO1xuICAgIGxldCB0dXJuOiBUdXJuID0geyBvcmRlcnM6IHt9IH07XG5cbiAgICBsZXQgZm91bmQgPSBmYWxzZTtcbiAgICBmb3IgKGxldCBtYXRjaCBvZiBtYXRjaGVzKFxuICAgICAgLzxiPjxhIGhyZWY9J2dhbWVfaGlzdG9yeVxcLnBocFxcP2dhbWVfaWQ9KFxcZCspJnBoYXNlPShcXHcpJmdkYXRlPShcXGQrKSc+W148XSs8XFwvYT48XFwvYj4mbmJzcDsmbmJzcDsvLFxuICAgICAgY29udGVudFxuICAgICkpIHtcbiAgICAgIGlmIChpZCAhPSBwYXJzZUludChtYXRjaFsxXSkpXG4gICAgICAgIHRocm93IGVycm9yKGBGYWlsZWQgdG8gcGFyc2UgZ2FtZSBoaXN0b3J5OiAke2lkfWApO1xuICAgICAgaWYgKGRhdGUgIT0gcGFyc2VJbnQobWF0Y2hbM10pKVxuICAgICAgICB0aHJvdyBlcnJvcihgRmFpbGVkIHRvIHBhcnNlIGdhbWUgaGlzdG9yeTogJHtpZH1gKTtcblxuICAgICAgbGV0IHBoYXNlID0gbWF0Y2hbMl07XG4gICAgICBsZXQgaW5wdXRzID0gYXdhaXQgZ2V0X2hpc3RvcnkoaWQsIHBoYXNlLCBkYXRlLCBwaHBJZCk7XG4gICAgICBpZiAoaW5wdXRzID09IG51bGwgJiYgcGhhc2UgIT0gXCJPXCIpIGNvbnRpbnVlO1xuXG4gICAgICBmb3VuZCA9IHRydWU7XG4gICAgICBzd2l0Y2ggKHBoYXNlKSB7XG4gICAgICAgIGNhc2UgXCJPXCI6XG4gICAgICAgICAgdHVybi5vcmRlcnMgPSBpbnB1dHMgfHwge307XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJSXCI6XG4gICAgICAgICAgdHVybi5yZXRyZWF0cyA9IGlucHV0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIkJcIjpcbiAgICAgICAgICB0dXJuLmJ1aWxkcyA9IGlucHV0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoIWZvdW5kKSBjb250aW51ZTtcblxuICAgIHR1cm5zLnB1c2godHVybik7XG4gIH1cblxuICByZXR1cm4gdHVybnM7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRfcGFnZShwYWdlOiBudW1iZXIpIHtcbiAgbGV0IHVybCA9IGAvZ2FtZXMucGhwP3N1YnBhZ2U9YWxsX2ZpbmlzaGVkJnZhcmlhbnQtMD0xJm1hcF92YXJpYW50LTA9MSZjdXJyZW50X3BhZ2U9JHtwYWdlfWA7XG4gIGxldCBkYXRhID0gYXdhaXQgcGxheWRpcGxvbWFjeSh1cmwsIHNlc3Npb25fa2V5KTtcblxuICBsZXQgaWRzID0gbmV3IFNldDxudW1iZXI+KCk7XG4gIGZvciAobGV0IG1hdGNoIG9mIG1hdGNoZXMoXG4gICAgLzxhIGhyZWY9XCJnYW1lX3BsYXlfZGV0YWlsc1xcLnBocFxcP2dhbWVfaWQ9KFxcZCspLyxcbiAgICBkYXRhXG4gICkpIHtcbiAgICBsZXQgZ2FtZUlkID0gcGFyc2VJbnQobWF0Y2hbMV0pO1xuICAgIGlkcy5hZGQoZ2FtZUlkKTtcbiAgfVxuXG4gIHJldHVybiBbLi4uaWRzXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRfZ2FtZShyYXc6IEJ1ZmZlcikge1xuICBsZXQgZGF0YSA9IHpsaWIuZ3VuemlwU3luYyhyYXcpO1xuICBsZXQgZ2FtZSA9IEpTT04ucGFyc2UoZGF0YS50b1N0cmluZyhcInV0ZjhcIikpIGFzIFR1cm5bXTtcblxuICBmb3IgKGxldCB0dXJuIG9mIGdhbWUpIHtcbiAgICBpZiAodHVybi5idWlsZHMgJiYgT2JqZWN0LmtleXModHVybi5idWlsZHMpLmxlbmd0aCA9PSAwKSB7XG4gICAgICBkZWxldGUgdHVybi5idWlsZHM7XG4gICAgfVxuICAgIGlmICh0dXJuLnJldHJlYXRzICYmIE9iamVjdC5rZXlzKHR1cm4ucmV0cmVhdHMpLmxlbmd0aCA9PSAwKSB7XG4gICAgICBkZWxldGUgdHVybi5yZXRyZWF0cztcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKHR1cm4ub3JkZXJzKS5sZW5ndGggPT0gMCkge1xuICAgICAgLy8gc29tZXRpbWVzIGdhbWVzIGhhdmUgYW4gZW1wdHkgbGFzdCB0dXJuIHdpdGggbm8gb3JkZXJzXG4gICAgICBpZiAodHVybi5idWlsZHMgfHwgdHVybi5yZXRyZWF0cyB8fCBnYW1lLmluZGV4T2YodHVybikgKyAxICE9IGdhbWUubGVuZ3RoKVxuICAgICAgICB0aHJvdyBlcnJvcihgbWlzc2luZyBvcmRlcnM6ICR7Z2FtZS5pbmRleE9mKHR1cm4pfWApO1xuICAgICAgZ2FtZS5wb3AoKTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBnYW1lO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd3JpdGVfZ2FtZSh0dXJuczogVHVybltdKSB7XG4gIGxldCBkYXRhID0gQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkodHVybnMpLCBcInV0ZjhcIik7XG4gIHJldHVybiB6bGliLmd6aXBTeW5jKGRhdGEpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcnVuKCkge1xuICBmcy5ta2RpcnBTeW5jKFwiZGF0YVwiKTtcbiAgZnMubWtkaXJwU3luYyhcImNhY2hlXCIpO1xuXG4gIGxldCBlcnJvcnMgPSAwO1xuICBsZXQgb2xkS25vd247XG4gIGxldCBuZXdLbm93biA9IHsgbmV3ZXN0OiAwLCBjb3VudDogMCB9O1xuICB0cnkge1xuICAgIG9sZEtub3duID0gZnMucmVhZEpTT05TeW5jKFwiZGF0YS9rbm93bi5qc29uXCIpIGFzIHR5cGVvZiBuZXdLbm93bjtcbiAgICBjb25zb2xlLmxvZyhga25vd246ICR7b2xkS25vd24ubmV3ZXN0fSArJHtvbGRLbm93bi5jb3VudH1gKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIG9sZEtub3duID0gbnVsbDtcbiAgfVxuXG4gIGxldCBza2lwID0gMDtcbiAgZm9yIChsZXQgaSA9IDE7IGkgPD0gMTAwMCAmJiBlcnJvcnMgPCAxMDsgKytpKSB7XG4gICAgaWYgKHNraXAgPj0gMTUpIHtcbiAgICAgIHNraXAgLT0gMTU7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhgZmV0Y2hpbmcgcGFnZSAke2l9YCk7XG4gICAgbGV0IGlkcyA9IGF3YWl0IGdldF9wYWdlKGkpO1xuXG4gICAgZm9yIChsZXQgaWQgb2YgaWRzKSB7XG4gICAgICBpZiAobmV3S25vd24ubmV3ZXN0ID09IDApIG5ld0tub3duLm5ld2VzdCA9IGlkO1xuXG4gICAgICBpZiAob2xkS25vd24gJiYgaWQgPT0gb2xkS25vd24ubmV3ZXN0KSB7XG4gICAgICAgIHNraXAgPSBvbGRLbm93bi5jb3VudDtcbiAgICAgICAgbmV3S25vd24uY291bnQgKz0gb2xkS25vd24uY291bnQ7XG4gICAgICAgIG9sZEtub3duID0gbnVsbDtcbiAgICAgIH1cblxuICAgICAgaWYgKHNraXAgPj0gMSkge1xuICAgICAgICBza2lwIC09IDE7XG4gICAgICAgIGNvbnNvbGUubG9nKGBza2lwcGluZyBnYW1lICR7aWR9YCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZyhgZmV0Y2hpbmcgZ2FtZSAke2lkfWApO1xuICAgICAgdHJ5IHtcbiAgICAgICAgbGV0IG91dHB1dEZpbGUgPSBgZGF0YS8ke2lkfWA7XG4gICAgICAgIGlmICghZnMucGF0aEV4aXN0c1N5bmMob3V0cHV0RmlsZSkpIHtcbiAgICAgICAgICBsZXQgZ2FtZSA9IGF3YWl0IGdldF9nYW1lKGlkLCBzZXNzaW9uX2tleSk7XG4gICAgICAgICAgbGV0IGRhdGEgPSB3cml0ZV9nYW1lKGdhbWUpO1xuICAgICAgICAgIGxldCBwYXJzZWQgPSByZWFkX2dhbWUoZGF0YSk7XG5cbiAgICAgICAgICBpZiAoSlNPTi5zdHJpbmdpZnkocGFyc2VkKSAhPSBKU09OLnN0cmluZ2lmeShnYW1lKSlcbiAgICAgICAgICAgIHRocm93IGVycm9yKFwiZ2FtZSBlbmNvZGluZyBmYWlsZWRcIik7XG5cbiAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKG91dHB1dEZpbGUsIGRhdGEpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVycm9ycyA9PSAwKSB7XG4gICAgICAgICAgKytuZXdLbm93bi5jb3VudDtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICArK2Vycm9ycztcbiAgICAgICAgZnMuYXBwZW5kRmlsZVN5bmMoXCJlcnJvcnMudHh0XCIsIGAke2lkfSAke2V9YCwgXCJ1dGY4XCIpO1xuICAgICAgICBjb25zb2xlLmVycm9yKGlkLCBlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAob2xkS25vd24gPT0gbnVsbCkge1xuICAgICAgZnMud3JpdGVKU09OU3luYyhcImRhdGEva25vd24uanNvblwiLCBuZXdLbm93bik7XG4gICAgICBjb25zb2xlLmxvZyhga25vd246ICR7bmV3S25vd24ubmV3ZXN0fSArJHtuZXdLbm93bi5jb3VudH1gKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNoZWNrKCkge1xuICBmcy5ta2RpcnBTeW5jKFwiZGF0YVwiKTtcbiAgZnMubWtkaXJwU3luYyhcImNhY2hlXCIpO1xuXG4gIGxldCBjb3VudCA9IDA7XG4gIGxldCBhbGxJZHMgPSBmcy5yZWFkZGlyU3luYyhcImRhdGFcIik7XG5cbiAgZm9yIChsZXQgaWQgb2YgYWxsSWRzKSB7XG4gICAgaWYgKGlkID09IFwia25vd24uanNvblwiKSBjb250aW51ZTtcblxuICAgIGxldCBnYW1lID0gcmVhZF9nYW1lKGZzLnJlYWRGaWxlU3luYyhgZGF0YS8ke2lkfWApKTtcblxuICAgIGxldCB0dXJucyA9IDA7XG4gICAgbGV0IGhpc3RvcnkgPSBhd2FpdCBnYW1lX2hpc3RvcnkoYGdhbWVfaWQ9JHtpZH1gLCBzZXNzaW9uX2tleSk7XG5cbiAgICBmb3IgKGxldCBjb250ZW50IG9mIGhpc3Rvcnkuc3BsaXQoXCI8L2JyPjwvYnI+XCIpKSB7XG4gICAgICBsZXQgZm91bmQgPSBmYWxzZTtcbiAgICAgIGZvciAobGV0IF8gb2YgbWF0Y2hlcyhcbiAgICAgICAgLzxiPjxhIGhyZWY9J2dhbWVfaGlzdG9yeVxcLnBocFxcP2dhbWVfaWQ9KFxcZCspJnBoYXNlPShcXHcpJmdkYXRlPShcXGQrKSc+W148XSs8XFwvYT48XFwvYj4mbmJzcDsmbmJzcDsvLFxuICAgICAgICBjb250ZW50XG4gICAgICApKSB7XG4gICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGlmICghZm91bmQpIGNvbnRpbnVlO1xuICAgICAgKyt0dXJucztcbiAgICB9XG5cbiAgICBpZiAodHVybnMgIT0gZ2FtZS5sZW5ndGgpIHtcbiAgICAgIGdhbWUgPSBhd2FpdCBnZXRfZ2FtZShwYXJzZUludChpZCksIHNlc3Npb25fa2V5KTtcbiAgICAgIGlmICh0dXJucyAhPSBnYW1lLmxlbmd0aCkge1xuICAgICAgICB0aHJvdyBlcnJvcihgTWlzbWF0Y2g6ICR7aWR9ICR7dHVybnN9ICR7Z2FtZS5sZW5ndGh9YCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgbGV0IGJ1aWxkcyA9IDA7XG4gICAgbGV0IHJldHJlYXRzID0gMDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGdhbWUubGVuZ3RoOyArK2kpIHtcbiAgICAgIGlmIChnYW1lW2ldLmJ1aWxkcykgYnVpbGRzKys7XG4gICAgICBpZiAoZ2FtZVtpXS5yZXRyZWF0cykgcmV0cmVhdHMrKztcbiAgICB9XG5cbiAgICBpZiAoYnVpbGRzID09IDAgJiYgcmV0cmVhdHMgPT0gMCkge1xuICAgICAgZ2FtZSA9IGF3YWl0IGdldF9nYW1lKHBhcnNlSW50KGlkKSwgc2Vzc2lvbl9rZXkpO1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGAkeygrK2NvdW50KS50b1N0cmluZygpLnBhZFN0YXJ0KGFsbElkcy5sZW5ndGgudG9TdHJpbmcoKS5sZW5ndGgpfSAvICR7XG4gICAgICAgICAgYWxsSWRzLmxlbmd0aFxuICAgICAgICB9ICR7aWR9ICR7dHVybnN9ICpgXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYCR7KCsrY291bnQpLnRvU3RyaW5nKCkucGFkU3RhcnQoYWxsSWRzLmxlbmd0aC50b1N0cmluZygpLmxlbmd0aCl9IC8gJHtcbiAgICAgICAgICBhbGxJZHMubGVuZ3RoXG4gICAgICAgIH0gJHtpZH0gJHt0dXJuc31gXG4gICAgICApO1xuICAgIH1cblxuICAgIGxldCBkYXRhID0gd3JpdGVfZ2FtZShnYW1lKTtcbiAgICBmcy53cml0ZUZpbGVTeW5jKGBkYXRhLyR7aWR9YCwgZGF0YSk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlX29yZGVycyhnYW1lOiBHYW1lU3RhdGUsIGlucHV0czogSW5wdXRzKSB7XG4gIGxldCBpc05ldyA9IGdhbWUudW5pdHMuc2l6ZSA9PSAwO1xuICBsZXQgZmxlZXRzID0gbmV3IFNldChbXG4gICAgbWFwcy5zdGFuZGFyZC5yZWdpb25zLkxPTixcbiAgICBtYXBzLnN0YW5kYXJkLnJlZ2lvbnMuRURJLFxuICAgIG1hcHMuc3RhbmRhcmQucmVnaW9ucy5CUkUsXG4gICAgbWFwcy5zdGFuZGFyZC5yZWdpb25zLk5BUCxcbiAgICBtYXBzLnN0YW5kYXJkLnJlZ2lvbnMuS0lFLFxuICAgIG1hcHMuc3RhbmRhcmQucmVnaW9ucy5UUkksXG4gICAgbWFwcy5zdGFuZGFyZC5yZWdpb25zLkFOSyxcbiAgICBtYXBzLnN0YW5kYXJkLnJlZ2lvbnMuU0VWLFxuICAgIG1hcHMuc3RhbmRhcmQucmVnaW9ucy5TVFBfU09VVEgsXG4gIF0pO1xuXG4gIGxldCBvcmRlcnMgPSBbXTtcbiAgbGV0IHJlc29sdmVkID0gW107XG5cbiAgZm9yIChsZXQgdGVhbSBpbiBpbnB1dHMpIHtcbiAgICBmb3IgKGxldCByYXcgb2YgaW5wdXRzW3RlYW1dKSB7XG4gICAgICBsZXQgbWF0Y2ggPSAvKC4qPykoSE9MRHxNT1ZFfFNVUFBPUlR8Q09OVk9ZKSguKiktPiguKikvLmV4ZWMocmF3KTtcbiAgICAgIGlmIChtYXRjaCA9PSBudWxsKSB0aHJvdyBlcnJvcihgZmFpbGVkIHRvIG1hdGNoIG9yZGVyOiAke3Jhd31gKTtcblxuICAgICAgbGV0IHJlZ2lvbk5hbWUgPSBtYXRjaFsxXS50cmltKCk7XG4gICAgICBsZXQgb3AgPSBtYXRjaFsyXTtcbiAgICAgIGxldCBhcmdzID0gbWF0Y2hbM10udHJpbSgpO1xuICAgICAgbGV0IHJlc3VsdCA9IG1hdGNoWzRdLnRyaW0oKTtcblxuICAgICAgaWYgKHJlc3VsdCA9PSBcIkludmFsaWQgb3JkZXIgb3Igc3ludGF4IGVycm9yXCIpIGNvbnRpbnVlO1xuXG4gICAgICBsZXQgcmVnaW9uID0gZ2FtZS5tYXAucmVnaW9ucy5maW5kKChyKSA9PiByLm5hbWUgPT0gcmVnaW9uTmFtZSk7XG4gICAgICBpZiAocmVnaW9uID09IG51bGwpXG4gICAgICAgIHRocm93IGVycm9yKGBmYWlsZWQgdG8gZmluZCByZWdpb24gZm9yIG9yZGVyOiAke3Jhd30gYCk7XG5cbiAgICAgIGxldCB1bml0ID0gWy4uLmdhbWUudW5pdHNdLmZpbmQoXG4gICAgICAgICh1KSA9PiB1LnJlZ2lvbiA9PSByZWdpb24gJiYgdS50ZWFtID09IHRlYW1cbiAgICAgICk7XG4gICAgICBpZiAodW5pdCA9PSBudWxsKSB7XG4gICAgICAgIGlmIChpc05ldylcbiAgICAgICAgICBnYW1lLnVuaXRzLmFkZChcbiAgICAgICAgICAgICh1bml0ID0gbmV3IFVuaXQoXG4gICAgICAgICAgICAgIHJlZ2lvbixcbiAgICAgICAgICAgICAgZmxlZXRzLmhhcyhyZWdpb24pID8gVW5pdFR5cGUuV2F0ZXIgOiBVbml0VHlwZS5MYW5kLFxuICAgICAgICAgICAgICB0ZWFtXG4gICAgICAgICAgICApKVxuICAgICAgICAgICk7XG4gICAgICAgIGVsc2UgdGhyb3cgZXJyb3IoYFVuaXQgZG9lcyBub3QgZXhpc3Q6ICR7dGVhbX0gJHtyZWdpb24ubmFtZX0gYCk7XG4gICAgICB9XG5cbiAgICAgIGxldCBvcmRlcjtcblxuICAgICAgaWYgKG9wID09IFwiSE9MRFwiIHx8IHJlc3VsdCA9PSBcIklsbGVnYWwgb3JkZXIgcmVwbGFjZWQgd2l0aCBIb2xkIG9yZGVyXCIpIHtcbiAgICAgICAgb3JkZXIgPSBuZXcgSG9sZE9yZGVyKHVuaXQpO1xuICAgICAgfSBlbHNlIGlmIChvcCA9PSBcIk1PVkVcIikge1xuICAgICAgICBsZXQgbW92ZUFyZ3MgPSBhcmdzLnNwbGl0KFwiVklBXCIpO1xuXG4gICAgICAgIGxldCByYXdUYXJnZXQgPSBtb3ZlQXJnc1swXS50cmltKCk7XG4gICAgICAgIGxldCB0YXJnZXQgPSBtYXBzLnN0YW5kYXJkLm1hcC5yZWdpb25zLmZpbmQoKHIpID0+IHIubmFtZSA9PSByYXdUYXJnZXQpO1xuICAgICAgICBpZiAodGFyZ2V0ID09IG51bGwpXG4gICAgICAgICAgdGhyb3cgZXJyb3IoYGZhaWxlZCB0byBmaW5kIHRhcmdldCByZWdpb24gZm9yIG1vdmUgb3JkZXI6ICR7YXJnc30gYCk7XG5cbiAgICAgICAgb3JkZXIgPSBuZXcgTW92ZU9yZGVyKHVuaXQsIHRhcmdldCwgbW92ZUFyZ3MubGVuZ3RoID4gMSk7XG4gICAgICAgIGlmIChyZXN1bHQgPT0gXCJyZXNvbHZlZFwiKSB7XG4gICAgICAgICAgcmVzb2x2ZWQucHVzaChvcmRlcik7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAob3AgPT0gXCJTVVBQT1JUXCIpIHtcbiAgICAgICAgbGV0IFtyYXdTcmMsIHJhd0RzdF0gPSBhcmdzLnNwbGl0KFwiIHRvIFwiKTsgLy8gJ1ggdG8gaG9sZCcgb3IgJ1ggdG8gWSdcblxuICAgICAgICBsZXQgc3JjID0gbWFwcy5zdGFuZGFyZC5tYXAucmVnaW9ucy5maW5kKChyKSA9PiByLm5hbWUgPT0gcmF3U3JjKTtcbiAgICAgICAgaWYgKHNyYyA9PSBudWxsKVxuICAgICAgICAgIHRocm93IGVycm9yKFxuICAgICAgICAgICAgYGZhaWxlZCB0byBmaW5kIHRhcmdldCByZWdpb24gZm9yIHN1cHBvcnQgb3JkZXI6ICR7cmF3U3JjfSBgXG4gICAgICAgICAgKTtcblxuICAgICAgICBpZiAocmF3RHN0ID09IFwiaG9sZFwiKSBvcmRlciA9IG5ldyBTdXBwb3J0T3JkZXIodW5pdCwgc3JjKTtcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgbGV0IGRzdCA9IG1hcHMuc3RhbmRhcmQubWFwLnJlZ2lvbnMuZmluZCgocikgPT4gci5uYW1lID09IHJhd0RzdCk7XG4gICAgICAgICAgaWYgKGRzdCA9PSBudWxsKVxuICAgICAgICAgICAgdGhyb3cgZXJyb3IoXG4gICAgICAgICAgICAgIGBmYWlsZWQgdG8gZmluZCBhdHRhY2sgcmVnaW9uIGZvciBzdXBwb3J0IG9yZGVyOiAke3Jhd0RzdH0gYFxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgIG9yZGVyID0gbmV3IFN1cHBvcnRPcmRlcih1bml0LCBzcmMsIGRzdCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAob3AgPT0gXCJDT05WT1lcIikge1xuICAgICAgICBsZXQgW3Jhd1NyYywgcmF3RHN0XSA9IGFyZ3Muc3BsaXQoXCIgdG8gXCIpOyAvLyAnWCB0byBZJ1xuXG4gICAgICAgIGxldCBzcmMgPSBtYXBzLnN0YW5kYXJkLm1hcC5yZWdpb25zLmZpbmQoKHIpID0+IHIubmFtZSA9PSByYXdTcmMpO1xuICAgICAgICBpZiAoc3JjID09IG51bGwpXG4gICAgICAgICAgdGhyb3cgZXJyb3IoXG4gICAgICAgICAgICBgZmFpbGVkIHRvIGZpbmQgc3RhcnQgcmVnaW9uIGZvciBjb252b3kgb3JkZXI6ICR7cmF3U3JjfSBgXG4gICAgICAgICAgKTtcblxuICAgICAgICBsZXQgZHN0ID0gbWFwcy5zdGFuZGFyZC5tYXAucmVnaW9ucy5maW5kKChyKSA9PiByLm5hbWUgPT0gcmF3RHN0KTtcbiAgICAgICAgaWYgKGRzdCA9PSBudWxsKVxuICAgICAgICAgIHRocm93IGVycm9yKGBmYWlsZWQgdG8gZmluZCBlbmQgcmVnaW9uIGZvciBjb252b3kgb3JkZXI6ICR7cmF3RHN0fSBgKTtcblxuICAgICAgICBvcmRlciA9IG5ldyBDb252b3lPcmRlcih1bml0LCBzcmMsIGRzdCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcihgaW52YWxpZCBvcmRlcjogJHtvcH1gKTtcbiAgICAgIH1cblxuICAgICAgb3JkZXJzLnB1c2gob3JkZXIpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IG9yZGVycywgcmVzb2x2ZWQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlX3JldHJlYXRzKGV2aWN0ZWQ6IFVuaXRbXSwgaW5wdXRzOiBJbnB1dHMpIHtcbiAgbGV0IHJldHJlYXRzID0gW107XG5cbiAgZm9yIChsZXQgdGVhbSBpbiBpbnB1dHMpIHtcbiAgICBmb3IgKGxldCByYXcgb2YgaW5wdXRzW3RlYW1dKSB7XG4gICAgICBsZXQgbWF0Y2ggPSAvKCguKilSRVRSRUFUKC4qKXwoLiopREVTVFJPWSlcXHMrLT4oLiopLy5leGVjKHJhdyk7XG4gICAgICBpZiAobWF0Y2ggPT0gbnVsbCkgdGhyb3cgZXJyb3IoYGZhaWxlZCB0byBtYXRjaCByZXRyZWF0OiAke3Jhd30gYCk7XG5cbiAgICAgIGxldCByZXN1bHQgPSBtYXRjaFs1XS50cmltKCk7XG4gICAgICBpZiAobWF0Y2hbMl0pIHtcbiAgICAgICAgbGV0IHJhd1NyYyA9IG1hdGNoWzJdLnRyaW0oKTtcbiAgICAgICAgbGV0IHJhd0RzdCA9IG1hdGNoWzNdLnRyaW0oKTtcblxuICAgICAgICBsZXQgc3JjID0gbWFwcy5zdGFuZGFyZC5tYXAucmVnaW9ucy5maW5kKChyKSA9PiByLm5hbWUgPT0gcmF3U3JjKTtcbiAgICAgICAgaWYgKHNyYyA9PSBudWxsKVxuICAgICAgICAgIHRocm93IGVycm9yKGBmYWlsZWQgdG8gZmluZCByZWdpb24gZm9yIHJldHJlYXQ6ICR7cmF3fWApO1xuXG4gICAgICAgIGxldCBkc3QgPSBtYXBzLnN0YW5kYXJkLm1hcC5yZWdpb25zLmZpbmQoKHIpID0+IHIubmFtZSA9PSByYXdEc3QpO1xuICAgICAgICBpZiAoZHN0ID09IG51bGwpXG4gICAgICAgICAgdGhyb3cgZXJyb3IoYGZhaWxlZCB0byBmaW5kIHJlZ2lvbiBmb3IgcmV0cmVhdDogJHtyYXd9YCk7XG5cbiAgICAgICAgbGV0IHVuaXQgPSBldmljdGVkLmZpbmQoKHUpID0+IHUucmVnaW9uID09IHNyYyAmJiB1LnRlYW0gPT0gdGVhbSk7XG4gICAgICAgIGlmICh1bml0ID09IG51bGwpXG4gICAgICAgICAgdGhyb3cgZXJyb3IoYGZhaWxlZCB0byBmaW5kIHVuaXQgZm9yIHJldHJlYXQ6ICR7cmF3fSAke3RlYW19YCk7XG5cbiAgICAgICAgcmV0cmVhdHMucHVzaCh7IHVuaXQsIHRhcmdldDogZHN0LCByZXNvbHZlZDogcmVzdWx0ID09IFwicmVzb2x2ZWRcIiB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxldCByYXdSZWdpb24gPSBtYXRjaFs0XS50cmltKCk7XG5cbiAgICAgICAgbGV0IHJlZ2lvbiA9IG1hcHMuc3RhbmRhcmQubWFwLnJlZ2lvbnMuZmluZCgocikgPT4gci5uYW1lID09IHJhd1JlZ2lvbik7XG4gICAgICAgIGlmIChyZWdpb24gPT0gbnVsbClcbiAgICAgICAgICB0aHJvdyBlcnJvcihgZmFpbGVkIHRvIGZpbmQgcmVnaW9uIGZvciByZXRyZWF0OiAke3Jhd31gKTtcblxuICAgICAgICBsZXQgdW5pdCA9IFsuLi5ldmljdGVkXS5maW5kKFxuICAgICAgICAgICh1KSA9PiB1LnJlZ2lvbiA9PSByZWdpb24gJiYgdS50ZWFtID09IHRlYW1cbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHVuaXQgPT0gbnVsbClcbiAgICAgICAgICB0aHJvdyBlcnJvcihgZmFpbGVkIHRvIGZpbmQgdW5pdCBmb3IgcmV0cmVhdDogJHtyYXd9ICR7dGVhbX1gKTtcblxuICAgICAgICByZXRyZWF0cy5wdXNoKHsgdW5pdCwgdGFyZ2V0OiBudWxsLCByZXNvbHZlZDogcmVzdWx0ID09IFwicmVzb2x2ZWRcIiB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmV0cmVhdHM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZV9idWlsZHMoZ2FtZTogR2FtZVN0YXRlLCBpbnB1dHM6IElucHV0cykge1xuICBsZXQgYnVpbGRzID0gW107XG5cbiAgZm9yIChsZXQgdGVhbSBpbiBpbnB1dHMpIHtcbiAgICBmb3IgKGxldCByYXcgb2YgaW5wdXRzW3RlYW1dKSB7XG4gICAgICBsZXQgbWF0Y2ggPSAvKEJVSUxEXFxzKyhmbGVldHxhcm15KVxccysoLiopfCguKilERVNUUk9ZKVxccystPiguKikvLmV4ZWMoXG4gICAgICAgIHJhd1xuICAgICAgKTtcbiAgICAgIGlmIChtYXRjaCA9PSBudWxsKSB0aHJvdyBlcnJvcihgZmFpbGVkIHRvIG1hdGNoIGJ1aWxkOiAke3Jhd31gKTtcblxuICAgICAgbGV0IHJlc3VsdCA9IG1hdGNoWzVdLnRyaW0oKTtcblxuICAgICAgaWYgKG1hdGNoWzJdKSB7XG4gICAgICAgIGxldCB0eXBlID0gbWF0Y2hbMl0udHJpbSgpO1xuICAgICAgICBsZXQgcmF3UmVnaW9uID0gbWF0Y2hbM10udHJpbSgpO1xuXG4gICAgICAgIGxldCByZWdpb24gPSBtYXBzLnN0YW5kYXJkLm1hcC5yZWdpb25zLmZpbmQoKHIpID0+IHIubmFtZSA9PSByYXdSZWdpb24pO1xuICAgICAgICBpZiAocmVnaW9uID09IG51bGwpXG4gICAgICAgICAgdGhyb3cgZXJyb3IoYGZhaWxlZCB0byBmaW5kIHJlZ2lvbiBmb3IgYnVpbGQ6ICR7cmF3fWApO1xuXG4gICAgICAgIGxldCB1bml0ID0gbmV3IFVuaXQoXG4gICAgICAgICAgcmVnaW9uLFxuICAgICAgICAgIHR5cGUgPT0gXCJmbGVldFwiID8gVW5pdFR5cGUuV2F0ZXIgOiBVbml0VHlwZS5MYW5kLFxuICAgICAgICAgIHRlYW1cbiAgICAgICAgKTtcblxuICAgICAgICBidWlsZHMucHVzaCh7IHVuaXQsIHJlc29sdmVkOiByZXN1bHQgPT0gXCJyZXNvbHZlZFwiIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGV0IHJhd1JlZ2lvbiA9IG1hdGNoWzRdLnRyaW0oKTtcblxuICAgICAgICBsZXQgcmVnaW9uID0gbWFwcy5zdGFuZGFyZC5tYXAucmVnaW9ucy5maW5kKChyKSA9PiByLm5hbWUgPT0gcmF3UmVnaW9uKTtcbiAgICAgICAgaWYgKHJlZ2lvbiA9PSBudWxsKVxuICAgICAgICAgIHRocm93IGVycm9yKGBmYWlsZWQgdG8gZmluZCByZWdpb24gZm9yIGJ1aWxkOiAke3Jhd31gKTtcblxuICAgICAgICBsZXQgdW5pdCA9IFsuLi5nYW1lLnVuaXRzXS5maW5kKFxuICAgICAgICAgICh1KSA9PiB1LnJlZ2lvbiA9PSByZWdpb24gJiYgdS50ZWFtID09IHRlYW1cbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHVuaXQgPT0gbnVsbCkge1xuICAgICAgICAgIGlmIChyZXN1bHQgIT0gXCJyZXNvbHZlZFwiKSBjb250aW51ZTtcbiAgICAgICAgICBlbHNlIHRocm93IGVycm9yKGBmYWlsZWQgdG8gZmluZCB1bml0IGZvciBidWlsZDogJHtyYXd9ICR7dGVhbX1gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGJ1aWxkcy5wdXNoKHsgdW5pdCwgcmVzb2x2ZWQ6IHJlc3VsdCA9PSBcInJlc29sdmVkXCIgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJ1aWxkcztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoR2FtZURhdGEoKSB7XG4gIC8vIGdldCBnYW1lIGhpc3RvcnkgcGhhc2UgT1xuICBjb25zdCBpbnB1dHMgPSBhd2FpdCBnZXRfaGlzdG9yeSgyMjEwNTMsIFwiT1wiLCAwLCBzZXNzaW9uX2tleSk7XG4gIGNvbnNvbGUubG9nKGlucHV0cyk7XG4gIGZzLndyaXRlRmlsZVN5bmMoXCJnYW1lLWRhdGEuanNvblwiLCBKU09OLnN0cmluZ2lmeShpbnB1dHMsIG51bGwsIDIpKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoU2luZ2xlR2FtZShpZDogbnVtYmVyLCBwaHBJZCA9IHNlc3Npb25fa2V5KSB7XG4gIGNvbnN0IGdhbWUgPSBhd2FpdCBnZXRfZ2FtZShpZCwgcGhwSWQpO1xuICBsZXQgZGF0YSA9IHdyaXRlX2dhbWUoZ2FtZSk7XG4gIGxldCBwYXJzZWQgPSByZWFkX2dhbWUoZGF0YSk7XG5cbiAgcmV0dXJuIHBhcnNlZDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFNlc3Npb25LZXkoKSB7XG4gIGNvbnNvbGUubG9nKFwiZ2V0IHNlc3Npb24ga2V5XCIpO1xuICBjb25zdCBvcHRpb25zID0ge1xuICAgIHVyaTogXCJodHRwczovL3d3dy5wbGF5ZGlwbG9tYWN5LmNvbVwiLFxuICAgIHJlc29sdmVXaXRoRnVsbFJlc3BvbnNlOiB0cnVlLCAvLyBOZWVkZWQgdG8gZ2V0IHRoZSBmdWxsIHJlc3BvbnNlIGluY2x1ZGluZyBoZWFkZXJzXG4gICAgc2ltcGxlOiBmYWxzZSwgLy8gUHJldmVudHMgdGhyb3dpbmcgYW4gZXJyb3Igb24gbm9uLTJ4eCByZXNwb25zZXNcbiAgfTtcblxuICB0cnkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdChvcHRpb25zKTtcbiAgICAvLyBUaGUgc2Vzc2lvbiBrZXkgd2lsbCBiZSBpbiB0aGUgJ3NldC1jb29raWUnIGhlYWRlclxuICAgIGNvbnN0IGNvb2tpZXMgPSByZXNwb25zZS5oZWFkZXJzW1wic2V0LWNvb2tpZVwiXTtcbiAgICBsZXQgc2Vzc2lvbktleSA9IG51bGw7XG5cbiAgICAvLyBTZWFyY2ggZm9yIHRoZSBQSFBTRVNTSUQgY29va2llXG4gICAgaWYgKGNvb2tpZXMpIHtcbiAgICAgIGNvb2tpZXMuZm9yRWFjaCgoY29va2llKSA9PiB7XG4gICAgICAgIGlmIChjb29raWUuc3RhcnRzV2l0aChcIlBIUFNFU1NJRD1cIikpIHtcbiAgICAgICAgICBzZXNzaW9uS2V5ID0gY29va2llLnNwbGl0KFwiO1wiKVswXS5zcGxpdChcIj1cIilbMV07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmIChzZXNzaW9uS2V5KSB7XG4gICAgICBjb25zb2xlLmxvZyhcIlNlc3Npb24gS2V5OlwiLCBzZXNzaW9uS2V5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coXCJTZXNzaW9uIEtleSBub3QgZm91bmRcIik7XG4gICAgfVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6XCIsIGVyci5tZXNzYWdlKTtcbiAgfVxufVxuIiwiaW1wb3J0IGZzIGZyb20gXCJmc1wiO1xuXG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xuXG5pbXBvcnQge1xuICBHYW1lU3RhdGUsXG4gIG1hcHMsXG4gIEhvbGRPcmRlcixcbiAgcmVzb2x2ZSxcbiAgVW5pdCxcbiAgTW92ZU9yZGVyLFxuICBTdXBwb3J0T3JkZXIsXG4gIENvbnZveU9yZGVyLFxuICBVbml0VHlwZSxcbiAgZm9ybWF0dGVyLFxufSBmcm9tIFwiZGlwbG9tYWN5LWNvbW1vblwiO1xuXG5pbXBvcnQgKiBhcyBzY3JhcGUgZnJvbSBcIi4vc2NyYXBlXCI7XG5pbXBvcnQgeyBlcnJvciB9IGZyb20gXCIuL3V0aWxcIjtcblxuY29uc3QgaWdub3JlZF9nYW1lcyA9IG5ldyBTZXQoW1xuICAxNTA1NTEsIC8vIEZhbGwgMTkwNSBpbmNvcnJlY3QganVkZ2VtZW50XG4gIDE1MjA0NiwgLy8gRmFsbCAxOTA0IGludmFsaWQgYnVpbGQvZGVzdHJveSBpbnB1dHNcbiAgMTUzMTA0LCAvLyBTcHJpbmcgMTkwNSByZXRyZWF0IHRvIG9jY3VwaWVkIG11bmljaCAoUEFSU0lORyBFUlJPUiwgc2hvdWxkIGhhdmUgaWdub3JlZCBzcHJpbmcgMTkwNSByZXRyZWF0IGJlY2F1c2UgaXQgd2FzIG5vdCBjb25jbHVkZWQpXG4gIDE1MzMyMywgLy8gRmFsbCAxOTAzIGludmFsaWQgYnVpbGQvZGVzdHJveSBpbnB1dHNcbiAgMTUzMzQ5LCAvLyBGYWxsIDE5MDQgaW52YWxpZCBidWlsZC9kZXN0cm95IGlucHV0c1xuICAxNTQyNDIsIC8vIEZhbGwgMTkwNCBpbnZhbGlkIGJ1aWxkL2Rlc3Ryb3kgaW5wdXRzXG4gIDE1NDk0NCwgLy8gRmFsbCAxOTAyIGludmFsaWQgYnVpbGQvZGVzdHJveSBpbnB1dHNcbiAgMTU1NDIyLCAvLyBTcHJpbmcgMTkwMyBlbmdsaXNoIGZsZWV0IGluIGlyaXNoIHNlYSBiZWNvbWVzIGl0YWxpYW5cbiAgMTQxOTMxLCAvLyBTcHJpbmcgMTkwMSBpbnZhbGlkIG9yZGVyIGlucHV0c1xuICAxNDM1MDUsIC8vIFNwcmluZyAxOTA0IHR1cmtpc2ggZmxlZXQgaW4gYWVnZWFuIHNlYSBiZWNvbWVzIGF1c3RyaWFuXG4gIDE0NDU4MiwgLy8gU3ByaW5nIDE5MTMgZnJlbmNoIGZsZWV0IGluIGtpZWwgYmVjb21lcyBydXNzaWFuXG4gIDEzOTQ2MCwgLy8gaWRla1xuICAxMzk4MTUsIC8vIFNwcmluZyAxOTE0IHNwYWluXG4gIDE0MTI3NywgLy8gRmFsbCAxOTAxIG1lc3NlZCB1cCBjb252b3kgc3R1ZmZcbiAgMTQyNTgwLCAvLyBGYWxsIDE5MDIgVmVuY2llIG1vdmUgVHVzY2FueSBmYWlscyBmb3Igbm8gcmVhc29uXG4gIDE0NDgyNSwgLy8gRmFsbCAxOTA4IEJ1cmd1bmR5IG1vdmUgTXVuaWNoIGZhaWxzIGZvciBubyByZWFzb25cbiAgMTQ1NjQ1LCAvLyBGYWxsIDE5MDQgQnVpbGQgZmxlZXQgU3QuIFBldGVyc2J1cmcgaXMgYWN0dWFsbHkgYW4gYXJteVxuICAxNDc1MjEsIC8vIFNwcmluZyAxOTA2IFJldHJlYXQgRW5nbGlzaCBmbGVldCBpbiBzdC4gcGV0ZXJzYnVyZyBiZWNvbWVzIHJ1c3NpYW5cbiAgMTQ5MjgwLCAvLyBGYWxsIDE5MDQgQnVpbGQgZGVzdHJveSBmb3JlaWduIHVuaXRcbiAgMTQ5ODcxLCAvLyBGYWxsIDE5MDEgbWVzc2VkIHVwIGNvbnZveSBzdHVmZlxuICAxNDk4OTAsIC8vIEZhbGwgMTkwNiBpbnZhbGlkIGJ1aWxkL2Rlc3Ryb3kgaW5wdXRzXG5dKTtcbmNvbnN0IHRlYW1zID0gbmV3IFNldChbXG4gIFwiRU5HTEFORFwiLFxuICBcIkZSQU5DRVwiLFxuICBcIkdFUk1BTllcIixcbiAgXCJJVEFMWVwiLFxuICBcIkFVU1RSSUFcIixcbiAgXCJSVVNTSUFcIixcbiAgXCJUVVJLRVlcIixcbl0pO1xuXG5jb25zdCB0b3RhbHMgPSB7IGNoZWNrZWQ6IDAsIHNraXBwZWRfdmlhOiAwLCBza2lwcGVkX3RlYW06IDAgfTtcblxuZnVuY3Rpb24gcnVuX2dhbWUoaWQ6IG51bWJlciwgdHVybnM6IHNjcmFwZS5UdXJuW10pIHtcbiAgbGV0IGdhbWUgPSBuZXcgR2FtZVN0YXRlKG1hcHMuc3RhbmRhcmQubWFwLCBbXSk7XG5cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCB0dXJucy5sZW5ndGg7ICsraSkge1xuICAgIGNvbnNvbGUuZGVidWcoXG4gICAgICBgcHJvY2Vzc2luZyAke2kgJSAyID8gXCJmYWxsXCIgOiBcInNwcmluZ1wifSAkezE5MDEgKyBNYXRoLmZsb29yKGkgLyAyKX1gXG4gICAgKTtcblxuICAgIGxldCByZW1vdGUgPSBzY3JhcGUucGFyc2Vfb3JkZXJzKGdhbWUsIHR1cm5zW2ldLm9yZGVycyk7XG4gICAgbGV0IG9yZGVycyA9IHJlbW90ZS5vcmRlcnMuc2xpY2UoKTtcblxuICAgIGlmIChvcmRlcnMuZmluZCgobykgPT4gby50eXBlID09IFwibW92ZVwiICYmIG8ucmVxdWlyZUNvbnZveSkpIHtcbiAgICAgICsrdG90YWxzLnNraXBwZWRfdmlhO1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGBza2lwcGluZyAke2lkfSAtIGZvdW5kIFZJQSBDT05WT1kgKCR7dG90YWxzLnNraXBwZWRfdmlhfSB0b3RhbClgXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCB4ID0gWy4uLmdhbWUudW5pdHNdLmZpbmQoKHUpID0+ICF0ZWFtcy5oYXModS50ZWFtKSk7XG4gICAgaWYgKHgpIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBgc2tpcHBpbmcgJHtpZH0gLSBmb3VuZCB0ZWFtICR7eC50ZWFtfSAoJHt0b3RhbHMuc2tpcHBlZF90ZWFtfSB0b3RhbClgXG4gICAgICApO1xuICAgICAgKyt0b3RhbHMuc2tpcHBlZF90ZWFtO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGZvciAobGV0IHVuaXQgb2YgZ2FtZS51bml0cykge1xuICAgICAgbGV0IG9yZGVyID0gb3JkZXJzLmZpbmQoKG8pID0+IG8udW5pdCA9PSB1bml0KTtcbiAgICAgIGlmIChvcmRlcikgY29udGludWU7XG4gICAgICBvcmRlcnMucHVzaChuZXcgSG9sZE9yZGVyKHVuaXQpKTtcbiAgICB9XG5cbiAgICBsZXQgbG9jYWwgPSByZXNvbHZlKG9yZGVycyk7XG5cbiAgICBmb3IgKGxldCBtb3ZlIG9mIGxvY2FsLnJlc29sdmVkKSB7XG4gICAgICBpZiAoIWdhbWUudW5pdHMuaGFzKG1vdmUudW5pdCkpIGRlYnVnZ2VyO1xuICAgICAgZ2FtZS51bml0cy5kZWxldGUobW92ZS51bml0KTtcbiAgICAgIGdhbWUudW5pdHMuYWRkKG5ldyBVbml0KG1vdmUudGFyZ2V0LCBtb3ZlLnVuaXQudHlwZSwgbW92ZS51bml0LnRlYW0pKTtcbiAgICB9XG5cbiAgICBmb3IgKGxldCBvcmRlciBvZiBvcmRlcnMpIHtcbiAgICAgIGlmIChvcmRlci50eXBlID09IFwibW92ZVwiKSB7XG4gICAgICAgIGlmIChsb2NhbC5yZXNvbHZlZC5pbmNsdWRlcyhvcmRlcikgIT0gcmVtb3RlLnJlc29sdmVkLmluY2x1ZGVzKG9yZGVyKSkge1xuICAgICAgICAgIGZvciAobGV0IHBhaXIgb2YgbG9jYWwucmVhc29ucykge1xuICAgICAgICAgICAgY29uc29sZS5sb2coYCR7cGFpclswXX06ICR7cGFpclsxXX1gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc29sZS5sb2cob3JkZXIpO1xuICAgICAgICAgIGRlYnVnZ2VyO1xuICAgICAgICAgIHJlc29sdmUob3JkZXJzKTtcbiAgICAgICAgICB0aHJvdyBlcnJvcihgTWlzbWF0Y2ggaW4gZ2FtZSAke2lkfWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGxvY2FsLmV2aWN0ZWQubGVuZ3RoKSB7XG4gICAgICBsZXQgZXZpY3RlZCA9IG5ldyBTZXQobG9jYWwuZXZpY3RlZCk7XG4gICAgICBsZXQgcmV0cmVhdHMgPSBzY3JhcGUucGFyc2VfcmV0cmVhdHMobG9jYWwuZXZpY3RlZCwgdHVybnNbaV0ucmV0cmVhdHMhKTtcbiAgICAgIGZvciAobGV0IHJldHJlYXQgb2YgcmV0cmVhdHMpIHtcbiAgICAgICAgaWYgKHJldHJlYXQucmVzb2x2ZWQpIHtcbiAgICAgICAgICBpZiAocmV0cmVhdC50YXJnZXQpIGdhbWUubW92ZShyZXRyZWF0LnVuaXQsIHJldHJlYXQudGFyZ2V0KTtcbiAgICAgICAgICBlbHNlIGdhbWUudW5pdHMuZGVsZXRlKHJldHJlYXQudW5pdCk7XG4gICAgICAgICAgZXZpY3RlZC5kZWxldGUocmV0cmVhdC51bml0KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgZm9yIChsZXQgdW5pdCBvZiBldmljdGVkKSB7XG4gICAgICAgIGdhbWUudW5pdHMuZGVsZXRlKHVuaXQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChpICUgMiA9PSAxKSB7XG4gICAgICBsZXQgYnVpbGRzID0gc2NyYXBlLnBhcnNlX2J1aWxkcyhnYW1lLCB0dXJuc1tpXS5idWlsZHMhKTtcblxuICAgICAgZm9yIChsZXQgYnVpbGQgb2YgYnVpbGRzKSB7XG4gICAgICAgIGlmIChidWlsZC5yZXNvbHZlZCkge1xuICAgICAgICAgIGlmIChnYW1lLnVuaXRzLmhhcyhidWlsZC51bml0KSkgZ2FtZS51bml0cy5kZWxldGUoYnVpbGQudW5pdCk7XG4gICAgICAgICAgZWxzZSBnYW1lLnVuaXRzLmFkZChidWlsZC51bml0KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAobGV0IHJlZ2lvbiBvZiBnYW1lLm1hcC5yZWdpb25zKSB7XG4gICAgICBsZXQgdW5pdHMgPSBbLi4uZ2FtZS51bml0c10uZmlsdGVyKCh1KSA9PiB1LnJlZ2lvbiA9PSByZWdpb24pO1xuICAgICAgaWYgKHVuaXRzLmxlbmd0aCA+IDEpIHRocm93IGVycm9yKGBNaXNtYXRjaCBpbiBnYW1lICR7aWR9YCk7XG4gICAgfVxuXG4gICAgaWYgKGkgPT09IHR1cm5zLmxlbmd0aCAtIDEpIHtcbiAgICAgIGNvbnNvbGUubG9nKFwid3JpdGluZyB0byBmaWxlXCIpO1xuICAgICAgY29uc3QgbmV3VW5pdHMgPSBBcnJheS5mcm9tKGdhbWUudW5pdHMpO1xuXG4gICAgICBjb25zdCBmb2xkZXJQYXRoID0gcGF0aC5qb2luKF9fZGlybmFtZSwgXCIuLi8uLi93ZWJhcHAvc3JjL2RhdGFcIik7XG5cbiAgICAgIGZzLndyaXRlRmlsZVN5bmMoXG4gICAgICAgIGZvbGRlclBhdGggKyBcIi9maW5hbC1zdGF0ZS5qc29uXCIsXG4gICAgICAgIEpTT04uc3RyaW5naWZ5KG5ld1VuaXRzLCBudWxsLCAyKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICArK3RvdGFscy5jaGVja2VkO1xufVxuXG4vLyBhc3luYyBmdW5jdGlvbiBydW4oKSB7XG4vLyAgIGZzLm1rZGlycFN5bmMoXCJkYXRhXCIpO1xuLy8gICBmcy5ta2RpcnBTeW5jKFwiY2FjaGVcIik7XG5cbi8vICAgLy8gcnVuX2dhbWUoMTUwMTY4LCBzY3JhcGUucmVhZF9nYW1lKGZzLnJlYWRGaWxlU3luYygnZGF0YS8xNTAxNjgnKSkpO1xuXG4vLyAgIGxldCBhbGxJZHMgPSBmcy5yZWFkZGlyU3luYyhcImRhdGFcIik7XG5cbi8vICAgZm9yIChsZXQgaWQgb2YgYWxsSWRzKSB7XG4vLyAgICAgaWYgKGlkID09IFwia25vd24uanNvblwiKSBjb250aW51ZTtcbi8vICAgICBpZiAoaWdub3JlZF9nYW1lcy5oYXMocGFyc2VJbnQoaWQpKSkgY29udGludWU7XG5cbi8vICAgICBjb25zb2xlLmxvZyhgcHJvY2Vzc2luZyBnYW1lICR7aWR9YCk7XG5cbi8vICAgICBsZXQgZ2FtZSA9IHNjcmFwZS5yZWFkX2dhbWUoZnMucmVhZEZpbGVTeW5jKGBkYXRhLyR7aWR9YCkpO1xuLy8gICAgIHJ1bl9nYW1lKHBhcnNlSW50KGlkKSwgZ2FtZSk7XG4vLyAgIH1cblxuLy8gICBjb25zb2xlLmxvZyh0b3RhbHMpO1xuLy8gfVxuXG5sZXQgeCA9IGdsb2JhbCBhcyBhbnk7XG5pZiAoeC5kZXZ0b29sc0Zvcm1hdHRlcnMgPT0gbnVsbCkgeC5kZXZ0b29sc0Zvcm1hdHRlcnMgPSBbXTtcbnguZGV2dG9vbHNGb3JtYXR0ZXJzLnB1c2goZm9ybWF0dGVyKTtcblxubGV0IG9wID0gcHJvY2Vzcy5hcmd2WzJdO1xuXG5jb25zdCBNWV9HQU1FX0lEID0gMjIxMDUzO1xuXG5pZiAob3AgPT0gXCJzY3JhcGVcIikgc2NyYXBlLnJ1bigpO1xuZWxzZSBpZiAob3AgPT0gXCJjaGVja1wiKSBzY3JhcGUuY2hlY2soKTtcbi8vIGVsc2UgaWYgKG9wID09IFwicnVuXCIpIHJ1bigpO1xuZWxzZSBpZiAob3AgPT0gXCJmZXRjaFwiKSBzY3JhcGUuZmV0Y2hHYW1lRGF0YSgpO1xuLy8gZWxzZSBpZiAob3AgPT0gXCJ0ZXN0XCIpIHNjcmFwZS5mZXRjaFNpbmdsZUdhbWUoTVlfR0FNRV9JRCk7XG5lbHNlIGlmIChvcCA9PSBcImtleVwiKSBzY3JhcGUuZ2V0U2Vzc2lvbktleSgpO1xuZWxzZSBpZiAob3AgPT0gXCJ0ZXN0XCIpIHtcbiAgY29uc3QgdHVybnMgPSBzY3JhcGUuZmV0Y2hTaW5nbGVHYW1lKE1ZX0dBTUVfSUQpO1xuICB0dXJucy50aGVuKChyZXMpID0+IHtcbiAgICBjb25zdCBnYW1lRmluYWwgPSBydW5fZ2FtZShNWV9HQU1FX0lELCByZXMpO1xuICAgIC8vIGNvbnNvbGUubG9nKGdhbWVGaW5hbCk7XG4gIH0pO1xufSBlbHNlIHtcbiAgY29uc29sZS5sb2coXCJ1bmtub3duIG9yIG1pc3NpbmcgY29tbWFuZFwiKTtcbn1cblxuLy8gbW9kdWxlLmV4cG9ydHMucnVuRnVuY3Rpb24gPSBmdW5jdGlvbiAocGhwS2V5KSB7XG4vLyAgIGNvbnN0IHR1cm5zID0gc2NyYXBlLmZldGNoU2luZ2xlR2FtZShNWV9HQU1FX0lELCBwaHBLZXkpO1xuLy8gICB0dXJucy50aGVuKChyZXMpID0+IHtcbi8vICAgICBjb25zdCBnYW1lRmluYWwgPSBydW5fZ2FtZShNWV9HQU1FX0lELCByZXMpO1xuLy8gICB9KTtcbi8vIH07XG5cbmNvbnN0IHJ1bkZ1bmN0aW9uID0gZnVuY3Rpb24gKHBocEtleSkge1xuICBjb25zdCB0dXJucyA9IHNjcmFwZS5mZXRjaFNpbmdsZUdhbWUoTVlfR0FNRV9JRCwgcGhwS2V5KTtcbiAgdHVybnMudGhlbigocmVzKSA9PiB7XG4gICAgY29uc3QgZ2FtZUZpbmFsID0gcnVuX2dhbWUoTVlfR0FNRV9JRCwgcmVzKTtcbiAgfSk7XG59O1xuXG5leHBvcnQgeyBydW5GdW5jdGlvbiB9O1xuIl0sIm5hbWVzIjpbImZzIiwibWFwcyIsIlVuaXQiLCJVbml0VHlwZSIsIkhvbGRPcmRlciIsIk1vdmVPcmRlciIsIlN1cHBvcnRPcmRlciIsIkNvbnZveU9yZGVyIiwiR2FtZVN0YXRlIiwic2NyYXBlLnBhcnNlX29yZGVycyIsInJlc29sdmUiLCJzY3JhcGUucGFyc2VfcmV0cmVhdHMiLCJzY3JhcGUucGFyc2VfYnVpbGRzIiwiZm9ybWF0dGVyIiwic2NyYXBlLnJ1biIsInNjcmFwZS5jaGVjayIsInNjcmFwZS5mZXRjaEdhbWVEYXRhIiwic2NyYXBlLmdldFNlc3Npb25LZXkiLCJzY3JhcGUuZmV0Y2hTaW5nbGVHYW1lIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O1NBQWdCLEtBQUssQ0FBQyxHQUFXO0lBQzdCLFNBQVM7SUFDVCxPQUFPLElBQUksS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0NBQ3pCO0FBRUQsVUFBaUIsT0FBTyxDQUFDLEtBQWEsRUFBRSxNQUFjO0lBQ2xELElBQUksSUFBSSxHQUFHLElBQUksTUFBTSxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNsQyxJQUFJLEtBQUssQ0FBQztJQUNWLE9BQU8sS0FBSyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO1FBQzVCLE1BQU0sS0FBSyxDQUFDO0NBQ25COztB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
