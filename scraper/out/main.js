'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var fs = _interopDefault(require('fs-extra'));
var path = _interopDefault(require('path'));
var diplomacyCommon = require('diplomacy-common');
var zlib = _interopDefault(require('zlib'));
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

const session_key = `vh015aq42h2g2htjikrlgf0ar2`;
function playdiplomacy(path) {
    return __awaiter(this, void 0, void 0, function* () {
        let url = `https://www.playdiplomacy.com${path}`;
        try {
            let response = yield request(url, {
                headers: { cookie: `PHPSESSID=${session_key}` },
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
function game_history(query) {
    return __awaiter(this, void 0, void 0, function* () {
        let data;
        //   try {
        //     data = fs.readFileSync(cache, "utf8");
        //   } catch (e) {
        data = yield playdiplomacy(`/game_history.php?${query}`);
        //   await fs.writeFile(cache, data, "utf8");
        //   }
        return data;
    });
}
function get_history(id, phase, date) {
    return __awaiter(this, void 0, void 0, function* () {
        let query = `game_id=${id}&phase=${phase}&gdate=${date}`;
        let data = yield game_history(query);
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
function get_game(id) {
    return __awaiter(this, void 0, void 0, function* () {
        let turns = [];
        let history = yield game_history(`game_id=${id}`);
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
                let inputs = yield get_history(id, phase, date);
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
        let data = yield playdiplomacy(url);
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
        fs.mkdirpSync("data");
        fs.mkdirpSync("cache");
        let errors = 0;
        let oldKnown;
        let newKnown = { newest: 0, count: 0 };
        try {
            oldKnown = fs.readJSONSync("data/known.json");
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
                    if (!fs.pathExistsSync(outputFile)) {
                        let game = yield get_game(id);
                        let data = write_game(game);
                        let parsed = read_game(data);
                        if (JSON.stringify(parsed) != JSON.stringify(game))
                            throw error("game encoding failed");
                        fs.writeFileSync(outputFile, data);
                    }
                    if (errors == 0) {
                        ++newKnown.count;
                    }
                }
                catch (e) {
                    ++errors;
                    fs.appendFileSync("errors.txt", `${id} ${e}`, "utf8");
                    console.error(id, e);
                }
            }
            if (oldKnown == null) {
                fs.writeJSONSync("data/known.json", newKnown);
                console.log(`known: ${newKnown.newest} +${newKnown.count}`);
            }
        }
    });
}
function check() {
    return __awaiter(this, void 0, void 0, function* () {
        fs.mkdirpSync("data");
        fs.mkdirpSync("cache");
        let count = 0;
        let allIds = fs.readdirSync("data");
        for (let id of allIds) {
            if (id == "known.json")
                continue;
            let game = read_game(fs.readFileSync(`data/${id}`));
            let turns = 0;
            let history = yield game_history(`game_id=${id}`);
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
                game = yield get_game(parseInt(id));
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
                game = yield get_game(parseInt(id));
                console.log(`${(++count).toString().padStart(allIds.length.toString().length)} / ${allIds.length} ${id} ${turns} *`);
            }
            else {
                console.log(`${(++count).toString().padStart(allIds.length.toString().length)} / ${allIds.length} ${id} ${turns}`);
            }
            let data = write_game(game);
            fs.writeFileSync(`data/${id}`, data);
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
        const inputs = yield get_history(221053, "O", 0);
        console.log(inputs);
        fs.writeFileSync("game-data.json", JSON.stringify(inputs, null, 2));
    });
}
function fetchSingleGame(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const game = yield get_game(id);
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

const ignored_games = new Set([
    150551,
    152046,
    153104,
    153323,
    153349,
    154242,
    154944,
    155422,
    141931,
    143505,
    144582,
    139460,
    139815,
    141277,
    142580,
    144825,
    145645,
    147521,
    149280,
    149871,
    149890,
]);
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
function run$1() {
    return __awaiter(this, void 0, void 0, function* () {
        fs.mkdirpSync("data");
        fs.mkdirpSync("cache");
        // run_game(150168, scrape.read_game(fs.readFileSync('data/150168')));
        let allIds = fs.readdirSync("data");
        for (let id of allIds) {
            if (id == "known.json")
                continue;
            if (ignored_games.has(parseInt(id)))
                continue;
            console.log(`processing game ${id}`);
            let game = read_game(fs.readFileSync(`data/${id}`));
            run_game(parseInt(id), game);
        }
        console.log(totals);
    });
}
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
else if (op == "run")
    run$1();
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsiLi4vc3JjL3V0aWwudHMiLCIuLi9zcmMvc2NyYXBlLnRzIiwiLi4vc3JjL21haW4udHMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGZ1bmN0aW9uIGVycm9yKG1zZzogc3RyaW5nKSB7XG4gICAgZGVidWdnZXI7XG4gICAgcmV0dXJuIG5ldyBFcnJvcihtc2cpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24qIG1hdGNoZXMocmVnZXg6IFJlZ0V4cCwgdGFyZ2V0OiBzdHJpbmcpIHtcbiAgICBsZXQgY29weSA9IG5ldyBSZWdFeHAocmVnZXgsICdnJyk7XG4gICAgbGV0IG1hdGNoO1xuICAgIHdoaWxlIChtYXRjaCA9IGNvcHkuZXhlYyh0YXJnZXQpKVxuICAgICAgICB5aWVsZCBtYXRjaDtcbn1cbiIsImltcG9ydCB6bGliIGZyb20gXCJ6bGliXCI7XG5cbmltcG9ydCBmcyBmcm9tIFwiZnMtZXh0cmFcIjtcbmltcG9ydCByZXF1ZXN0IGZyb20gXCJyZXF1ZXN0LXByb21pc2UtbmF0aXZlXCI7XG5cbmltcG9ydCB7IGVycm9yLCBtYXRjaGVzIH0gZnJvbSBcIi4vdXRpbFwiO1xuaW1wb3J0IHtcbiAgR2FtZVN0YXRlLFxuICBtYXBzLFxuICBIb2xkT3JkZXIsXG4gIFVuaXQsXG4gIE1vdmVPcmRlcixcbiAgU3VwcG9ydE9yZGVyLFxuICBDb252b3lPcmRlcixcbiAgVW5pdFR5cGUsXG59IGZyb20gXCJkaXBsb21hY3ktY29tbW9uXCI7XG5cbmV4cG9ydCB0eXBlIElucHV0cyA9IHsgW3RlYW06IHN0cmluZ106IHN0cmluZ1tdIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHVybiB7XG4gIG9yZGVyczogSW5wdXRzO1xuICByZXRyZWF0cz86IElucHV0cztcbiAgYnVpbGRzPzogSW5wdXRzO1xufVxuXG5jb25zdCBzZXNzaW9uX2tleSA9IGB2aDAxNWFxNDJoMmcyaHRqaWtybGdmMGFyMmA7XG5cbmFzeW5jIGZ1bmN0aW9uIHBsYXlkaXBsb21hY3kocGF0aDogc3RyaW5nKSB7XG4gIGxldCB1cmwgPSBgaHR0cHM6Ly93d3cucGxheWRpcGxvbWFjeS5jb20ke3BhdGh9YDtcbiAgdHJ5IHtcbiAgICBsZXQgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0KHVybCwge1xuICAgICAgaGVhZGVyczogeyBjb29raWU6IGBQSFBTRVNTSUQ9JHtzZXNzaW9uX2tleX1gIH0sXG4gICAgICByZXNvbHZlV2l0aEZ1bGxSZXNwb25zZTogdHJ1ZSxcbiAgICAgIGZvbGxvd1JlZGlyZWN0OiBmYWxzZSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXNDb2RlICE9IDIwMCkgdGhyb3cgZXJyb3IoXCJpbnZhbGlkIHN0YXR1cyBjb2RlXCIpO1xuICAgIHJldHVybiByZXNwb25zZS5ib2R5O1xuICB9IGNhdGNoIChlKSB7XG4gICAgZGVidWdnZXI7XG4gICAgdGhyb3cgZTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnYW1lX2hpc3RvcnkocXVlcnk6IHN0cmluZykge1xuICBsZXQgY2FjaGUgPSBgY2FjaGUvJHtxdWVyeX1gO1xuXG4gIGxldCBkYXRhO1xuICAvLyAgIHRyeSB7XG4gIC8vICAgICBkYXRhID0gZnMucmVhZEZpbGVTeW5jKGNhY2hlLCBcInV0ZjhcIik7XG4gIC8vICAgfSBjYXRjaCAoZSkge1xuICBkYXRhID0gYXdhaXQgcGxheWRpcGxvbWFjeShgL2dhbWVfaGlzdG9yeS5waHA/JHtxdWVyeX1gKTtcbiAgLy8gICBhd2FpdCBmcy53cml0ZUZpbGUoY2FjaGUsIGRhdGEsIFwidXRmOFwiKTtcbiAgLy8gICB9XG5cbiAgcmV0dXJuIGRhdGE7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldF9oaXN0b3J5KGlkOiBudW1iZXIsIHBoYXNlOiBzdHJpbmcsIGRhdGU6IG51bWJlcikge1xuICBsZXQgcXVlcnkgPSBgZ2FtZV9pZD0ke2lkfSZwaGFzZT0ke3BoYXNlfSZnZGF0ZT0ke2RhdGV9YDtcbiAgbGV0IGRhdGEgPSBhd2FpdCBnYW1lX2hpc3RvcnkocXVlcnkpO1xuXG4gIGxldCBmb3VuZCA9IGZhbHNlO1xuICBsZXQgaW5wdXRzOiBJbnB1dHMgPSB7fTtcblxuICBmb3IgKGxldCBtYXRjaCBvZiBtYXRjaGVzKC88Yj4oXFx3Kyk8XFwvYj48dWw+KC4qPyk8XFwvdWw+LywgZGF0YSkpIHtcbiAgICBsZXQgdGVhbSA9IG1hdGNoWzFdO1xuICAgIGxldCBsaXN0ID0gW107XG5cbiAgICBmb3IgKGxldCBwYXJ0IG9mIG1hdGNoZXMoLzxsaT4oLio/KTxcXC9saT4vLCBtYXRjaFsyXSkpIHtcbiAgICAgIGxpc3QucHVzaChwYXJ0WzFdKTtcbiAgICB9XG4gICAgaWYgKGxpc3QubGVuZ3RoID09IDApIGNvbnRpbnVlO1xuXG4gICAgZm91bmQgPSB0cnVlO1xuICAgIGlucHV0c1t0ZWFtXSA9IGxpc3Q7XG4gIH1cblxuICBpZiAoZm91bmQpIHJldHVybiBpbnB1dHM7XG5cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldF9nYW1lKGlkOiBudW1iZXIpIHtcbiAgbGV0IHR1cm5zID0gW107XG4gIGxldCBoaXN0b3J5ID0gYXdhaXQgZ2FtZV9oaXN0b3J5KGBnYW1lX2lkPSR7aWR9YCk7XG5cbiAgZm9yIChsZXQgY29udGVudCBvZiBoaXN0b3J5LnNwbGl0KFwiPC9icj48L2JyPlwiKSkge1xuICAgIGxldCBkYXRlID0gdHVybnMubGVuZ3RoO1xuICAgIGxldCB0dXJuOiBUdXJuID0geyBvcmRlcnM6IHt9IH07XG5cbiAgICBsZXQgZm91bmQgPSBmYWxzZTtcbiAgICBmb3IgKGxldCBtYXRjaCBvZiBtYXRjaGVzKFxuICAgICAgLzxiPjxhIGhyZWY9J2dhbWVfaGlzdG9yeVxcLnBocFxcP2dhbWVfaWQ9KFxcZCspJnBoYXNlPShcXHcpJmdkYXRlPShcXGQrKSc+W148XSs8XFwvYT48XFwvYj4mbmJzcDsmbmJzcDsvLFxuICAgICAgY29udGVudFxuICAgICkpIHtcbiAgICAgIGlmIChpZCAhPSBwYXJzZUludChtYXRjaFsxXSkpXG4gICAgICAgIHRocm93IGVycm9yKGBGYWlsZWQgdG8gcGFyc2UgZ2FtZSBoaXN0b3J5OiAke2lkfWApO1xuICAgICAgaWYgKGRhdGUgIT0gcGFyc2VJbnQobWF0Y2hbM10pKVxuICAgICAgICB0aHJvdyBlcnJvcihgRmFpbGVkIHRvIHBhcnNlIGdhbWUgaGlzdG9yeTogJHtpZH1gKTtcblxuICAgICAgbGV0IHBoYXNlID0gbWF0Y2hbMl07XG4gICAgICBsZXQgaW5wdXRzID0gYXdhaXQgZ2V0X2hpc3RvcnkoaWQsIHBoYXNlLCBkYXRlKTtcbiAgICAgIGlmIChpbnB1dHMgPT0gbnVsbCAmJiBwaGFzZSAhPSBcIk9cIikgY29udGludWU7XG5cbiAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgIHN3aXRjaCAocGhhc2UpIHtcbiAgICAgICAgY2FzZSBcIk9cIjpcbiAgICAgICAgICB0dXJuLm9yZGVycyA9IGlucHV0cyB8fCB7fTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIlJcIjpcbiAgICAgICAgICB0dXJuLnJldHJlYXRzID0gaW5wdXRzO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiQlwiOlxuICAgICAgICAgIHR1cm4uYnVpbGRzID0gaW5wdXRzO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghZm91bmQpIGNvbnRpbnVlO1xuXG4gICAgdHVybnMucHVzaCh0dXJuKTtcbiAgfVxuXG4gIHJldHVybiB0dXJucztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldF9wYWdlKHBhZ2U6IG51bWJlcikge1xuICBsZXQgdXJsID0gYC9nYW1lcy5waHA/c3VicGFnZT1hbGxfZmluaXNoZWQmdmFyaWFudC0wPTEmbWFwX3ZhcmlhbnQtMD0xJmN1cnJlbnRfcGFnZT0ke3BhZ2V9YDtcbiAgbGV0IGRhdGEgPSBhd2FpdCBwbGF5ZGlwbG9tYWN5KHVybCk7XG5cbiAgbGV0IGlkcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICBmb3IgKGxldCBtYXRjaCBvZiBtYXRjaGVzKFxuICAgIC88YSBocmVmPVwiZ2FtZV9wbGF5X2RldGFpbHNcXC5waHBcXD9nYW1lX2lkPShcXGQrKS8sXG4gICAgZGF0YVxuICApKSB7XG4gICAgbGV0IGdhbWVJZCA9IHBhcnNlSW50KG1hdGNoWzFdKTtcbiAgICBpZHMuYWRkKGdhbWVJZCk7XG4gIH1cblxuICByZXR1cm4gWy4uLmlkc107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkX2dhbWUocmF3OiBCdWZmZXIpIHtcbiAgbGV0IGRhdGEgPSB6bGliLmd1bnppcFN5bmMocmF3KTtcbiAgbGV0IGdhbWUgPSBKU09OLnBhcnNlKGRhdGEudG9TdHJpbmcoXCJ1dGY4XCIpKSBhcyBUdXJuW107XG5cbiAgZm9yIChsZXQgdHVybiBvZiBnYW1lKSB7XG4gICAgaWYgKHR1cm4uYnVpbGRzICYmIE9iamVjdC5rZXlzKHR1cm4uYnVpbGRzKS5sZW5ndGggPT0gMCkge1xuICAgICAgZGVsZXRlIHR1cm4uYnVpbGRzO1xuICAgIH1cbiAgICBpZiAodHVybi5yZXRyZWF0cyAmJiBPYmplY3Qua2V5cyh0dXJuLnJldHJlYXRzKS5sZW5ndGggPT0gMCkge1xuICAgICAgZGVsZXRlIHR1cm4ucmV0cmVhdHM7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyh0dXJuLm9yZGVycykubGVuZ3RoID09IDApIHtcbiAgICAgIC8vIHNvbWV0aW1lcyBnYW1lcyBoYXZlIGFuIGVtcHR5IGxhc3QgdHVybiB3aXRoIG5vIG9yZGVyc1xuICAgICAgaWYgKHR1cm4uYnVpbGRzIHx8IHR1cm4ucmV0cmVhdHMgfHwgZ2FtZS5pbmRleE9mKHR1cm4pICsgMSAhPSBnYW1lLmxlbmd0aClcbiAgICAgICAgdGhyb3cgZXJyb3IoYG1pc3Npbmcgb3JkZXJzOiAke2dhbWUuaW5kZXhPZih0dXJuKX1gKTtcbiAgICAgIGdhbWUucG9wKCk7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZ2FtZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdyaXRlX2dhbWUodHVybnM6IFR1cm5bXSkge1xuICBsZXQgZGF0YSA9IEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KHR1cm5zKSwgXCJ1dGY4XCIpO1xuICByZXR1cm4gemxpYi5nemlwU3luYyhkYXRhKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1bigpIHtcbiAgZnMubWtkaXJwU3luYyhcImRhdGFcIik7XG4gIGZzLm1rZGlycFN5bmMoXCJjYWNoZVwiKTtcblxuICBsZXQgZXJyb3JzID0gMDtcbiAgbGV0IG9sZEtub3duO1xuICBsZXQgbmV3S25vd24gPSB7IG5ld2VzdDogMCwgY291bnQ6IDAgfTtcbiAgdHJ5IHtcbiAgICBvbGRLbm93biA9IGZzLnJlYWRKU09OU3luYyhcImRhdGEva25vd24uanNvblwiKSBhcyB0eXBlb2YgbmV3S25vd247XG4gICAgY29uc29sZS5sb2coYGtub3duOiAke29sZEtub3duLm5ld2VzdH0gKyR7b2xkS25vd24uY291bnR9YCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBvbGRLbm93biA9IG51bGw7XG4gIH1cblxuICBsZXQgc2tpcCA9IDA7XG4gIGZvciAobGV0IGkgPSAxOyBpIDw9IDEwMDAgJiYgZXJyb3JzIDwgMTA7ICsraSkge1xuICAgIGlmIChza2lwID49IDE1KSB7XG4gICAgICBza2lwIC09IDE1O1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYGZldGNoaW5nIHBhZ2UgJHtpfWApO1xuICAgIGxldCBpZHMgPSBhd2FpdCBnZXRfcGFnZShpKTtcblxuICAgIGZvciAobGV0IGlkIG9mIGlkcykge1xuICAgICAgaWYgKG5ld0tub3duLm5ld2VzdCA9PSAwKSBuZXdLbm93bi5uZXdlc3QgPSBpZDtcblxuICAgICAgaWYgKG9sZEtub3duICYmIGlkID09IG9sZEtub3duLm5ld2VzdCkge1xuICAgICAgICBza2lwID0gb2xkS25vd24uY291bnQ7XG4gICAgICAgIG5ld0tub3duLmNvdW50ICs9IG9sZEtub3duLmNvdW50O1xuICAgICAgICBvbGRLbm93biA9IG51bGw7XG4gICAgICB9XG5cbiAgICAgIGlmIChza2lwID49IDEpIHtcbiAgICAgICAgc2tpcCAtPSAxO1xuICAgICAgICBjb25zb2xlLmxvZyhgc2tpcHBpbmcgZ2FtZSAke2lkfWApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS5sb2coYGZldGNoaW5nIGdhbWUgJHtpZH1gKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGxldCBvdXRwdXRGaWxlID0gYGRhdGEvJHtpZH1gO1xuICAgICAgICBpZiAoIWZzLnBhdGhFeGlzdHNTeW5jKG91dHB1dEZpbGUpKSB7XG4gICAgICAgICAgbGV0IGdhbWUgPSBhd2FpdCBnZXRfZ2FtZShpZCk7XG4gICAgICAgICAgbGV0IGRhdGEgPSB3cml0ZV9nYW1lKGdhbWUpO1xuICAgICAgICAgIGxldCBwYXJzZWQgPSByZWFkX2dhbWUoZGF0YSk7XG5cbiAgICAgICAgICBpZiAoSlNPTi5zdHJpbmdpZnkocGFyc2VkKSAhPSBKU09OLnN0cmluZ2lmeShnYW1lKSlcbiAgICAgICAgICAgIHRocm93IGVycm9yKFwiZ2FtZSBlbmNvZGluZyBmYWlsZWRcIik7XG5cbiAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKG91dHB1dEZpbGUsIGRhdGEpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVycm9ycyA9PSAwKSB7XG4gICAgICAgICAgKytuZXdLbm93bi5jb3VudDtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICArK2Vycm9ycztcbiAgICAgICAgZnMuYXBwZW5kRmlsZVN5bmMoXCJlcnJvcnMudHh0XCIsIGAke2lkfSAke2V9YCwgXCJ1dGY4XCIpO1xuICAgICAgICBjb25zb2xlLmVycm9yKGlkLCBlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAob2xkS25vd24gPT0gbnVsbCkge1xuICAgICAgZnMud3JpdGVKU09OU3luYyhcImRhdGEva25vd24uanNvblwiLCBuZXdLbm93bik7XG4gICAgICBjb25zb2xlLmxvZyhga25vd246ICR7bmV3S25vd24ubmV3ZXN0fSArJHtuZXdLbm93bi5jb3VudH1gKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNoZWNrKCkge1xuICBmcy5ta2RpcnBTeW5jKFwiZGF0YVwiKTtcbiAgZnMubWtkaXJwU3luYyhcImNhY2hlXCIpO1xuXG4gIGxldCBjb3VudCA9IDA7XG4gIGxldCBhbGxJZHMgPSBmcy5yZWFkZGlyU3luYyhcImRhdGFcIik7XG5cbiAgZm9yIChsZXQgaWQgb2YgYWxsSWRzKSB7XG4gICAgaWYgKGlkID09IFwia25vd24uanNvblwiKSBjb250aW51ZTtcblxuICAgIGxldCBnYW1lID0gcmVhZF9nYW1lKGZzLnJlYWRGaWxlU3luYyhgZGF0YS8ke2lkfWApKTtcblxuICAgIGxldCB0dXJucyA9IDA7XG4gICAgbGV0IGhpc3RvcnkgPSBhd2FpdCBnYW1lX2hpc3RvcnkoYGdhbWVfaWQ9JHtpZH1gKTtcblxuICAgIGZvciAobGV0IGNvbnRlbnQgb2YgaGlzdG9yeS5zcGxpdChcIjwvYnI+PC9icj5cIikpIHtcbiAgICAgIGxldCBmb3VuZCA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgXyBvZiBtYXRjaGVzKFxuICAgICAgICAvPGI+PGEgaHJlZj0nZ2FtZV9oaXN0b3J5XFwucGhwXFw/Z2FtZV9pZD0oXFxkKykmcGhhc2U9KFxcdykmZ2RhdGU9KFxcZCspJz5bXjxdKzxcXC9hPjxcXC9iPiZuYnNwOyZuYnNwOy8sXG4gICAgICAgIGNvbnRlbnRcbiAgICAgICkpIHtcbiAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgaWYgKCFmb3VuZCkgY29udGludWU7XG4gICAgICArK3R1cm5zO1xuICAgIH1cblxuICAgIGlmICh0dXJucyAhPSBnYW1lLmxlbmd0aCkge1xuICAgICAgZ2FtZSA9IGF3YWl0IGdldF9nYW1lKHBhcnNlSW50KGlkKSk7XG4gICAgICBpZiAodHVybnMgIT0gZ2FtZS5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgZXJyb3IoYE1pc21hdGNoOiAke2lkfSAke3R1cm5zfSAke2dhbWUubGVuZ3RofWApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGxldCBidWlsZHMgPSAwO1xuICAgIGxldCByZXRyZWF0cyA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBnYW1lLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAoZ2FtZVtpXS5idWlsZHMpIGJ1aWxkcysrO1xuICAgICAgaWYgKGdhbWVbaV0ucmV0cmVhdHMpIHJldHJlYXRzKys7XG4gICAgfVxuXG4gICAgaWYgKGJ1aWxkcyA9PSAwICYmIHJldHJlYXRzID09IDApIHtcbiAgICAgIGdhbWUgPSBhd2FpdCBnZXRfZ2FtZShwYXJzZUludChpZCkpO1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGAkeygrK2NvdW50KS50b1N0cmluZygpLnBhZFN0YXJ0KGFsbElkcy5sZW5ndGgudG9TdHJpbmcoKS5sZW5ndGgpfSAvICR7XG4gICAgICAgICAgYWxsSWRzLmxlbmd0aFxuICAgICAgICB9ICR7aWR9ICR7dHVybnN9ICpgXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYCR7KCsrY291bnQpLnRvU3RyaW5nKCkucGFkU3RhcnQoYWxsSWRzLmxlbmd0aC50b1N0cmluZygpLmxlbmd0aCl9IC8gJHtcbiAgICAgICAgICBhbGxJZHMubGVuZ3RoXG4gICAgICAgIH0gJHtpZH0gJHt0dXJuc31gXG4gICAgICApO1xuICAgIH1cblxuICAgIGxldCBkYXRhID0gd3JpdGVfZ2FtZShnYW1lKTtcbiAgICBmcy53cml0ZUZpbGVTeW5jKGBkYXRhLyR7aWR9YCwgZGF0YSk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlX29yZGVycyhnYW1lOiBHYW1lU3RhdGUsIGlucHV0czogSW5wdXRzKSB7XG4gIGxldCBpc05ldyA9IGdhbWUudW5pdHMuc2l6ZSA9PSAwO1xuICBsZXQgZmxlZXRzID0gbmV3IFNldChbXG4gICAgbWFwcy5zdGFuZGFyZC5yZWdpb25zLkxPTixcbiAgICBtYXBzLnN0YW5kYXJkLnJlZ2lvbnMuRURJLFxuICAgIG1hcHMuc3RhbmRhcmQucmVnaW9ucy5CUkUsXG4gICAgbWFwcy5zdGFuZGFyZC5yZWdpb25zLk5BUCxcbiAgICBtYXBzLnN0YW5kYXJkLnJlZ2lvbnMuS0lFLFxuICAgIG1hcHMuc3RhbmRhcmQucmVnaW9ucy5UUkksXG4gICAgbWFwcy5zdGFuZGFyZC5yZWdpb25zLkFOSyxcbiAgICBtYXBzLnN0YW5kYXJkLnJlZ2lvbnMuU0VWLFxuICAgIG1hcHMuc3RhbmRhcmQucmVnaW9ucy5TVFBfU09VVEgsXG4gIF0pO1xuXG4gIGxldCBvcmRlcnMgPSBbXTtcbiAgbGV0IHJlc29sdmVkID0gW107XG5cbiAgZm9yIChsZXQgdGVhbSBpbiBpbnB1dHMpIHtcbiAgICBmb3IgKGxldCByYXcgb2YgaW5wdXRzW3RlYW1dKSB7XG4gICAgICBsZXQgbWF0Y2ggPSAvKC4qPykoSE9MRHxNT1ZFfFNVUFBPUlR8Q09OVk9ZKSguKiktPiguKikvLmV4ZWMocmF3KTtcbiAgICAgIGlmIChtYXRjaCA9PSBudWxsKSB0aHJvdyBlcnJvcihgZmFpbGVkIHRvIG1hdGNoIG9yZGVyOiAke3Jhd31gKTtcblxuICAgICAgbGV0IHJlZ2lvbk5hbWUgPSBtYXRjaFsxXS50cmltKCk7XG4gICAgICBsZXQgb3AgPSBtYXRjaFsyXTtcbiAgICAgIGxldCBhcmdzID0gbWF0Y2hbM10udHJpbSgpO1xuICAgICAgbGV0IHJlc3VsdCA9IG1hdGNoWzRdLnRyaW0oKTtcblxuICAgICAgaWYgKHJlc3VsdCA9PSBcIkludmFsaWQgb3JkZXIgb3Igc3ludGF4IGVycm9yXCIpIGNvbnRpbnVlO1xuXG4gICAgICBsZXQgcmVnaW9uID0gZ2FtZS5tYXAucmVnaW9ucy5maW5kKChyKSA9PiByLm5hbWUgPT0gcmVnaW9uTmFtZSk7XG4gICAgICBpZiAocmVnaW9uID09IG51bGwpXG4gICAgICAgIHRocm93IGVycm9yKGBmYWlsZWQgdG8gZmluZCByZWdpb24gZm9yIG9yZGVyOiAke3Jhd30gYCk7XG5cbiAgICAgIGxldCB1bml0ID0gWy4uLmdhbWUudW5pdHNdLmZpbmQoXG4gICAgICAgICh1KSA9PiB1LnJlZ2lvbiA9PSByZWdpb24gJiYgdS50ZWFtID09IHRlYW1cbiAgICAgICk7XG4gICAgICBpZiAodW5pdCA9PSBudWxsKSB7XG4gICAgICAgIGlmIChpc05ldylcbiAgICAgICAgICBnYW1lLnVuaXRzLmFkZChcbiAgICAgICAgICAgICh1bml0ID0gbmV3IFVuaXQoXG4gICAgICAgICAgICAgIHJlZ2lvbixcbiAgICAgICAgICAgICAgZmxlZXRzLmhhcyhyZWdpb24pID8gVW5pdFR5cGUuV2F0ZXIgOiBVbml0VHlwZS5MYW5kLFxuICAgICAgICAgICAgICB0ZWFtXG4gICAgICAgICAgICApKVxuICAgICAgICAgICk7XG4gICAgICAgIGVsc2UgdGhyb3cgZXJyb3IoYFVuaXQgZG9lcyBub3QgZXhpc3Q6ICR7dGVhbX0gJHtyZWdpb24ubmFtZX0gYCk7XG4gICAgICB9XG5cbiAgICAgIGxldCBvcmRlcjtcblxuICAgICAgaWYgKG9wID09IFwiSE9MRFwiIHx8IHJlc3VsdCA9PSBcIklsbGVnYWwgb3JkZXIgcmVwbGFjZWQgd2l0aCBIb2xkIG9yZGVyXCIpIHtcbiAgICAgICAgb3JkZXIgPSBuZXcgSG9sZE9yZGVyKHVuaXQpO1xuICAgICAgfSBlbHNlIGlmIChvcCA9PSBcIk1PVkVcIikge1xuICAgICAgICBsZXQgbW92ZUFyZ3MgPSBhcmdzLnNwbGl0KFwiVklBXCIpO1xuXG4gICAgICAgIGxldCByYXdUYXJnZXQgPSBtb3ZlQXJnc1swXS50cmltKCk7XG4gICAgICAgIGxldCB0YXJnZXQgPSBtYXBzLnN0YW5kYXJkLm1hcC5yZWdpb25zLmZpbmQoKHIpID0+IHIubmFtZSA9PSByYXdUYXJnZXQpO1xuICAgICAgICBpZiAodGFyZ2V0ID09IG51bGwpXG4gICAgICAgICAgdGhyb3cgZXJyb3IoYGZhaWxlZCB0byBmaW5kIHRhcmdldCByZWdpb24gZm9yIG1vdmUgb3JkZXI6ICR7YXJnc30gYCk7XG5cbiAgICAgICAgb3JkZXIgPSBuZXcgTW92ZU9yZGVyKHVuaXQsIHRhcmdldCwgbW92ZUFyZ3MubGVuZ3RoID4gMSk7XG4gICAgICAgIGlmIChyZXN1bHQgPT0gXCJyZXNvbHZlZFwiKSB7XG4gICAgICAgICAgcmVzb2x2ZWQucHVzaChvcmRlcik7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAob3AgPT0gXCJTVVBQT1JUXCIpIHtcbiAgICAgICAgbGV0IFtyYXdTcmMsIHJhd0RzdF0gPSBhcmdzLnNwbGl0KFwiIHRvIFwiKTsgLy8gJ1ggdG8gaG9sZCcgb3IgJ1ggdG8gWSdcblxuICAgICAgICBsZXQgc3JjID0gbWFwcy5zdGFuZGFyZC5tYXAucmVnaW9ucy5maW5kKChyKSA9PiByLm5hbWUgPT0gcmF3U3JjKTtcbiAgICAgICAgaWYgKHNyYyA9PSBudWxsKVxuICAgICAgICAgIHRocm93IGVycm9yKFxuICAgICAgICAgICAgYGZhaWxlZCB0byBmaW5kIHRhcmdldCByZWdpb24gZm9yIHN1cHBvcnQgb3JkZXI6ICR7cmF3U3JjfSBgXG4gICAgICAgICAgKTtcblxuICAgICAgICBpZiAocmF3RHN0ID09IFwiaG9sZFwiKSBvcmRlciA9IG5ldyBTdXBwb3J0T3JkZXIodW5pdCwgc3JjKTtcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgbGV0IGRzdCA9IG1hcHMuc3RhbmRhcmQubWFwLnJlZ2lvbnMuZmluZCgocikgPT4gci5uYW1lID09IHJhd0RzdCk7XG4gICAgICAgICAgaWYgKGRzdCA9PSBudWxsKVxuICAgICAgICAgICAgdGhyb3cgZXJyb3IoXG4gICAgICAgICAgICAgIGBmYWlsZWQgdG8gZmluZCBhdHRhY2sgcmVnaW9uIGZvciBzdXBwb3J0IG9yZGVyOiAke3Jhd0RzdH0gYFxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgIG9yZGVyID0gbmV3IFN1cHBvcnRPcmRlcih1bml0LCBzcmMsIGRzdCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAob3AgPT0gXCJDT05WT1lcIikge1xuICAgICAgICBsZXQgW3Jhd1NyYywgcmF3RHN0XSA9IGFyZ3Muc3BsaXQoXCIgdG8gXCIpOyAvLyAnWCB0byBZJ1xuXG4gICAgICAgIGxldCBzcmMgPSBtYXBzLnN0YW5kYXJkLm1hcC5yZWdpb25zLmZpbmQoKHIpID0+IHIubmFtZSA9PSByYXdTcmMpO1xuICAgICAgICBpZiAoc3JjID09IG51bGwpXG4gICAgICAgICAgdGhyb3cgZXJyb3IoXG4gICAgICAgICAgICBgZmFpbGVkIHRvIGZpbmQgc3RhcnQgcmVnaW9uIGZvciBjb252b3kgb3JkZXI6ICR7cmF3U3JjfSBgXG4gICAgICAgICAgKTtcblxuICAgICAgICBsZXQgZHN0ID0gbWFwcy5zdGFuZGFyZC5tYXAucmVnaW9ucy5maW5kKChyKSA9PiByLm5hbWUgPT0gcmF3RHN0KTtcbiAgICAgICAgaWYgKGRzdCA9PSBudWxsKVxuICAgICAgICAgIHRocm93IGVycm9yKGBmYWlsZWQgdG8gZmluZCBlbmQgcmVnaW9uIGZvciBjb252b3kgb3JkZXI6ICR7cmF3RHN0fSBgKTtcblxuICAgICAgICBvcmRlciA9IG5ldyBDb252b3lPcmRlcih1bml0LCBzcmMsIGRzdCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcihgaW52YWxpZCBvcmRlcjogJHtvcH1gKTtcbiAgICAgIH1cblxuICAgICAgb3JkZXJzLnB1c2gob3JkZXIpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IG9yZGVycywgcmVzb2x2ZWQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlX3JldHJlYXRzKGV2aWN0ZWQ6IFVuaXRbXSwgaW5wdXRzOiBJbnB1dHMpIHtcbiAgbGV0IHJldHJlYXRzID0gW107XG5cbiAgZm9yIChsZXQgdGVhbSBpbiBpbnB1dHMpIHtcbiAgICBmb3IgKGxldCByYXcgb2YgaW5wdXRzW3RlYW1dKSB7XG4gICAgICBsZXQgbWF0Y2ggPSAvKCguKilSRVRSRUFUKC4qKXwoLiopREVTVFJPWSlcXHMrLT4oLiopLy5leGVjKHJhdyk7XG4gICAgICBpZiAobWF0Y2ggPT0gbnVsbCkgdGhyb3cgZXJyb3IoYGZhaWxlZCB0byBtYXRjaCByZXRyZWF0OiAke3Jhd30gYCk7XG5cbiAgICAgIGxldCByZXN1bHQgPSBtYXRjaFs1XS50cmltKCk7XG4gICAgICBpZiAobWF0Y2hbMl0pIHtcbiAgICAgICAgbGV0IHJhd1NyYyA9IG1hdGNoWzJdLnRyaW0oKTtcbiAgICAgICAgbGV0IHJhd0RzdCA9IG1hdGNoWzNdLnRyaW0oKTtcblxuICAgICAgICBsZXQgc3JjID0gbWFwcy5zdGFuZGFyZC5tYXAucmVnaW9ucy5maW5kKChyKSA9PiByLm5hbWUgPT0gcmF3U3JjKTtcbiAgICAgICAgaWYgKHNyYyA9PSBudWxsKVxuICAgICAgICAgIHRocm93IGVycm9yKGBmYWlsZWQgdG8gZmluZCByZWdpb24gZm9yIHJldHJlYXQ6ICR7cmF3fWApO1xuXG4gICAgICAgIGxldCBkc3QgPSBtYXBzLnN0YW5kYXJkLm1hcC5yZWdpb25zLmZpbmQoKHIpID0+IHIubmFtZSA9PSByYXdEc3QpO1xuICAgICAgICBpZiAoZHN0ID09IG51bGwpXG4gICAgICAgICAgdGhyb3cgZXJyb3IoYGZhaWxlZCB0byBmaW5kIHJlZ2lvbiBmb3IgcmV0cmVhdDogJHtyYXd9YCk7XG5cbiAgICAgICAgbGV0IHVuaXQgPSBldmljdGVkLmZpbmQoKHUpID0+IHUucmVnaW9uID09IHNyYyAmJiB1LnRlYW0gPT0gdGVhbSk7XG4gICAgICAgIGlmICh1bml0ID09IG51bGwpXG4gICAgICAgICAgdGhyb3cgZXJyb3IoYGZhaWxlZCB0byBmaW5kIHVuaXQgZm9yIHJldHJlYXQ6ICR7cmF3fSAke3RlYW19YCk7XG5cbiAgICAgICAgcmV0cmVhdHMucHVzaCh7IHVuaXQsIHRhcmdldDogZHN0LCByZXNvbHZlZDogcmVzdWx0ID09IFwicmVzb2x2ZWRcIiB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxldCByYXdSZWdpb24gPSBtYXRjaFs0XS50cmltKCk7XG5cbiAgICAgICAgbGV0IHJlZ2lvbiA9IG1hcHMuc3RhbmRhcmQubWFwLnJlZ2lvbnMuZmluZCgocikgPT4gci5uYW1lID09IHJhd1JlZ2lvbik7XG4gICAgICAgIGlmIChyZWdpb24gPT0gbnVsbClcbiAgICAgICAgICB0aHJvdyBlcnJvcihgZmFpbGVkIHRvIGZpbmQgcmVnaW9uIGZvciByZXRyZWF0OiAke3Jhd31gKTtcblxuICAgICAgICBsZXQgdW5pdCA9IFsuLi5ldmljdGVkXS5maW5kKFxuICAgICAgICAgICh1KSA9PiB1LnJlZ2lvbiA9PSByZWdpb24gJiYgdS50ZWFtID09IHRlYW1cbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHVuaXQgPT0gbnVsbClcbiAgICAgICAgICB0aHJvdyBlcnJvcihgZmFpbGVkIHRvIGZpbmQgdW5pdCBmb3IgcmV0cmVhdDogJHtyYXd9ICR7dGVhbX1gKTtcblxuICAgICAgICByZXRyZWF0cy5wdXNoKHsgdW5pdCwgdGFyZ2V0OiBudWxsLCByZXNvbHZlZDogcmVzdWx0ID09IFwicmVzb2x2ZWRcIiB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmV0cmVhdHM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZV9idWlsZHMoZ2FtZTogR2FtZVN0YXRlLCBpbnB1dHM6IElucHV0cykge1xuICBsZXQgYnVpbGRzID0gW107XG5cbiAgZm9yIChsZXQgdGVhbSBpbiBpbnB1dHMpIHtcbiAgICBmb3IgKGxldCByYXcgb2YgaW5wdXRzW3RlYW1dKSB7XG4gICAgICBsZXQgbWF0Y2ggPSAvKEJVSUxEXFxzKyhmbGVldHxhcm15KVxccysoLiopfCguKilERVNUUk9ZKVxccystPiguKikvLmV4ZWMoXG4gICAgICAgIHJhd1xuICAgICAgKTtcbiAgICAgIGlmIChtYXRjaCA9PSBudWxsKSB0aHJvdyBlcnJvcihgZmFpbGVkIHRvIG1hdGNoIGJ1aWxkOiAke3Jhd31gKTtcblxuICAgICAgbGV0IHJlc3VsdCA9IG1hdGNoWzVdLnRyaW0oKTtcblxuICAgICAgaWYgKG1hdGNoWzJdKSB7XG4gICAgICAgIGxldCB0eXBlID0gbWF0Y2hbMl0udHJpbSgpO1xuICAgICAgICBsZXQgcmF3UmVnaW9uID0gbWF0Y2hbM10udHJpbSgpO1xuXG4gICAgICAgIGxldCByZWdpb24gPSBtYXBzLnN0YW5kYXJkLm1hcC5yZWdpb25zLmZpbmQoKHIpID0+IHIubmFtZSA9PSByYXdSZWdpb24pO1xuICAgICAgICBpZiAocmVnaW9uID09IG51bGwpXG4gICAgICAgICAgdGhyb3cgZXJyb3IoYGZhaWxlZCB0byBmaW5kIHJlZ2lvbiBmb3IgYnVpbGQ6ICR7cmF3fWApO1xuXG4gICAgICAgIGxldCB1bml0ID0gbmV3IFVuaXQoXG4gICAgICAgICAgcmVnaW9uLFxuICAgICAgICAgIHR5cGUgPT0gXCJmbGVldFwiID8gVW5pdFR5cGUuV2F0ZXIgOiBVbml0VHlwZS5MYW5kLFxuICAgICAgICAgIHRlYW1cbiAgICAgICAgKTtcblxuICAgICAgICBidWlsZHMucHVzaCh7IHVuaXQsIHJlc29sdmVkOiByZXN1bHQgPT0gXCJyZXNvbHZlZFwiIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGV0IHJhd1JlZ2lvbiA9IG1hdGNoWzRdLnRyaW0oKTtcblxuICAgICAgICBsZXQgcmVnaW9uID0gbWFwcy5zdGFuZGFyZC5tYXAucmVnaW9ucy5maW5kKChyKSA9PiByLm5hbWUgPT0gcmF3UmVnaW9uKTtcbiAgICAgICAgaWYgKHJlZ2lvbiA9PSBudWxsKVxuICAgICAgICAgIHRocm93IGVycm9yKGBmYWlsZWQgdG8gZmluZCByZWdpb24gZm9yIGJ1aWxkOiAke3Jhd31gKTtcblxuICAgICAgICBsZXQgdW5pdCA9IFsuLi5nYW1lLnVuaXRzXS5maW5kKFxuICAgICAgICAgICh1KSA9PiB1LnJlZ2lvbiA9PSByZWdpb24gJiYgdS50ZWFtID09IHRlYW1cbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHVuaXQgPT0gbnVsbCkge1xuICAgICAgICAgIGlmIChyZXN1bHQgIT0gXCJyZXNvbHZlZFwiKSBjb250aW51ZTtcbiAgICAgICAgICBlbHNlIHRocm93IGVycm9yKGBmYWlsZWQgdG8gZmluZCB1bml0IGZvciBidWlsZDogJHtyYXd9ICR7dGVhbX1gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGJ1aWxkcy5wdXNoKHsgdW5pdCwgcmVzb2x2ZWQ6IHJlc3VsdCA9PSBcInJlc29sdmVkXCIgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJ1aWxkcztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoR2FtZURhdGEoKSB7XG4gIC8vIGdldCBnYW1lIGhpc3RvcnkgcGhhc2UgT1xuICBjb25zdCBpbnB1dHMgPSBhd2FpdCBnZXRfaGlzdG9yeSgyMjEwNTMsIFwiT1wiLCAwKTtcbiAgY29uc29sZS5sb2coaW5wdXRzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhcImdhbWUtZGF0YS5qc29uXCIsIEpTT04uc3RyaW5naWZ5KGlucHV0cywgbnVsbCwgMikpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmV0Y2hTaW5nbGVHYW1lKGlkOiBudW1iZXIpIHtcbiAgY29uc3QgZ2FtZSA9IGF3YWl0IGdldF9nYW1lKGlkKTtcbiAgbGV0IGRhdGEgPSB3cml0ZV9nYW1lKGdhbWUpO1xuICBsZXQgcGFyc2VkID0gcmVhZF9nYW1lKGRhdGEpO1xuXG4gIHJldHVybiBwYXJzZWQ7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRTZXNzaW9uS2V5KCkge1xuICBjb25zb2xlLmxvZyhcImdldCBzZXNzaW9uIGtleVwiKTtcbiAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICB1cmk6IFwiaHR0cHM6Ly93d3cucGxheWRpcGxvbWFjeS5jb21cIixcbiAgICByZXNvbHZlV2l0aEZ1bGxSZXNwb25zZTogdHJ1ZSwgLy8gTmVlZGVkIHRvIGdldCB0aGUgZnVsbCByZXNwb25zZSBpbmNsdWRpbmcgaGVhZGVyc1xuICAgIHNpbXBsZTogZmFsc2UsIC8vIFByZXZlbnRzIHRocm93aW5nIGFuIGVycm9yIG9uIG5vbi0yeHggcmVzcG9uc2VzXG4gIH07XG5cbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlcXVlc3Qob3B0aW9ucyk7XG4gICAgLy8gVGhlIHNlc3Npb24ga2V5IHdpbGwgYmUgaW4gdGhlICdzZXQtY29va2llJyBoZWFkZXJcbiAgICBjb25zdCBjb29raWVzID0gcmVzcG9uc2UuaGVhZGVyc1tcInNldC1jb29raWVcIl07XG4gICAgbGV0IHNlc3Npb25LZXkgPSBudWxsO1xuXG4gICAgLy8gU2VhcmNoIGZvciB0aGUgUEhQU0VTU0lEIGNvb2tpZVxuICAgIGlmIChjb29raWVzKSB7XG4gICAgICBjb29raWVzLmZvckVhY2goKGNvb2tpZSkgPT4ge1xuICAgICAgICBpZiAoY29va2llLnN0YXJ0c1dpdGgoXCJQSFBTRVNTSUQ9XCIpKSB7XG4gICAgICAgICAgc2Vzc2lvbktleSA9IGNvb2tpZS5zcGxpdChcIjtcIilbMF0uc3BsaXQoXCI9XCIpWzFdO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZiAoc2Vzc2lvbktleSkge1xuICAgICAgY29uc29sZS5sb2coXCJTZXNzaW9uIEtleTpcIiwgc2Vzc2lvbktleSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKFwiU2Vzc2lvbiBLZXkgbm90IGZvdW5kXCIpO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkVycm9yOlwiLCBlcnIubWVzc2FnZSk7XG4gIH1cbn1cbiIsImltcG9ydCBmcyBmcm9tIFwiZnMtZXh0cmFcIjtcblxuaW1wb3J0IHBhdGggZnJvbSBcInBhdGhcIjtcblxuaW1wb3J0IHtcbiAgR2FtZVN0YXRlLFxuICBtYXBzLFxuICBIb2xkT3JkZXIsXG4gIHJlc29sdmUsXG4gIFVuaXQsXG4gIE1vdmVPcmRlcixcbiAgU3VwcG9ydE9yZGVyLFxuICBDb252b3lPcmRlcixcbiAgVW5pdFR5cGUsXG4gIGZvcm1hdHRlcixcbn0gZnJvbSBcImRpcGxvbWFjeS1jb21tb25cIjtcblxuaW1wb3J0ICogYXMgc2NyYXBlIGZyb20gXCIuL3NjcmFwZVwiO1xuaW1wb3J0IHsgZXJyb3IgfSBmcm9tIFwiLi91dGlsXCI7XG5cbmNvbnN0IGlnbm9yZWRfZ2FtZXMgPSBuZXcgU2V0KFtcbiAgMTUwNTUxLCAvLyBGYWxsIDE5MDUgaW5jb3JyZWN0IGp1ZGdlbWVudFxuICAxNTIwNDYsIC8vIEZhbGwgMTkwNCBpbnZhbGlkIGJ1aWxkL2Rlc3Ryb3kgaW5wdXRzXG4gIDE1MzEwNCwgLy8gU3ByaW5nIDE5MDUgcmV0cmVhdCB0byBvY2N1cGllZCBtdW5pY2ggKFBBUlNJTkcgRVJST1IsIHNob3VsZCBoYXZlIGlnbm9yZWQgc3ByaW5nIDE5MDUgcmV0cmVhdCBiZWNhdXNlIGl0IHdhcyBub3QgY29uY2x1ZGVkKVxuICAxNTMzMjMsIC8vIEZhbGwgMTkwMyBpbnZhbGlkIGJ1aWxkL2Rlc3Ryb3kgaW5wdXRzXG4gIDE1MzM0OSwgLy8gRmFsbCAxOTA0IGludmFsaWQgYnVpbGQvZGVzdHJveSBpbnB1dHNcbiAgMTU0MjQyLCAvLyBGYWxsIDE5MDQgaW52YWxpZCBidWlsZC9kZXN0cm95IGlucHV0c1xuICAxNTQ5NDQsIC8vIEZhbGwgMTkwMiBpbnZhbGlkIGJ1aWxkL2Rlc3Ryb3kgaW5wdXRzXG4gIDE1NTQyMiwgLy8gU3ByaW5nIDE5MDMgZW5nbGlzaCBmbGVldCBpbiBpcmlzaCBzZWEgYmVjb21lcyBpdGFsaWFuXG4gIDE0MTkzMSwgLy8gU3ByaW5nIDE5MDEgaW52YWxpZCBvcmRlciBpbnB1dHNcbiAgMTQzNTA1LCAvLyBTcHJpbmcgMTkwNCB0dXJraXNoIGZsZWV0IGluIGFlZ2VhbiBzZWEgYmVjb21lcyBhdXN0cmlhblxuICAxNDQ1ODIsIC8vIFNwcmluZyAxOTEzIGZyZW5jaCBmbGVldCBpbiBraWVsIGJlY29tZXMgcnVzc2lhblxuICAxMzk0NjAsIC8vIGlkZWtcbiAgMTM5ODE1LCAvLyBTcHJpbmcgMTkxNCBzcGFpblxuICAxNDEyNzcsIC8vIEZhbGwgMTkwMSBtZXNzZWQgdXAgY29udm95IHN0dWZmXG4gIDE0MjU4MCwgLy8gRmFsbCAxOTAyIFZlbmNpZSBtb3ZlIFR1c2NhbnkgZmFpbHMgZm9yIG5vIHJlYXNvblxuICAxNDQ4MjUsIC8vIEZhbGwgMTkwOCBCdXJndW5keSBtb3ZlIE11bmljaCBmYWlscyBmb3Igbm8gcmVhc29uXG4gIDE0NTY0NSwgLy8gRmFsbCAxOTA0IEJ1aWxkIGZsZWV0IFN0LiBQZXRlcnNidXJnIGlzIGFjdHVhbGx5IGFuIGFybXlcbiAgMTQ3NTIxLCAvLyBTcHJpbmcgMTkwNiBSZXRyZWF0IEVuZ2xpc2ggZmxlZXQgaW4gc3QuIHBldGVyc2J1cmcgYmVjb21lcyBydXNzaWFuXG4gIDE0OTI4MCwgLy8gRmFsbCAxOTA0IEJ1aWxkIGRlc3Ryb3kgZm9yZWlnbiB1bml0XG4gIDE0OTg3MSwgLy8gRmFsbCAxOTAxIG1lc3NlZCB1cCBjb252b3kgc3R1ZmZcbiAgMTQ5ODkwLCAvLyBGYWxsIDE5MDYgaW52YWxpZCBidWlsZC9kZXN0cm95IGlucHV0c1xuXSk7XG5jb25zdCB0ZWFtcyA9IG5ldyBTZXQoW1xuICBcIkVOR0xBTkRcIixcbiAgXCJGUkFOQ0VcIixcbiAgXCJHRVJNQU5ZXCIsXG4gIFwiSVRBTFlcIixcbiAgXCJBVVNUUklBXCIsXG4gIFwiUlVTU0lBXCIsXG4gIFwiVFVSS0VZXCIsXG5dKTtcblxuY29uc3QgdG90YWxzID0geyBjaGVja2VkOiAwLCBza2lwcGVkX3ZpYTogMCwgc2tpcHBlZF90ZWFtOiAwIH07XG5cbmZ1bmN0aW9uIHJ1bl9nYW1lKGlkOiBudW1iZXIsIHR1cm5zOiBzY3JhcGUuVHVybltdKSB7XG4gIGxldCBnYW1lID0gbmV3IEdhbWVTdGF0ZShtYXBzLnN0YW5kYXJkLm1hcCwgW10pO1xuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgdHVybnMubGVuZ3RoOyArK2kpIHtcbiAgICBjb25zb2xlLmRlYnVnKFxuICAgICAgYHByb2Nlc3NpbmcgJHtpICUgMiA/IFwiZmFsbFwiIDogXCJzcHJpbmdcIn0gJHsxOTAxICsgTWF0aC5mbG9vcihpIC8gMil9YFxuICAgICk7XG5cbiAgICBsZXQgcmVtb3RlID0gc2NyYXBlLnBhcnNlX29yZGVycyhnYW1lLCB0dXJuc1tpXS5vcmRlcnMpO1xuICAgIGxldCBvcmRlcnMgPSByZW1vdGUub3JkZXJzLnNsaWNlKCk7XG5cbiAgICBpZiAob3JkZXJzLmZpbmQoKG8pID0+IG8udHlwZSA9PSBcIm1vdmVcIiAmJiBvLnJlcXVpcmVDb252b3kpKSB7XG4gICAgICArK3RvdGFscy5za2lwcGVkX3ZpYTtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBgc2tpcHBpbmcgJHtpZH0gLSBmb3VuZCBWSUEgQ09OVk9ZICgke3RvdGFscy5za2lwcGVkX3ZpYX0gdG90YWwpYFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgeCA9IFsuLi5nYW1lLnVuaXRzXS5maW5kKCh1KSA9PiAhdGVhbXMuaGFzKHUudGVhbSkpO1xuICAgIGlmICh4KSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYHNraXBwaW5nICR7aWR9IC0gZm91bmQgdGVhbSAke3gudGVhbX0gKCR7dG90YWxzLnNraXBwZWRfdGVhbX0gdG90YWwpYFxuICAgICAgKTtcbiAgICAgICsrdG90YWxzLnNraXBwZWRfdGVhbTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmb3IgKGxldCB1bml0IG9mIGdhbWUudW5pdHMpIHtcbiAgICAgIGxldCBvcmRlciA9IG9yZGVycy5maW5kKChvKSA9PiBvLnVuaXQgPT0gdW5pdCk7XG4gICAgICBpZiAob3JkZXIpIGNvbnRpbnVlO1xuICAgICAgb3JkZXJzLnB1c2gobmV3IEhvbGRPcmRlcih1bml0KSk7XG4gICAgfVxuXG4gICAgbGV0IGxvY2FsID0gcmVzb2x2ZShvcmRlcnMpO1xuXG4gICAgZm9yIChsZXQgbW92ZSBvZiBsb2NhbC5yZXNvbHZlZCkge1xuICAgICAgaWYgKCFnYW1lLnVuaXRzLmhhcyhtb3ZlLnVuaXQpKSBkZWJ1Z2dlcjtcbiAgICAgIGdhbWUudW5pdHMuZGVsZXRlKG1vdmUudW5pdCk7XG4gICAgICBnYW1lLnVuaXRzLmFkZChuZXcgVW5pdChtb3ZlLnRhcmdldCwgbW92ZS51bml0LnR5cGUsIG1vdmUudW5pdC50ZWFtKSk7XG4gICAgfVxuXG4gICAgZm9yIChsZXQgb3JkZXIgb2Ygb3JkZXJzKSB7XG4gICAgICBpZiAob3JkZXIudHlwZSA9PSBcIm1vdmVcIikge1xuICAgICAgICBpZiAobG9jYWwucmVzb2x2ZWQuaW5jbHVkZXMob3JkZXIpICE9IHJlbW90ZS5yZXNvbHZlZC5pbmNsdWRlcyhvcmRlcikpIHtcbiAgICAgICAgICBmb3IgKGxldCBwYWlyIG9mIGxvY2FsLnJlYXNvbnMpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGAke3BhaXJbMF19OiAke3BhaXJbMV19YCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnNvbGUubG9nKG9yZGVyKTtcbiAgICAgICAgICBkZWJ1Z2dlcjtcbiAgICAgICAgICByZXNvbHZlKG9yZGVycyk7XG4gICAgICAgICAgdGhyb3cgZXJyb3IoYE1pc21hdGNoIGluIGdhbWUgJHtpZH1gKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChsb2NhbC5ldmljdGVkLmxlbmd0aCkge1xuICAgICAgbGV0IGV2aWN0ZWQgPSBuZXcgU2V0KGxvY2FsLmV2aWN0ZWQpO1xuICAgICAgbGV0IHJldHJlYXRzID0gc2NyYXBlLnBhcnNlX3JldHJlYXRzKGxvY2FsLmV2aWN0ZWQsIHR1cm5zW2ldLnJldHJlYXRzISk7XG4gICAgICBmb3IgKGxldCByZXRyZWF0IG9mIHJldHJlYXRzKSB7XG4gICAgICAgIGlmIChyZXRyZWF0LnJlc29sdmVkKSB7XG4gICAgICAgICAgaWYgKHJldHJlYXQudGFyZ2V0KSBnYW1lLm1vdmUocmV0cmVhdC51bml0LCByZXRyZWF0LnRhcmdldCk7XG4gICAgICAgICAgZWxzZSBnYW1lLnVuaXRzLmRlbGV0ZShyZXRyZWF0LnVuaXQpO1xuICAgICAgICAgIGV2aWN0ZWQuZGVsZXRlKHJldHJlYXQudW5pdCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGZvciAobGV0IHVuaXQgb2YgZXZpY3RlZCkge1xuICAgICAgICBnYW1lLnVuaXRzLmRlbGV0ZSh1bml0KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoaSAlIDIgPT0gMSkge1xuICAgICAgbGV0IGJ1aWxkcyA9IHNjcmFwZS5wYXJzZV9idWlsZHMoZ2FtZSwgdHVybnNbaV0uYnVpbGRzISk7XG5cbiAgICAgIGZvciAobGV0IGJ1aWxkIG9mIGJ1aWxkcykge1xuICAgICAgICBpZiAoYnVpbGQucmVzb2x2ZWQpIHtcbiAgICAgICAgICBpZiAoZ2FtZS51bml0cy5oYXMoYnVpbGQudW5pdCkpIGdhbWUudW5pdHMuZGVsZXRlKGJ1aWxkLnVuaXQpO1xuICAgICAgICAgIGVsc2UgZ2FtZS51bml0cy5hZGQoYnVpbGQudW5pdCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGxldCByZWdpb24gb2YgZ2FtZS5tYXAucmVnaW9ucykge1xuICAgICAgbGV0IHVuaXRzID0gWy4uLmdhbWUudW5pdHNdLmZpbHRlcigodSkgPT4gdS5yZWdpb24gPT0gcmVnaW9uKTtcbiAgICAgIGlmICh1bml0cy5sZW5ndGggPiAxKSB0aHJvdyBlcnJvcihgTWlzbWF0Y2ggaW4gZ2FtZSAke2lkfWApO1xuICAgIH1cblxuICAgIGlmIChpID09PSB0dXJucy5sZW5ndGggLSAxKSB7XG4gICAgICBjb25zb2xlLmxvZyhcIndyaXRpbmcgdG8gZmlsZVwiKTtcbiAgICAgIGNvbnN0IG5ld1VuaXRzID0gQXJyYXkuZnJvbShnYW1lLnVuaXRzKTtcblxuICAgICAgY29uc3QgZm9sZGVyUGF0aCA9IHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLi4vLi4vd2ViYXBwL3NyYy9kYXRhXCIpO1xuXG4gICAgICBmcy53cml0ZUZpbGVTeW5jKFxuICAgICAgICBmb2xkZXJQYXRoICsgXCIvZmluYWwtc3RhdGUuanNvblwiLFxuICAgICAgICBKU09OLnN0cmluZ2lmeShuZXdVbml0cywgbnVsbCwgMilcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgKyt0b3RhbHMuY2hlY2tlZDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcnVuKCkge1xuICBmcy5ta2RpcnBTeW5jKFwiZGF0YVwiKTtcbiAgZnMubWtkaXJwU3luYyhcImNhY2hlXCIpO1xuXG4gIC8vIHJ1bl9nYW1lKDE1MDE2OCwgc2NyYXBlLnJlYWRfZ2FtZShmcy5yZWFkRmlsZVN5bmMoJ2RhdGEvMTUwMTY4JykpKTtcblxuICBsZXQgYWxsSWRzID0gZnMucmVhZGRpclN5bmMoXCJkYXRhXCIpO1xuXG4gIGZvciAobGV0IGlkIG9mIGFsbElkcykge1xuICAgIGlmIChpZCA9PSBcImtub3duLmpzb25cIikgY29udGludWU7XG4gICAgaWYgKGlnbm9yZWRfZ2FtZXMuaGFzKHBhcnNlSW50KGlkKSkpIGNvbnRpbnVlO1xuXG4gICAgY29uc29sZS5sb2coYHByb2Nlc3NpbmcgZ2FtZSAke2lkfWApO1xuXG4gICAgbGV0IGdhbWUgPSBzY3JhcGUucmVhZF9nYW1lKGZzLnJlYWRGaWxlU3luYyhgZGF0YS8ke2lkfWApKTtcbiAgICBydW5fZ2FtZShwYXJzZUludChpZCksIGdhbWUpO1xuICB9XG5cbiAgY29uc29sZS5sb2codG90YWxzKTtcbn1cblxubGV0IHggPSBnbG9iYWwgYXMgYW55O1xuaWYgKHguZGV2dG9vbHNGb3JtYXR0ZXJzID09IG51bGwpIHguZGV2dG9vbHNGb3JtYXR0ZXJzID0gW107XG54LmRldnRvb2xzRm9ybWF0dGVycy5wdXNoKGZvcm1hdHRlcik7XG5cbmxldCBvcCA9IHByb2Nlc3MuYXJndlsyXTtcblxuY29uc3QgTVlfR0FNRV9JRCA9IDIyMTA1MztcblxuaWYgKG9wID09IFwic2NyYXBlXCIpIHNjcmFwZS5ydW4oKTtcbmVsc2UgaWYgKG9wID09IFwiY2hlY2tcIikgc2NyYXBlLmNoZWNrKCk7XG5lbHNlIGlmIChvcCA9PSBcInJ1blwiKSBydW4oKTtcbmVsc2UgaWYgKG9wID09IFwiZmV0Y2hcIikgc2NyYXBlLmZldGNoR2FtZURhdGEoKTtcbi8vIGVsc2UgaWYgKG9wID09IFwidGVzdFwiKSBzY3JhcGUuZmV0Y2hTaW5nbGVHYW1lKE1ZX0dBTUVfSUQpO1xuZWxzZSBpZiAob3AgPT0gXCJrZXlcIikgc2NyYXBlLmdldFNlc3Npb25LZXkoKTtcbmVsc2UgaWYgKG9wID09IFwidGVzdFwiKSB7XG4gIGNvbnN0IHR1cm5zID0gc2NyYXBlLmZldGNoU2luZ2xlR2FtZShNWV9HQU1FX0lEKTtcbiAgdHVybnMudGhlbigocmVzKSA9PiB7XG4gICAgY29uc3QgZ2FtZUZpbmFsID0gcnVuX2dhbWUoTVlfR0FNRV9JRCwgcmVzKTtcbiAgICAvLyBjb25zb2xlLmxvZyhnYW1lRmluYWwpO1xuICB9KTtcbn0gZWxzZSB7XG4gIGNvbnNvbGUubG9nKFwidW5rbm93biBvciBtaXNzaW5nIGNvbW1hbmRcIik7XG59XG4iXSwibmFtZXMiOlsibWFwcyIsIlVuaXQiLCJVbml0VHlwZSIsIkhvbGRPcmRlciIsIk1vdmVPcmRlciIsIlN1cHBvcnRPcmRlciIsIkNvbnZveU9yZGVyIiwiR2FtZVN0YXRlIiwic2NyYXBlLnBhcnNlX29yZGVycyIsInJlc29sdmUiLCJzY3JhcGUucGFyc2VfcmV0cmVhdHMiLCJzY3JhcGUucGFyc2VfYnVpbGRzIiwicnVuIiwic2NyYXBlLnJlYWRfZ2FtZSIsImZvcm1hdHRlciIsInNjcmFwZS5ydW4iLCJzY3JhcGUuY2hlY2siLCJzY3JhcGUuZmV0Y2hHYW1lRGF0YSIsInNjcmFwZS5nZXRTZXNzaW9uS2V5Iiwic2NyYXBlLmZldGNoU2luZ2xlR2FtZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7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
