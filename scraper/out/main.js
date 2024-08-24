'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var fs = _interopDefault(require('fs-extra'));
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
//# sourceMappingURL=util.js.map

const session_key = `ucghq2ao5elat0gvrgn88aruc2`;
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
//# sourceMappingURL=scrape.js.map

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
            fs.writeFileSync("../webapp/src/data/final-state.json", JSON.stringify(newUnits, null, 2));
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
else if (op == "test") {
    const turns = fetchSingleGame(MY_GAME_ID);
    turns.then((res) => {
        const gameFinal = run_game(MY_GAME_ID, res);
        console.log(gameFinal);
    });
}
else {
    console.log("unknown or missing command");
}
//# sourceMappingURL=main.js.map
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZXMiOlsiLi4vc3JjL3V0aWwudHMiLCIuLi9zcmMvc2NyYXBlLnRzIiwiLi4vc3JjL21haW4udHMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGZ1bmN0aW9uIGVycm9yKG1zZzogc3RyaW5nKSB7XG4gICAgZGVidWdnZXI7XG4gICAgcmV0dXJuIG5ldyBFcnJvcihtc2cpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24qIG1hdGNoZXMocmVnZXg6IFJlZ0V4cCwgdGFyZ2V0OiBzdHJpbmcpIHtcbiAgICBsZXQgY29weSA9IG5ldyBSZWdFeHAocmVnZXgsICdnJyk7XG4gICAgbGV0IG1hdGNoO1xuICAgIHdoaWxlIChtYXRjaCA9IGNvcHkuZXhlYyh0YXJnZXQpKVxuICAgICAgICB5aWVsZCBtYXRjaDtcbn1cbiIsImltcG9ydCB6bGliIGZyb20gXCJ6bGliXCI7XG5cbmltcG9ydCBmcyBmcm9tIFwiZnMtZXh0cmFcIjtcbmltcG9ydCByZXF1ZXN0IGZyb20gXCJyZXF1ZXN0LXByb21pc2UtbmF0aXZlXCI7XG5cbmltcG9ydCB7IGVycm9yLCBtYXRjaGVzIH0gZnJvbSBcIi4vdXRpbFwiO1xuaW1wb3J0IHtcbiAgR2FtZVN0YXRlLFxuICBtYXBzLFxuICBIb2xkT3JkZXIsXG4gIFVuaXQsXG4gIE1vdmVPcmRlcixcbiAgU3VwcG9ydE9yZGVyLFxuICBDb252b3lPcmRlcixcbiAgVW5pdFR5cGUsXG59IGZyb20gXCJkaXBsb21hY3ktY29tbW9uXCI7XG5cbmV4cG9ydCB0eXBlIElucHV0cyA9IHsgW3RlYW06IHN0cmluZ106IHN0cmluZ1tdIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHVybiB7XG4gIG9yZGVyczogSW5wdXRzO1xuICByZXRyZWF0cz86IElucHV0cztcbiAgYnVpbGRzPzogSW5wdXRzO1xufVxuXG5jb25zdCBzZXNzaW9uX2tleSA9IGB1Y2docTJhbzVlbGF0MGd2cmduODhhcnVjMmA7XG5cbmFzeW5jIGZ1bmN0aW9uIHBsYXlkaXBsb21hY3kocGF0aDogc3RyaW5nKSB7XG4gIGxldCB1cmwgPSBgaHR0cHM6Ly93d3cucGxheWRpcGxvbWFjeS5jb20ke3BhdGh9YDtcbiAgdHJ5IHtcbiAgICBsZXQgcmVzcG9uc2UgPSBhd2FpdCByZXF1ZXN0KHVybCwge1xuICAgICAgaGVhZGVyczogeyBjb29raWU6IGBQSFBTRVNTSUQ9JHtzZXNzaW9uX2tleX1gIH0sXG4gICAgICByZXNvbHZlV2l0aEZ1bGxSZXNwb25zZTogdHJ1ZSxcbiAgICAgIGZvbGxvd1JlZGlyZWN0OiBmYWxzZSxcbiAgICB9KTtcblxuICAgIGlmIChyZXNwb25zZS5zdGF0dXNDb2RlICE9IDIwMCkgdGhyb3cgZXJyb3IoXCJpbnZhbGlkIHN0YXR1cyBjb2RlXCIpO1xuICAgIHJldHVybiByZXNwb25zZS5ib2R5O1xuICB9IGNhdGNoIChlKSB7XG4gICAgZGVidWdnZXI7XG4gICAgdGhyb3cgZTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnYW1lX2hpc3RvcnkocXVlcnk6IHN0cmluZykge1xuICBsZXQgY2FjaGUgPSBgY2FjaGUvJHtxdWVyeX1gO1xuXG4gIGxldCBkYXRhO1xuICAvLyAgIHRyeSB7XG4gIC8vICAgICBkYXRhID0gZnMucmVhZEZpbGVTeW5jKGNhY2hlLCBcInV0ZjhcIik7XG4gIC8vICAgfSBjYXRjaCAoZSkge1xuICBkYXRhID0gYXdhaXQgcGxheWRpcGxvbWFjeShgL2dhbWVfaGlzdG9yeS5waHA/JHtxdWVyeX1gKTtcbiAgLy8gICBhd2FpdCBmcy53cml0ZUZpbGUoY2FjaGUsIGRhdGEsIFwidXRmOFwiKTtcbiAgLy8gICB9XG5cbiAgcmV0dXJuIGRhdGE7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldF9oaXN0b3J5KGlkOiBudW1iZXIsIHBoYXNlOiBzdHJpbmcsIGRhdGU6IG51bWJlcikge1xuICBsZXQgcXVlcnkgPSBgZ2FtZV9pZD0ke2lkfSZwaGFzZT0ke3BoYXNlfSZnZGF0ZT0ke2RhdGV9YDtcbiAgbGV0IGRhdGEgPSBhd2FpdCBnYW1lX2hpc3RvcnkocXVlcnkpO1xuXG4gIGxldCBmb3VuZCA9IGZhbHNlO1xuICBsZXQgaW5wdXRzOiBJbnB1dHMgPSB7fTtcblxuICBmb3IgKGxldCBtYXRjaCBvZiBtYXRjaGVzKC88Yj4oXFx3Kyk8XFwvYj48dWw+KC4qPyk8XFwvdWw+LywgZGF0YSkpIHtcbiAgICBsZXQgdGVhbSA9IG1hdGNoWzFdO1xuICAgIGxldCBsaXN0ID0gW107XG5cbiAgICBmb3IgKGxldCBwYXJ0IG9mIG1hdGNoZXMoLzxsaT4oLio/KTxcXC9saT4vLCBtYXRjaFsyXSkpIHtcbiAgICAgIGxpc3QucHVzaChwYXJ0WzFdKTtcbiAgICB9XG4gICAgaWYgKGxpc3QubGVuZ3RoID09IDApIGNvbnRpbnVlO1xuXG4gICAgZm91bmQgPSB0cnVlO1xuICAgIGlucHV0c1t0ZWFtXSA9IGxpc3Q7XG4gIH1cblxuICBpZiAoZm91bmQpIHJldHVybiBpbnB1dHM7XG5cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldF9nYW1lKGlkOiBudW1iZXIpIHtcbiAgbGV0IHR1cm5zID0gW107XG4gIGxldCBoaXN0b3J5ID0gYXdhaXQgZ2FtZV9oaXN0b3J5KGBnYW1lX2lkPSR7aWR9YCk7XG5cbiAgZm9yIChsZXQgY29udGVudCBvZiBoaXN0b3J5LnNwbGl0KFwiPC9icj48L2JyPlwiKSkge1xuICAgIGxldCBkYXRlID0gdHVybnMubGVuZ3RoO1xuICAgIGxldCB0dXJuOiBUdXJuID0geyBvcmRlcnM6IHt9IH07XG5cbiAgICBsZXQgZm91bmQgPSBmYWxzZTtcbiAgICBmb3IgKGxldCBtYXRjaCBvZiBtYXRjaGVzKFxuICAgICAgLzxiPjxhIGhyZWY9J2dhbWVfaGlzdG9yeVxcLnBocFxcP2dhbWVfaWQ9KFxcZCspJnBoYXNlPShcXHcpJmdkYXRlPShcXGQrKSc+W148XSs8XFwvYT48XFwvYj4mbmJzcDsmbmJzcDsvLFxuICAgICAgY29udGVudFxuICAgICkpIHtcbiAgICAgIGlmIChpZCAhPSBwYXJzZUludChtYXRjaFsxXSkpXG4gICAgICAgIHRocm93IGVycm9yKGBGYWlsZWQgdG8gcGFyc2UgZ2FtZSBoaXN0b3J5OiAke2lkfWApO1xuICAgICAgaWYgKGRhdGUgIT0gcGFyc2VJbnQobWF0Y2hbM10pKVxuICAgICAgICB0aHJvdyBlcnJvcihgRmFpbGVkIHRvIHBhcnNlIGdhbWUgaGlzdG9yeTogJHtpZH1gKTtcblxuICAgICAgbGV0IHBoYXNlID0gbWF0Y2hbMl07XG4gICAgICBsZXQgaW5wdXRzID0gYXdhaXQgZ2V0X2hpc3RvcnkoaWQsIHBoYXNlLCBkYXRlKTtcbiAgICAgIGlmIChpbnB1dHMgPT0gbnVsbCAmJiBwaGFzZSAhPSBcIk9cIikgY29udGludWU7XG5cbiAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgIHN3aXRjaCAocGhhc2UpIHtcbiAgICAgICAgY2FzZSBcIk9cIjpcbiAgICAgICAgICB0dXJuLm9yZGVycyA9IGlucHV0cyB8fCB7fTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcIlJcIjpcbiAgICAgICAgICB0dXJuLnJldHJlYXRzID0gaW5wdXRzO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwiQlwiOlxuICAgICAgICAgIHR1cm4uYnVpbGRzID0gaW5wdXRzO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghZm91bmQpIGNvbnRpbnVlO1xuXG4gICAgdHVybnMucHVzaCh0dXJuKTtcbiAgfVxuXG4gIHJldHVybiB0dXJucztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldF9wYWdlKHBhZ2U6IG51bWJlcikge1xuICBsZXQgdXJsID0gYC9nYW1lcy5waHA/c3VicGFnZT1hbGxfZmluaXNoZWQmdmFyaWFudC0wPTEmbWFwX3ZhcmlhbnQtMD0xJmN1cnJlbnRfcGFnZT0ke3BhZ2V9YDtcbiAgbGV0IGRhdGEgPSBhd2FpdCBwbGF5ZGlwbG9tYWN5KHVybCk7XG5cbiAgbGV0IGlkcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuICBmb3IgKGxldCBtYXRjaCBvZiBtYXRjaGVzKFxuICAgIC88YSBocmVmPVwiZ2FtZV9wbGF5X2RldGFpbHNcXC5waHBcXD9nYW1lX2lkPShcXGQrKS8sXG4gICAgZGF0YVxuICApKSB7XG4gICAgbGV0IGdhbWVJZCA9IHBhcnNlSW50KG1hdGNoWzFdKTtcbiAgICBpZHMuYWRkKGdhbWVJZCk7XG4gIH1cblxuICByZXR1cm4gWy4uLmlkc107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWFkX2dhbWUocmF3OiBCdWZmZXIpIHtcbiAgbGV0IGRhdGEgPSB6bGliLmd1bnppcFN5bmMocmF3KTtcbiAgbGV0IGdhbWUgPSBKU09OLnBhcnNlKGRhdGEudG9TdHJpbmcoXCJ1dGY4XCIpKSBhcyBUdXJuW107XG5cbiAgZm9yIChsZXQgdHVybiBvZiBnYW1lKSB7XG4gICAgaWYgKHR1cm4uYnVpbGRzICYmIE9iamVjdC5rZXlzKHR1cm4uYnVpbGRzKS5sZW5ndGggPT0gMCkge1xuICAgICAgZGVsZXRlIHR1cm4uYnVpbGRzO1xuICAgIH1cbiAgICBpZiAodHVybi5yZXRyZWF0cyAmJiBPYmplY3Qua2V5cyh0dXJuLnJldHJlYXRzKS5sZW5ndGggPT0gMCkge1xuICAgICAgZGVsZXRlIHR1cm4ucmV0cmVhdHM7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyh0dXJuLm9yZGVycykubGVuZ3RoID09IDApIHtcbiAgICAgIC8vIHNvbWV0aW1lcyBnYW1lcyBoYXZlIGFuIGVtcHR5IGxhc3QgdHVybiB3aXRoIG5vIG9yZGVyc1xuICAgICAgaWYgKHR1cm4uYnVpbGRzIHx8IHR1cm4ucmV0cmVhdHMgfHwgZ2FtZS5pbmRleE9mKHR1cm4pICsgMSAhPSBnYW1lLmxlbmd0aClcbiAgICAgICAgdGhyb3cgZXJyb3IoYG1pc3Npbmcgb3JkZXJzOiAke2dhbWUuaW5kZXhPZih0dXJuKX1gKTtcbiAgICAgIGdhbWUucG9wKCk7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZ2FtZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHdyaXRlX2dhbWUodHVybnM6IFR1cm5bXSkge1xuICBsZXQgZGF0YSA9IEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KHR1cm5zKSwgXCJ1dGY4XCIpO1xuICByZXR1cm4gemxpYi5nemlwU3luYyhkYXRhKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1bigpIHtcbiAgZnMubWtkaXJwU3luYyhcImRhdGFcIik7XG4gIGZzLm1rZGlycFN5bmMoXCJjYWNoZVwiKTtcblxuICBsZXQgZXJyb3JzID0gMDtcbiAgbGV0IG9sZEtub3duO1xuICBsZXQgbmV3S25vd24gPSB7IG5ld2VzdDogMCwgY291bnQ6IDAgfTtcbiAgdHJ5IHtcbiAgICBvbGRLbm93biA9IGZzLnJlYWRKU09OU3luYyhcImRhdGEva25vd24uanNvblwiKSBhcyB0eXBlb2YgbmV3S25vd247XG4gICAgY29uc29sZS5sb2coYGtub3duOiAke29sZEtub3duLm5ld2VzdH0gKyR7b2xkS25vd24uY291bnR9YCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBvbGRLbm93biA9IG51bGw7XG4gIH1cblxuICBsZXQgc2tpcCA9IDA7XG4gIGZvciAobGV0IGkgPSAxOyBpIDw9IDEwMDAgJiYgZXJyb3JzIDwgMTA7ICsraSkge1xuICAgIGlmIChza2lwID49IDE1KSB7XG4gICAgICBza2lwIC09IDE1O1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYGZldGNoaW5nIHBhZ2UgJHtpfWApO1xuICAgIGxldCBpZHMgPSBhd2FpdCBnZXRfcGFnZShpKTtcblxuICAgIGZvciAobGV0IGlkIG9mIGlkcykge1xuICAgICAgaWYgKG5ld0tub3duLm5ld2VzdCA9PSAwKSBuZXdLbm93bi5uZXdlc3QgPSBpZDtcblxuICAgICAgaWYgKG9sZEtub3duICYmIGlkID09IG9sZEtub3duLm5ld2VzdCkge1xuICAgICAgICBza2lwID0gb2xkS25vd24uY291bnQ7XG4gICAgICAgIG5ld0tub3duLmNvdW50ICs9IG9sZEtub3duLmNvdW50O1xuICAgICAgICBvbGRLbm93biA9IG51bGw7XG4gICAgICB9XG5cbiAgICAgIGlmIChza2lwID49IDEpIHtcbiAgICAgICAgc2tpcCAtPSAxO1xuICAgICAgICBjb25zb2xlLmxvZyhgc2tpcHBpbmcgZ2FtZSAke2lkfWApO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS5sb2coYGZldGNoaW5nIGdhbWUgJHtpZH1gKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGxldCBvdXRwdXRGaWxlID0gYGRhdGEvJHtpZH1gO1xuICAgICAgICBpZiAoIWZzLnBhdGhFeGlzdHNTeW5jKG91dHB1dEZpbGUpKSB7XG4gICAgICAgICAgbGV0IGdhbWUgPSBhd2FpdCBnZXRfZ2FtZShpZCk7XG4gICAgICAgICAgbGV0IGRhdGEgPSB3cml0ZV9nYW1lKGdhbWUpO1xuICAgICAgICAgIGxldCBwYXJzZWQgPSByZWFkX2dhbWUoZGF0YSk7XG5cbiAgICAgICAgICBpZiAoSlNPTi5zdHJpbmdpZnkocGFyc2VkKSAhPSBKU09OLnN0cmluZ2lmeShnYW1lKSlcbiAgICAgICAgICAgIHRocm93IGVycm9yKFwiZ2FtZSBlbmNvZGluZyBmYWlsZWRcIik7XG5cbiAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKG91dHB1dEZpbGUsIGRhdGEpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVycm9ycyA9PSAwKSB7XG4gICAgICAgICAgKytuZXdLbm93bi5jb3VudDtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICArK2Vycm9ycztcbiAgICAgICAgZnMuYXBwZW5kRmlsZVN5bmMoXCJlcnJvcnMudHh0XCIsIGAke2lkfSAke2V9YCwgXCJ1dGY4XCIpO1xuICAgICAgICBjb25zb2xlLmVycm9yKGlkLCBlKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAob2xkS25vd24gPT0gbnVsbCkge1xuICAgICAgZnMud3JpdGVKU09OU3luYyhcImRhdGEva25vd24uanNvblwiLCBuZXdLbm93bik7XG4gICAgICBjb25zb2xlLmxvZyhga25vd246ICR7bmV3S25vd24ubmV3ZXN0fSArJHtuZXdLbm93bi5jb3VudH1gKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNoZWNrKCkge1xuICBmcy5ta2RpcnBTeW5jKFwiZGF0YVwiKTtcbiAgZnMubWtkaXJwU3luYyhcImNhY2hlXCIpO1xuXG4gIGxldCBjb3VudCA9IDA7XG4gIGxldCBhbGxJZHMgPSBmcy5yZWFkZGlyU3luYyhcImRhdGFcIik7XG5cbiAgZm9yIChsZXQgaWQgb2YgYWxsSWRzKSB7XG4gICAgaWYgKGlkID09IFwia25vd24uanNvblwiKSBjb250aW51ZTtcblxuICAgIGxldCBnYW1lID0gcmVhZF9nYW1lKGZzLnJlYWRGaWxlU3luYyhgZGF0YS8ke2lkfWApKTtcblxuICAgIGxldCB0dXJucyA9IDA7XG4gICAgbGV0IGhpc3RvcnkgPSBhd2FpdCBnYW1lX2hpc3RvcnkoYGdhbWVfaWQ9JHtpZH1gKTtcblxuICAgIGZvciAobGV0IGNvbnRlbnQgb2YgaGlzdG9yeS5zcGxpdChcIjwvYnI+PC9icj5cIikpIHtcbiAgICAgIGxldCBmb3VuZCA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgXyBvZiBtYXRjaGVzKFxuICAgICAgICAvPGI+PGEgaHJlZj0nZ2FtZV9oaXN0b3J5XFwucGhwXFw/Z2FtZV9pZD0oXFxkKykmcGhhc2U9KFxcdykmZ2RhdGU9KFxcZCspJz5bXjxdKzxcXC9hPjxcXC9iPiZuYnNwOyZuYnNwOy8sXG4gICAgICAgIGNvbnRlbnRcbiAgICAgICkpIHtcbiAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgaWYgKCFmb3VuZCkgY29udGludWU7XG4gICAgICArK3R1cm5zO1xuICAgIH1cblxuICAgIGlmICh0dXJucyAhPSBnYW1lLmxlbmd0aCkge1xuICAgICAgZ2FtZSA9IGF3YWl0IGdldF9nYW1lKHBhcnNlSW50KGlkKSk7XG4gICAgICBpZiAodHVybnMgIT0gZ2FtZS5sZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgZXJyb3IoYE1pc21hdGNoOiAke2lkfSAke3R1cm5zfSAke2dhbWUubGVuZ3RofWApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGxldCBidWlsZHMgPSAwO1xuICAgIGxldCByZXRyZWF0cyA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBnYW1lLmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAoZ2FtZVtpXS5idWlsZHMpIGJ1aWxkcysrO1xuICAgICAgaWYgKGdhbWVbaV0ucmV0cmVhdHMpIHJldHJlYXRzKys7XG4gICAgfVxuXG4gICAgaWYgKGJ1aWxkcyA9PSAwICYmIHJldHJlYXRzID09IDApIHtcbiAgICAgIGdhbWUgPSBhd2FpdCBnZXRfZ2FtZShwYXJzZUludChpZCkpO1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGAkeygrK2NvdW50KS50b1N0cmluZygpLnBhZFN0YXJ0KGFsbElkcy5sZW5ndGgudG9TdHJpbmcoKS5sZW5ndGgpfSAvICR7XG4gICAgICAgICAgYWxsSWRzLmxlbmd0aFxuICAgICAgICB9ICR7aWR9ICR7dHVybnN9ICpgXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYCR7KCsrY291bnQpLnRvU3RyaW5nKCkucGFkU3RhcnQoYWxsSWRzLmxlbmd0aC50b1N0cmluZygpLmxlbmd0aCl9IC8gJHtcbiAgICAgICAgICBhbGxJZHMubGVuZ3RoXG4gICAgICAgIH0gJHtpZH0gJHt0dXJuc31gXG4gICAgICApO1xuICAgIH1cblxuICAgIGxldCBkYXRhID0gd3JpdGVfZ2FtZShnYW1lKTtcbiAgICBmcy53cml0ZUZpbGVTeW5jKGBkYXRhLyR7aWR9YCwgZGF0YSk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlX29yZGVycyhnYW1lOiBHYW1lU3RhdGUsIGlucHV0czogSW5wdXRzKSB7XG4gIGxldCBpc05ldyA9IGdhbWUudW5pdHMuc2l6ZSA9PSAwO1xuICBsZXQgZmxlZXRzID0gbmV3IFNldChbXG4gICAgbWFwcy5zdGFuZGFyZC5yZWdpb25zLkxPTixcbiAgICBtYXBzLnN0YW5kYXJkLnJlZ2lvbnMuRURJLFxuICAgIG1hcHMuc3RhbmRhcmQucmVnaW9ucy5CUkUsXG4gICAgbWFwcy5zdGFuZGFyZC5yZWdpb25zLk5BUCxcbiAgICBtYXBzLnN0YW5kYXJkLnJlZ2lvbnMuS0lFLFxuICAgIG1hcHMuc3RhbmRhcmQucmVnaW9ucy5UUkksXG4gICAgbWFwcy5zdGFuZGFyZC5yZWdpb25zLkFOSyxcbiAgICBtYXBzLnN0YW5kYXJkLnJlZ2lvbnMuU0VWLFxuICAgIG1hcHMuc3RhbmRhcmQucmVnaW9ucy5TVFBfU09VVEgsXG4gIF0pO1xuXG4gIGxldCBvcmRlcnMgPSBbXTtcbiAgbGV0IHJlc29sdmVkID0gW107XG5cbiAgZm9yIChsZXQgdGVhbSBpbiBpbnB1dHMpIHtcbiAgICBmb3IgKGxldCByYXcgb2YgaW5wdXRzW3RlYW1dKSB7XG4gICAgICBsZXQgbWF0Y2ggPSAvKC4qPykoSE9MRHxNT1ZFfFNVUFBPUlR8Q09OVk9ZKSguKiktPiguKikvLmV4ZWMocmF3KTtcbiAgICAgIGlmIChtYXRjaCA9PSBudWxsKSB0aHJvdyBlcnJvcihgZmFpbGVkIHRvIG1hdGNoIG9yZGVyOiAke3Jhd31gKTtcblxuICAgICAgbGV0IHJlZ2lvbk5hbWUgPSBtYXRjaFsxXS50cmltKCk7XG4gICAgICBsZXQgb3AgPSBtYXRjaFsyXTtcbiAgICAgIGxldCBhcmdzID0gbWF0Y2hbM10udHJpbSgpO1xuICAgICAgbGV0IHJlc3VsdCA9IG1hdGNoWzRdLnRyaW0oKTtcblxuICAgICAgaWYgKHJlc3VsdCA9PSBcIkludmFsaWQgb3JkZXIgb3Igc3ludGF4IGVycm9yXCIpIGNvbnRpbnVlO1xuXG4gICAgICBsZXQgcmVnaW9uID0gZ2FtZS5tYXAucmVnaW9ucy5maW5kKChyKSA9PiByLm5hbWUgPT0gcmVnaW9uTmFtZSk7XG4gICAgICBpZiAocmVnaW9uID09IG51bGwpXG4gICAgICAgIHRocm93IGVycm9yKGBmYWlsZWQgdG8gZmluZCByZWdpb24gZm9yIG9yZGVyOiAke3Jhd30gYCk7XG5cbiAgICAgIGxldCB1bml0ID0gWy4uLmdhbWUudW5pdHNdLmZpbmQoXG4gICAgICAgICh1KSA9PiB1LnJlZ2lvbiA9PSByZWdpb24gJiYgdS50ZWFtID09IHRlYW1cbiAgICAgICk7XG4gICAgICBpZiAodW5pdCA9PSBudWxsKSB7XG4gICAgICAgIGlmIChpc05ldylcbiAgICAgICAgICBnYW1lLnVuaXRzLmFkZChcbiAgICAgICAgICAgICh1bml0ID0gbmV3IFVuaXQoXG4gICAgICAgICAgICAgIHJlZ2lvbixcbiAgICAgICAgICAgICAgZmxlZXRzLmhhcyhyZWdpb24pID8gVW5pdFR5cGUuV2F0ZXIgOiBVbml0VHlwZS5MYW5kLFxuICAgICAgICAgICAgICB0ZWFtXG4gICAgICAgICAgICApKVxuICAgICAgICAgICk7XG4gICAgICAgIGVsc2UgdGhyb3cgZXJyb3IoYFVuaXQgZG9lcyBub3QgZXhpc3Q6ICR7dGVhbX0gJHtyZWdpb24ubmFtZX0gYCk7XG4gICAgICB9XG5cbiAgICAgIGxldCBvcmRlcjtcblxuICAgICAgaWYgKG9wID09IFwiSE9MRFwiIHx8IHJlc3VsdCA9PSBcIklsbGVnYWwgb3JkZXIgcmVwbGFjZWQgd2l0aCBIb2xkIG9yZGVyXCIpIHtcbiAgICAgICAgb3JkZXIgPSBuZXcgSG9sZE9yZGVyKHVuaXQpO1xuICAgICAgfSBlbHNlIGlmIChvcCA9PSBcIk1PVkVcIikge1xuICAgICAgICBsZXQgbW92ZUFyZ3MgPSBhcmdzLnNwbGl0KFwiVklBXCIpO1xuXG4gICAgICAgIGxldCByYXdUYXJnZXQgPSBtb3ZlQXJnc1swXS50cmltKCk7XG4gICAgICAgIGxldCB0YXJnZXQgPSBtYXBzLnN0YW5kYXJkLm1hcC5yZWdpb25zLmZpbmQoKHIpID0+IHIubmFtZSA9PSByYXdUYXJnZXQpO1xuICAgICAgICBpZiAodGFyZ2V0ID09IG51bGwpXG4gICAgICAgICAgdGhyb3cgZXJyb3IoYGZhaWxlZCB0byBmaW5kIHRhcmdldCByZWdpb24gZm9yIG1vdmUgb3JkZXI6ICR7YXJnc30gYCk7XG5cbiAgICAgICAgb3JkZXIgPSBuZXcgTW92ZU9yZGVyKHVuaXQsIHRhcmdldCwgbW92ZUFyZ3MubGVuZ3RoID4gMSk7XG4gICAgICAgIGlmIChyZXN1bHQgPT0gXCJyZXNvbHZlZFwiKSB7XG4gICAgICAgICAgcmVzb2x2ZWQucHVzaChvcmRlcik7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAob3AgPT0gXCJTVVBQT1JUXCIpIHtcbiAgICAgICAgbGV0IFtyYXdTcmMsIHJhd0RzdF0gPSBhcmdzLnNwbGl0KFwiIHRvIFwiKTsgLy8gJ1ggdG8gaG9sZCcgb3IgJ1ggdG8gWSdcblxuICAgICAgICBsZXQgc3JjID0gbWFwcy5zdGFuZGFyZC5tYXAucmVnaW9ucy5maW5kKChyKSA9PiByLm5hbWUgPT0gcmF3U3JjKTtcbiAgICAgICAgaWYgKHNyYyA9PSBudWxsKVxuICAgICAgICAgIHRocm93IGVycm9yKFxuICAgICAgICAgICAgYGZhaWxlZCB0byBmaW5kIHRhcmdldCByZWdpb24gZm9yIHN1cHBvcnQgb3JkZXI6ICR7cmF3U3JjfSBgXG4gICAgICAgICAgKTtcblxuICAgICAgICBpZiAocmF3RHN0ID09IFwiaG9sZFwiKSBvcmRlciA9IG5ldyBTdXBwb3J0T3JkZXIodW5pdCwgc3JjKTtcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgbGV0IGRzdCA9IG1hcHMuc3RhbmRhcmQubWFwLnJlZ2lvbnMuZmluZCgocikgPT4gci5uYW1lID09IHJhd0RzdCk7XG4gICAgICAgICAgaWYgKGRzdCA9PSBudWxsKVxuICAgICAgICAgICAgdGhyb3cgZXJyb3IoXG4gICAgICAgICAgICAgIGBmYWlsZWQgdG8gZmluZCBhdHRhY2sgcmVnaW9uIGZvciBzdXBwb3J0IG9yZGVyOiAke3Jhd0RzdH0gYFxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgIG9yZGVyID0gbmV3IFN1cHBvcnRPcmRlcih1bml0LCBzcmMsIGRzdCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAob3AgPT0gXCJDT05WT1lcIikge1xuICAgICAgICBsZXQgW3Jhd1NyYywgcmF3RHN0XSA9IGFyZ3Muc3BsaXQoXCIgdG8gXCIpOyAvLyAnWCB0byBZJ1xuXG4gICAgICAgIGxldCBzcmMgPSBtYXBzLnN0YW5kYXJkLm1hcC5yZWdpb25zLmZpbmQoKHIpID0+IHIubmFtZSA9PSByYXdTcmMpO1xuICAgICAgICBpZiAoc3JjID09IG51bGwpXG4gICAgICAgICAgdGhyb3cgZXJyb3IoXG4gICAgICAgICAgICBgZmFpbGVkIHRvIGZpbmQgc3RhcnQgcmVnaW9uIGZvciBjb252b3kgb3JkZXI6ICR7cmF3U3JjfSBgXG4gICAgICAgICAgKTtcblxuICAgICAgICBsZXQgZHN0ID0gbWFwcy5zdGFuZGFyZC5tYXAucmVnaW9ucy5maW5kKChyKSA9PiByLm5hbWUgPT0gcmF3RHN0KTtcbiAgICAgICAgaWYgKGRzdCA9PSBudWxsKVxuICAgICAgICAgIHRocm93IGVycm9yKGBmYWlsZWQgdG8gZmluZCBlbmQgcmVnaW9uIGZvciBjb252b3kgb3JkZXI6ICR7cmF3RHN0fSBgKTtcblxuICAgICAgICBvcmRlciA9IG5ldyBDb252b3lPcmRlcih1bml0LCBzcmMsIGRzdCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcihgaW52YWxpZCBvcmRlcjogJHtvcH1gKTtcbiAgICAgIH1cblxuICAgICAgb3JkZXJzLnB1c2gob3JkZXIpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7IG9yZGVycywgcmVzb2x2ZWQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlX3JldHJlYXRzKGV2aWN0ZWQ6IFVuaXRbXSwgaW5wdXRzOiBJbnB1dHMpIHtcbiAgbGV0IHJldHJlYXRzID0gW107XG5cbiAgZm9yIChsZXQgdGVhbSBpbiBpbnB1dHMpIHtcbiAgICBmb3IgKGxldCByYXcgb2YgaW5wdXRzW3RlYW1dKSB7XG4gICAgICBsZXQgbWF0Y2ggPSAvKCguKilSRVRSRUFUKC4qKXwoLiopREVTVFJPWSlcXHMrLT4oLiopLy5leGVjKHJhdyk7XG4gICAgICBpZiAobWF0Y2ggPT0gbnVsbCkgdGhyb3cgZXJyb3IoYGZhaWxlZCB0byBtYXRjaCByZXRyZWF0OiAke3Jhd30gYCk7XG5cbiAgICAgIGxldCByZXN1bHQgPSBtYXRjaFs1XS50cmltKCk7XG4gICAgICBpZiAobWF0Y2hbMl0pIHtcbiAgICAgICAgbGV0IHJhd1NyYyA9IG1hdGNoWzJdLnRyaW0oKTtcbiAgICAgICAgbGV0IHJhd0RzdCA9IG1hdGNoWzNdLnRyaW0oKTtcblxuICAgICAgICBsZXQgc3JjID0gbWFwcy5zdGFuZGFyZC5tYXAucmVnaW9ucy5maW5kKChyKSA9PiByLm5hbWUgPT0gcmF3U3JjKTtcbiAgICAgICAgaWYgKHNyYyA9PSBudWxsKVxuICAgICAgICAgIHRocm93IGVycm9yKGBmYWlsZWQgdG8gZmluZCByZWdpb24gZm9yIHJldHJlYXQ6ICR7cmF3fWApO1xuXG4gICAgICAgIGxldCBkc3QgPSBtYXBzLnN0YW5kYXJkLm1hcC5yZWdpb25zLmZpbmQoKHIpID0+IHIubmFtZSA9PSByYXdEc3QpO1xuICAgICAgICBpZiAoZHN0ID09IG51bGwpXG4gICAgICAgICAgdGhyb3cgZXJyb3IoYGZhaWxlZCB0byBmaW5kIHJlZ2lvbiBmb3IgcmV0cmVhdDogJHtyYXd9YCk7XG5cbiAgICAgICAgbGV0IHVuaXQgPSBldmljdGVkLmZpbmQoKHUpID0+IHUucmVnaW9uID09IHNyYyAmJiB1LnRlYW0gPT0gdGVhbSk7XG4gICAgICAgIGlmICh1bml0ID09IG51bGwpXG4gICAgICAgICAgdGhyb3cgZXJyb3IoYGZhaWxlZCB0byBmaW5kIHVuaXQgZm9yIHJldHJlYXQ6ICR7cmF3fSAke3RlYW19YCk7XG5cbiAgICAgICAgcmV0cmVhdHMucHVzaCh7IHVuaXQsIHRhcmdldDogZHN0LCByZXNvbHZlZDogcmVzdWx0ID09IFwicmVzb2x2ZWRcIiB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxldCByYXdSZWdpb24gPSBtYXRjaFs0XS50cmltKCk7XG5cbiAgICAgICAgbGV0IHJlZ2lvbiA9IG1hcHMuc3RhbmRhcmQubWFwLnJlZ2lvbnMuZmluZCgocikgPT4gci5uYW1lID09IHJhd1JlZ2lvbik7XG4gICAgICAgIGlmIChyZWdpb24gPT0gbnVsbClcbiAgICAgICAgICB0aHJvdyBlcnJvcihgZmFpbGVkIHRvIGZpbmQgcmVnaW9uIGZvciByZXRyZWF0OiAke3Jhd31gKTtcblxuICAgICAgICBsZXQgdW5pdCA9IFsuLi5ldmljdGVkXS5maW5kKFxuICAgICAgICAgICh1KSA9PiB1LnJlZ2lvbiA9PSByZWdpb24gJiYgdS50ZWFtID09IHRlYW1cbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHVuaXQgPT0gbnVsbClcbiAgICAgICAgICB0aHJvdyBlcnJvcihgZmFpbGVkIHRvIGZpbmQgdW5pdCBmb3IgcmV0cmVhdDogJHtyYXd9ICR7dGVhbX1gKTtcblxuICAgICAgICByZXRyZWF0cy5wdXNoKHsgdW5pdCwgdGFyZ2V0OiBudWxsLCByZXNvbHZlZDogcmVzdWx0ID09IFwicmVzb2x2ZWRcIiB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmV0cmVhdHM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZV9idWlsZHMoZ2FtZTogR2FtZVN0YXRlLCBpbnB1dHM6IElucHV0cykge1xuICBsZXQgYnVpbGRzID0gW107XG5cbiAgZm9yIChsZXQgdGVhbSBpbiBpbnB1dHMpIHtcbiAgICBmb3IgKGxldCByYXcgb2YgaW5wdXRzW3RlYW1dKSB7XG4gICAgICBsZXQgbWF0Y2ggPSAvKEJVSUxEXFxzKyhmbGVldHxhcm15KVxccysoLiopfCguKilERVNUUk9ZKVxccystPiguKikvLmV4ZWMoXG4gICAgICAgIHJhd1xuICAgICAgKTtcbiAgICAgIGlmIChtYXRjaCA9PSBudWxsKSB0aHJvdyBlcnJvcihgZmFpbGVkIHRvIG1hdGNoIGJ1aWxkOiAke3Jhd31gKTtcblxuICAgICAgbGV0IHJlc3VsdCA9IG1hdGNoWzVdLnRyaW0oKTtcblxuICAgICAgaWYgKG1hdGNoWzJdKSB7XG4gICAgICAgIGxldCB0eXBlID0gbWF0Y2hbMl0udHJpbSgpO1xuICAgICAgICBsZXQgcmF3UmVnaW9uID0gbWF0Y2hbM10udHJpbSgpO1xuXG4gICAgICAgIGxldCByZWdpb24gPSBtYXBzLnN0YW5kYXJkLm1hcC5yZWdpb25zLmZpbmQoKHIpID0+IHIubmFtZSA9PSByYXdSZWdpb24pO1xuICAgICAgICBpZiAocmVnaW9uID09IG51bGwpXG4gICAgICAgICAgdGhyb3cgZXJyb3IoYGZhaWxlZCB0byBmaW5kIHJlZ2lvbiBmb3IgYnVpbGQ6ICR7cmF3fWApO1xuXG4gICAgICAgIGxldCB1bml0ID0gbmV3IFVuaXQoXG4gICAgICAgICAgcmVnaW9uLFxuICAgICAgICAgIHR5cGUgPT0gXCJmbGVldFwiID8gVW5pdFR5cGUuV2F0ZXIgOiBVbml0VHlwZS5MYW5kLFxuICAgICAgICAgIHRlYW1cbiAgICAgICAgKTtcblxuICAgICAgICBidWlsZHMucHVzaCh7IHVuaXQsIHJlc29sdmVkOiByZXN1bHQgPT0gXCJyZXNvbHZlZFwiIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGV0IHJhd1JlZ2lvbiA9IG1hdGNoWzRdLnRyaW0oKTtcblxuICAgICAgICBsZXQgcmVnaW9uID0gbWFwcy5zdGFuZGFyZC5tYXAucmVnaW9ucy5maW5kKChyKSA9PiByLm5hbWUgPT0gcmF3UmVnaW9uKTtcbiAgICAgICAgaWYgKHJlZ2lvbiA9PSBudWxsKVxuICAgICAgICAgIHRocm93IGVycm9yKGBmYWlsZWQgdG8gZmluZCByZWdpb24gZm9yIGJ1aWxkOiAke3Jhd31gKTtcblxuICAgICAgICBsZXQgdW5pdCA9IFsuLi5nYW1lLnVuaXRzXS5maW5kKFxuICAgICAgICAgICh1KSA9PiB1LnJlZ2lvbiA9PSByZWdpb24gJiYgdS50ZWFtID09IHRlYW1cbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHVuaXQgPT0gbnVsbCkge1xuICAgICAgICAgIGlmIChyZXN1bHQgIT0gXCJyZXNvbHZlZFwiKSBjb250aW51ZTtcbiAgICAgICAgICBlbHNlIHRocm93IGVycm9yKGBmYWlsZWQgdG8gZmluZCB1bml0IGZvciBidWlsZDogJHtyYXd9ICR7dGVhbX1gKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGJ1aWxkcy5wdXNoKHsgdW5pdCwgcmVzb2x2ZWQ6IHJlc3VsdCA9PSBcInJlc29sdmVkXCIgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJ1aWxkcztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoR2FtZURhdGEoKSB7XG4gIC8vIGdldCBnYW1lIGhpc3RvcnkgcGhhc2UgT1xuICBjb25zdCBpbnB1dHMgPSBhd2FpdCBnZXRfaGlzdG9yeSgyMjEwNTMsIFwiT1wiLCAwKTtcbiAgY29uc29sZS5sb2coaW5wdXRzKTtcbiAgZnMud3JpdGVGaWxlU3luYyhcImdhbWUtZGF0YS5qc29uXCIsIEpTT04uc3RyaW5naWZ5KGlucHV0cywgbnVsbCwgMikpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmV0Y2hTaW5nbGVHYW1lKGlkOiBudW1iZXIpIHtcbiAgY29uc3QgZ2FtZSA9IGF3YWl0IGdldF9nYW1lKGlkKTtcbiAgbGV0IGRhdGEgPSB3cml0ZV9nYW1lKGdhbWUpO1xuICBsZXQgcGFyc2VkID0gcmVhZF9nYW1lKGRhdGEpO1xuXG4gIHJldHVybiBwYXJzZWQ7XG59XG4iLCJpbXBvcnQgZnMgZnJvbSBcImZzLWV4dHJhXCI7XG5cbmltcG9ydCB7XG4gIEdhbWVTdGF0ZSxcbiAgbWFwcyxcbiAgSG9sZE9yZGVyLFxuICByZXNvbHZlLFxuICBVbml0LFxuICBNb3ZlT3JkZXIsXG4gIFN1cHBvcnRPcmRlcixcbiAgQ29udm95T3JkZXIsXG4gIFVuaXRUeXBlLFxuICBmb3JtYXR0ZXIsXG59IGZyb20gXCJkaXBsb21hY3ktY29tbW9uXCI7XG5cbmltcG9ydCAqIGFzIHNjcmFwZSBmcm9tIFwiLi9zY3JhcGVcIjtcbmltcG9ydCB7IGVycm9yIH0gZnJvbSBcIi4vdXRpbFwiO1xuXG5jb25zdCBpZ25vcmVkX2dhbWVzID0gbmV3IFNldChbXG4gIDE1MDU1MSwgLy8gRmFsbCAxOTA1IGluY29ycmVjdCBqdWRnZW1lbnRcbiAgMTUyMDQ2LCAvLyBGYWxsIDE5MDQgaW52YWxpZCBidWlsZC9kZXN0cm95IGlucHV0c1xuICAxNTMxMDQsIC8vIFNwcmluZyAxOTA1IHJldHJlYXQgdG8gb2NjdXBpZWQgbXVuaWNoIChQQVJTSU5HIEVSUk9SLCBzaG91bGQgaGF2ZSBpZ25vcmVkIHNwcmluZyAxOTA1IHJldHJlYXQgYmVjYXVzZSBpdCB3YXMgbm90IGNvbmNsdWRlZClcbiAgMTUzMzIzLCAvLyBGYWxsIDE5MDMgaW52YWxpZCBidWlsZC9kZXN0cm95IGlucHV0c1xuICAxNTMzNDksIC8vIEZhbGwgMTkwNCBpbnZhbGlkIGJ1aWxkL2Rlc3Ryb3kgaW5wdXRzXG4gIDE1NDI0MiwgLy8gRmFsbCAxOTA0IGludmFsaWQgYnVpbGQvZGVzdHJveSBpbnB1dHNcbiAgMTU0OTQ0LCAvLyBGYWxsIDE5MDIgaW52YWxpZCBidWlsZC9kZXN0cm95IGlucHV0c1xuICAxNTU0MjIsIC8vIFNwcmluZyAxOTAzIGVuZ2xpc2ggZmxlZXQgaW4gaXJpc2ggc2VhIGJlY29tZXMgaXRhbGlhblxuICAxNDE5MzEsIC8vIFNwcmluZyAxOTAxIGludmFsaWQgb3JkZXIgaW5wdXRzXG4gIDE0MzUwNSwgLy8gU3ByaW5nIDE5MDQgdHVya2lzaCBmbGVldCBpbiBhZWdlYW4gc2VhIGJlY29tZXMgYXVzdHJpYW5cbiAgMTQ0NTgyLCAvLyBTcHJpbmcgMTkxMyBmcmVuY2ggZmxlZXQgaW4ga2llbCBiZWNvbWVzIHJ1c3NpYW5cbiAgMTM5NDYwLCAvLyBpZGVrXG4gIDEzOTgxNSwgLy8gU3ByaW5nIDE5MTQgc3BhaW5cbiAgMTQxMjc3LCAvLyBGYWxsIDE5MDEgbWVzc2VkIHVwIGNvbnZveSBzdHVmZlxuICAxNDI1ODAsIC8vIEZhbGwgMTkwMiBWZW5jaWUgbW92ZSBUdXNjYW55IGZhaWxzIGZvciBubyByZWFzb25cbiAgMTQ0ODI1LCAvLyBGYWxsIDE5MDggQnVyZ3VuZHkgbW92ZSBNdW5pY2ggZmFpbHMgZm9yIG5vIHJlYXNvblxuICAxNDU2NDUsIC8vIEZhbGwgMTkwNCBCdWlsZCBmbGVldCBTdC4gUGV0ZXJzYnVyZyBpcyBhY3R1YWxseSBhbiBhcm15XG4gIDE0NzUyMSwgLy8gU3ByaW5nIDE5MDYgUmV0cmVhdCBFbmdsaXNoIGZsZWV0IGluIHN0LiBwZXRlcnNidXJnIGJlY29tZXMgcnVzc2lhblxuICAxNDkyODAsIC8vIEZhbGwgMTkwNCBCdWlsZCBkZXN0cm95IGZvcmVpZ24gdW5pdFxuICAxNDk4NzEsIC8vIEZhbGwgMTkwMSBtZXNzZWQgdXAgY29udm95IHN0dWZmXG4gIDE0OTg5MCwgLy8gRmFsbCAxOTA2IGludmFsaWQgYnVpbGQvZGVzdHJveSBpbnB1dHNcbl0pO1xuY29uc3QgdGVhbXMgPSBuZXcgU2V0KFtcbiAgXCJFTkdMQU5EXCIsXG4gIFwiRlJBTkNFXCIsXG4gIFwiR0VSTUFOWVwiLFxuICBcIklUQUxZXCIsXG4gIFwiQVVTVFJJQVwiLFxuICBcIlJVU1NJQVwiLFxuICBcIlRVUktFWVwiLFxuXSk7XG5cbmNvbnN0IHRvdGFscyA9IHsgY2hlY2tlZDogMCwgc2tpcHBlZF92aWE6IDAsIHNraXBwZWRfdGVhbTogMCB9O1xuXG5mdW5jdGlvbiBydW5fZ2FtZShpZDogbnVtYmVyLCB0dXJuczogc2NyYXBlLlR1cm5bXSkge1xuICBsZXQgZ2FtZSA9IG5ldyBHYW1lU3RhdGUobWFwcy5zdGFuZGFyZC5tYXAsIFtdKTtcblxuICBmb3IgKGxldCBpID0gMDsgaSA8IHR1cm5zLmxlbmd0aDsgKytpKSB7XG4gICAgY29uc29sZS5kZWJ1ZyhcbiAgICAgIGBwcm9jZXNzaW5nICR7aSAlIDIgPyBcImZhbGxcIiA6IFwic3ByaW5nXCJ9ICR7MTkwMSArIE1hdGguZmxvb3IoaSAvIDIpfWBcbiAgICApO1xuXG4gICAgbGV0IHJlbW90ZSA9IHNjcmFwZS5wYXJzZV9vcmRlcnMoZ2FtZSwgdHVybnNbaV0ub3JkZXJzKTtcbiAgICBsZXQgb3JkZXJzID0gcmVtb3RlLm9yZGVycy5zbGljZSgpO1xuXG4gICAgaWYgKG9yZGVycy5maW5kKChvKSA9PiBvLnR5cGUgPT0gXCJtb3ZlXCIgJiYgby5yZXF1aXJlQ29udm95KSkge1xuICAgICAgKyt0b3RhbHMuc2tpcHBlZF92aWE7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYHNraXBwaW5nICR7aWR9IC0gZm91bmQgVklBIENPTlZPWSAoJHt0b3RhbHMuc2tpcHBlZF92aWF9IHRvdGFsKWBcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IHggPSBbLi4uZ2FtZS51bml0c10uZmluZCgodSkgPT4gIXRlYW1zLmhhcyh1LnRlYW0pKTtcbiAgICBpZiAoeCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGBza2lwcGluZyAke2lkfSAtIGZvdW5kIHRlYW0gJHt4LnRlYW19ICgke3RvdGFscy5za2lwcGVkX3RlYW19IHRvdGFsKWBcbiAgICAgICk7XG4gICAgICArK3RvdGFscy5za2lwcGVkX3RlYW07XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgZm9yIChsZXQgdW5pdCBvZiBnYW1lLnVuaXRzKSB7XG4gICAgICBsZXQgb3JkZXIgPSBvcmRlcnMuZmluZCgobykgPT4gby51bml0ID09IHVuaXQpO1xuICAgICAgaWYgKG9yZGVyKSBjb250aW51ZTtcbiAgICAgIG9yZGVycy5wdXNoKG5ldyBIb2xkT3JkZXIodW5pdCkpO1xuICAgIH1cblxuICAgIGxldCBsb2NhbCA9IHJlc29sdmUob3JkZXJzKTtcblxuICAgIGZvciAobGV0IG1vdmUgb2YgbG9jYWwucmVzb2x2ZWQpIHtcbiAgICAgIGlmICghZ2FtZS51bml0cy5oYXMobW92ZS51bml0KSkgZGVidWdnZXI7XG4gICAgICBnYW1lLnVuaXRzLmRlbGV0ZShtb3ZlLnVuaXQpO1xuICAgICAgZ2FtZS51bml0cy5hZGQobmV3IFVuaXQobW92ZS50YXJnZXQsIG1vdmUudW5pdC50eXBlLCBtb3ZlLnVuaXQudGVhbSkpO1xuICAgIH1cblxuICAgIGZvciAobGV0IG9yZGVyIG9mIG9yZGVycykge1xuICAgICAgaWYgKG9yZGVyLnR5cGUgPT0gXCJtb3ZlXCIpIHtcbiAgICAgICAgaWYgKGxvY2FsLnJlc29sdmVkLmluY2x1ZGVzKG9yZGVyKSAhPSByZW1vdGUucmVzb2x2ZWQuaW5jbHVkZXMob3JkZXIpKSB7XG4gICAgICAgICAgZm9yIChsZXQgcGFpciBvZiBsb2NhbC5yZWFzb25zKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgJHtwYWlyWzBdfTogJHtwYWlyWzFdfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zb2xlLmxvZyhvcmRlcik7XG4gICAgICAgICAgZGVidWdnZXI7XG4gICAgICAgICAgcmVzb2x2ZShvcmRlcnMpO1xuICAgICAgICAgIHRocm93IGVycm9yKGBNaXNtYXRjaCBpbiBnYW1lICR7aWR9YCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobG9jYWwuZXZpY3RlZC5sZW5ndGgpIHtcbiAgICAgIGxldCBldmljdGVkID0gbmV3IFNldChsb2NhbC5ldmljdGVkKTtcbiAgICAgIGxldCByZXRyZWF0cyA9IHNjcmFwZS5wYXJzZV9yZXRyZWF0cyhsb2NhbC5ldmljdGVkLCB0dXJuc1tpXS5yZXRyZWF0cyEpO1xuICAgICAgZm9yIChsZXQgcmV0cmVhdCBvZiByZXRyZWF0cykge1xuICAgICAgICBpZiAocmV0cmVhdC5yZXNvbHZlZCkge1xuICAgICAgICAgIGlmIChyZXRyZWF0LnRhcmdldCkgZ2FtZS5tb3ZlKHJldHJlYXQudW5pdCwgcmV0cmVhdC50YXJnZXQpO1xuICAgICAgICAgIGVsc2UgZ2FtZS51bml0cy5kZWxldGUocmV0cmVhdC51bml0KTtcbiAgICAgICAgICBldmljdGVkLmRlbGV0ZShyZXRyZWF0LnVuaXQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBmb3IgKGxldCB1bml0IG9mIGV2aWN0ZWQpIHtcbiAgICAgICAgZ2FtZS51bml0cy5kZWxldGUodW5pdCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGkgJSAyID09IDEpIHtcbiAgICAgIGxldCBidWlsZHMgPSBzY3JhcGUucGFyc2VfYnVpbGRzKGdhbWUsIHR1cm5zW2ldLmJ1aWxkcyEpO1xuXG4gICAgICBmb3IgKGxldCBidWlsZCBvZiBidWlsZHMpIHtcbiAgICAgICAgaWYgKGJ1aWxkLnJlc29sdmVkKSB7XG4gICAgICAgICAgaWYgKGdhbWUudW5pdHMuaGFzKGJ1aWxkLnVuaXQpKSBnYW1lLnVuaXRzLmRlbGV0ZShidWlsZC51bml0KTtcbiAgICAgICAgICBlbHNlIGdhbWUudW5pdHMuYWRkKGJ1aWxkLnVuaXQpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChsZXQgcmVnaW9uIG9mIGdhbWUubWFwLnJlZ2lvbnMpIHtcbiAgICAgIGxldCB1bml0cyA9IFsuLi5nYW1lLnVuaXRzXS5maWx0ZXIoKHUpID0+IHUucmVnaW9uID09IHJlZ2lvbik7XG4gICAgICBpZiAodW5pdHMubGVuZ3RoID4gMSkgdGhyb3cgZXJyb3IoYE1pc21hdGNoIGluIGdhbWUgJHtpZH1gKTtcbiAgICB9XG5cbiAgICBpZiAoaSA9PT0gdHVybnMubGVuZ3RoIC0gMSkge1xuICAgICAgY29uc29sZS5sb2coXCJ3cml0aW5nIHRvIGZpbGVcIik7XG4gICAgICBjb25zdCBuZXdVbml0cyA9IEFycmF5LmZyb20oZ2FtZS51bml0cyk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKFxuICAgICAgICBcIi4uL3dlYmFwcC9zcmMvZGF0YS9maW5hbC1zdGF0ZS5qc29uXCIsXG4gICAgICAgIEpTT04uc3RyaW5naWZ5KG5ld1VuaXRzLCBudWxsLCAyKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICArK3RvdGFscy5jaGVja2VkO1xufVxuXG5hc3luYyBmdW5jdGlvbiBydW4oKSB7XG4gIGZzLm1rZGlycFN5bmMoXCJkYXRhXCIpO1xuICBmcy5ta2RpcnBTeW5jKFwiY2FjaGVcIik7XG5cbiAgLy8gcnVuX2dhbWUoMTUwMTY4LCBzY3JhcGUucmVhZF9nYW1lKGZzLnJlYWRGaWxlU3luYygnZGF0YS8xNTAxNjgnKSkpO1xuXG4gIGxldCBhbGxJZHMgPSBmcy5yZWFkZGlyU3luYyhcImRhdGFcIik7XG5cbiAgZm9yIChsZXQgaWQgb2YgYWxsSWRzKSB7XG4gICAgaWYgKGlkID09IFwia25vd24uanNvblwiKSBjb250aW51ZTtcbiAgICBpZiAoaWdub3JlZF9nYW1lcy5oYXMocGFyc2VJbnQoaWQpKSkgY29udGludWU7XG5cbiAgICBjb25zb2xlLmxvZyhgcHJvY2Vzc2luZyBnYW1lICR7aWR9YCk7XG5cbiAgICBsZXQgZ2FtZSA9IHNjcmFwZS5yZWFkX2dhbWUoZnMucmVhZEZpbGVTeW5jKGBkYXRhLyR7aWR9YCkpO1xuICAgIHJ1bl9nYW1lKHBhcnNlSW50KGlkKSwgZ2FtZSk7XG4gIH1cblxuICBjb25zb2xlLmxvZyh0b3RhbHMpO1xufVxuXG5sZXQgeCA9IGdsb2JhbCBhcyBhbnk7XG5pZiAoeC5kZXZ0b29sc0Zvcm1hdHRlcnMgPT0gbnVsbCkgeC5kZXZ0b29sc0Zvcm1hdHRlcnMgPSBbXTtcbnguZGV2dG9vbHNGb3JtYXR0ZXJzLnB1c2goZm9ybWF0dGVyKTtcblxubGV0IG9wID0gcHJvY2Vzcy5hcmd2WzJdO1xuXG5jb25zdCBNWV9HQU1FX0lEID0gMjIxMDUzO1xuXG5pZiAob3AgPT0gXCJzY3JhcGVcIikgc2NyYXBlLnJ1bigpO1xuZWxzZSBpZiAob3AgPT0gXCJjaGVja1wiKSBzY3JhcGUuY2hlY2soKTtcbmVsc2UgaWYgKG9wID09IFwicnVuXCIpIHJ1bigpO1xuZWxzZSBpZiAob3AgPT0gXCJmZXRjaFwiKSBzY3JhcGUuZmV0Y2hHYW1lRGF0YSgpO1xuLy8gZWxzZSBpZiAob3AgPT0gXCJ0ZXN0XCIpIHNjcmFwZS5mZXRjaFNpbmdsZUdhbWUoTVlfR0FNRV9JRCk7XG5lbHNlIGlmIChvcCA9PSBcInRlc3RcIikge1xuICBjb25zdCB0dXJucyA9IHNjcmFwZS5mZXRjaFNpbmdsZUdhbWUoTVlfR0FNRV9JRCk7XG4gIHR1cm5zLnRoZW4oKHJlcykgPT4ge1xuICAgIGNvbnN0IGdhbWVGaW5hbCA9IHJ1bl9nYW1lKE1ZX0dBTUVfSUQsIHJlcyk7XG4gICAgY29uc29sZS5sb2coZ2FtZUZpbmFsKTtcbiAgfSk7XG59IGVsc2Uge1xuICBjb25zb2xlLmxvZyhcInVua25vd24gb3IgbWlzc2luZyBjb21tYW5kXCIpO1xufVxuIl0sIm5hbWVzIjpbIm1hcHMiLCJVbml0IiwiVW5pdFR5cGUiLCJIb2xkT3JkZXIiLCJNb3ZlT3JkZXIiLCJTdXBwb3J0T3JkZXIiLCJDb252b3lPcmRlciIsIkdhbWVTdGF0ZSIsInNjcmFwZS5wYXJzZV9vcmRlcnMiLCJyZXNvbHZlIiwic2NyYXBlLnBhcnNlX3JldHJlYXRzIiwic2NyYXBlLnBhcnNlX2J1aWxkcyIsInJ1biIsInNjcmFwZS5yZWFkX2dhbWUiLCJmb3JtYXR0ZXIiLCJzY3JhcGUucnVuIiwic2NyYXBlLmNoZWNrIiwic2NyYXBlLmZldGNoR2FtZURhdGEiLCJzY3JhcGUuZmV0Y2hTaW5nbGVHYW1lIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7U0FBZ0IsS0FBSyxDQUFDLEdBQVc7SUFDN0IsU0FBUztJQUNULE9BQU8sSUFBSSxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7Q0FDekI7QUFFRCxVQUFpQixPQUFPLENBQUMsS0FBYSxFQUFFLE1BQWM7SUFDbEQsSUFBSSxJQUFJLEdBQUcsSUFBSSxNQUFNLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ2xDLElBQUksS0FBSyxDQUFDO0lBQ1YsT0FBTyxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDNUIsTUFBTSxLQUFLLENBQUM7Q0FDbkI7OztBQ2VELE1BQU0sV0FBVyxHQUFHLDRCQUE0QixDQUFDO0FBRWpELFNBQWUsYUFBYSxDQUFDLElBQVk7O1FBQ3ZDLElBQUksR0FBRyxHQUFHLGdDQUFnQyxJQUFJLEVBQUUsQ0FBQztRQUNqRCxJQUFJO1lBQ0YsSUFBSSxRQUFRLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxFQUFFO2dCQUNoQyxPQUFPLEVBQUUsRUFBRSxNQUFNLEVBQUUsYUFBYSxXQUFXLEVBQUUsRUFBRTtnQkFDL0MsdUJBQXVCLEVBQUUsSUFBSTtnQkFDN0IsY0FBYyxFQUFFLEtBQUs7YUFDdEIsQ0FBQyxDQUFDO1lBRUgsSUFBSSxRQUFRLENBQUMsVUFBVSxJQUFJLEdBQUc7Z0JBQUUsTUFBTSxLQUFLLENBQUMscUJBQXFCLENBQUMsQ0FBQztZQUNuRSxPQUFPLFFBQVEsQ0FBQyxJQUFJLENBQUM7U0FDdEI7UUFBQyxPQUFPLENBQUMsRUFBRTtZQUNWLFNBQVM7WUFDVCxNQUFNLENBQUMsQ0FBQztTQUNUO0tBQ0Y7Q0FBQTtBQUVELFNBQWUsWUFBWSxDQUFDLEtBQWE7O1FBR3ZDLElBQUksSUFBSSxDQUFDOzs7O1FBSVQsSUFBSSxHQUFHLE1BQU0sYUFBYSxDQUFDLHFCQUFxQixLQUFLLEVBQUUsQ0FBQyxDQUFDOzs7UUFJekQsT0FBTyxJQUFJLENBQUM7S0FDYjtDQUFBO0FBRUQsU0FBZSxXQUFXLENBQUMsRUFBVSxFQUFFLEtBQWEsRUFBRSxJQUFZOztRQUNoRSxJQUFJLEtBQUssR0FBRyxXQUFXLEVBQUUsVUFBVSxLQUFLLFVBQVUsSUFBSSxFQUFFLENBQUM7UUFDekQsSUFBSSxJQUFJLEdBQUcsTUFBTSxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFckMsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ2xCLElBQUksTUFBTSxHQUFXLEVBQUUsQ0FBQztRQUV4QixLQUFLLElBQUksS0FBSyxJQUFJLE9BQU8sQ0FBQyw4QkFBOEIsRUFBRSxJQUFJLENBQUMsRUFBRTtZQUMvRCxJQUFJLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEIsSUFBSSxJQUFJLEdBQUcsRUFBRSxDQUFDO1lBRWQsS0FBSyxJQUFJLElBQUksSUFBSSxPQUFPLENBQUMsaUJBQWlCLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQ3JELElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDcEI7WUFDRCxJQUFJLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQztnQkFBRSxTQUFTO1lBRS9CLEtBQUssR0FBRyxJQUFJLENBQUM7WUFDYixNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDO1NBQ3JCO1FBRUQsSUFBSSxLQUFLO1lBQUUsT0FBTyxNQUFNLENBQUM7UUFFekIsT0FBTyxTQUFTLENBQUM7S0FDbEI7Q0FBQTtBQUVELFNBQXNCLFFBQVEsQ0FBQyxFQUFVOztRQUN2QyxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUM7UUFDZixJQUFJLE9BQU8sR0FBRyxNQUFNLFlBQVksQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFbEQsS0FBSyxJQUFJLE9BQU8sSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxFQUFFO1lBQy9DLElBQUksSUFBSSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7WUFDeEIsSUFBSSxJQUFJLEdBQVMsRUFBRSxNQUFNLEVBQUUsRUFBRSxFQUFFLENBQUM7WUFFaEMsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDO1lBQ2xCLEtBQUssSUFBSSxLQUFLLElBQUksT0FBTyxDQUN2QixrR0FBa0csRUFDbEcsT0FBTyxDQUNSLEVBQUU7Z0JBQ0QsSUFBSSxFQUFFLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDMUIsTUFBTSxLQUFLLENBQUMsaUNBQWlDLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ3JELElBQUksSUFBSSxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzVCLE1BQU0sS0FBSyxDQUFDLGlDQUFpQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUVyRCxJQUFJLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3JCLElBQUksTUFBTSxHQUFHLE1BQU0sV0FBVyxDQUFDLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQ2hELElBQUksTUFBTSxJQUFJLElBQUksSUFBSSxLQUFLLElBQUksR0FBRztvQkFBRSxTQUFTO2dCQUU3QyxLQUFLLEdBQUcsSUFBSSxDQUFDO2dCQUNiLFFBQVEsS0FBSztvQkFDWCxLQUFLLEdBQUc7d0JBQ04sSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLElBQUksRUFBRSxDQUFDO3dCQUMzQixNQUFNO29CQUNSLEtBQUssR0FBRzt3QkFDTixJQUFJLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQzt3QkFDdkIsTUFBTTtvQkFDUixLQUFLLEdBQUc7d0JBQ04sSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7d0JBQ3JCLE1BQU07aUJBQ1Q7YUFDRjtZQUVELElBQUksQ0FBQyxLQUFLO2dCQUFFLFNBQVM7WUFFckIsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUNsQjtRQUVELE9BQU8sS0FBSyxDQUFDO0tBQ2Q7Q0FBQTtBQUVELFNBQXNCLFFBQVEsQ0FBQyxJQUFZOztRQUN6QyxJQUFJLEdBQUcsR0FBRyw0RUFBNEUsSUFBSSxFQUFFLENBQUM7UUFDN0YsSUFBSSxJQUFJLEdBQUcsTUFBTSxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFcEMsSUFBSSxHQUFHLEdBQUcsSUFBSSxHQUFHLEVBQVUsQ0FBQztRQUM1QixLQUFLLElBQUksS0FBSyxJQUFJLE9BQU8sQ0FDdkIsZ0RBQWdELEVBQ2hELElBQUksQ0FDTCxFQUFFO1lBQ0QsSUFBSSxNQUFNLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2hDLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7U0FDakI7UUFFRCxPQUFPLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztLQUNqQjtDQUFBO0FBRUQsU0FBZ0IsU0FBUyxDQUFDLEdBQVc7SUFDbkMsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNoQyxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQVcsQ0FBQztJQUV2RCxLQUFLLElBQUksSUFBSSxJQUFJLElBQUksRUFBRTtRQUNyQixJQUFJLElBQUksQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRTtZQUN2RCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7U0FDcEI7UUFDRCxJQUFJLElBQUksQ0FBQyxRQUFRLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRTtZQUMzRCxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUM7U0FDdEI7UUFDRCxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLEVBQUU7O1lBRXhDLElBQUksSUFBSSxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNO2dCQUN2RSxNQUFNLEtBQUssQ0FBQyxtQkFBbUIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDdkQsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ1gsTUFBTTtTQUNQO0tBQ0Y7SUFFRCxPQUFPLElBQUksQ0FBQztDQUNiO0FBRUQsU0FBZ0IsVUFBVSxDQUFDLEtBQWE7SUFDdEMsSUFBSSxJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ3RELE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztDQUM1QjtBQUVELFNBQXNCLEdBQUc7O1FBQ3ZCLEVBQUUsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdEIsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUV2QixJQUFJLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFDZixJQUFJLFFBQVEsQ0FBQztRQUNiLElBQUksUUFBUSxHQUFHLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDdkMsSUFBSTtZQUNGLFFBQVEsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDLGlCQUFpQixDQUFvQixDQUFDO1lBQ2pFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxRQUFRLENBQUMsTUFBTSxLQUFLLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO1NBQzdEO1FBQUMsT0FBTyxDQUFDLEVBQUU7WUFDVixRQUFRLEdBQUcsSUFBSSxDQUFDO1NBQ2pCO1FBRUQsSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDO1FBQ2IsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLElBQUksSUFBSSxNQUFNLEdBQUcsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFO1lBQzdDLElBQUksSUFBSSxJQUFJLEVBQUUsRUFBRTtnQkFDZCxJQUFJLElBQUksRUFBRSxDQUFDO2dCQUNYLFNBQVM7YUFDVjtZQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDbEMsSUFBSSxHQUFHLEdBQUcsTUFBTSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFNUIsS0FBSyxJQUFJLEVBQUUsSUFBSSxHQUFHLEVBQUU7Z0JBQ2xCLElBQUksUUFBUSxDQUFDLE1BQU0sSUFBSSxDQUFDO29CQUFFLFFBQVEsQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDO2dCQUUvQyxJQUFJLFFBQVEsSUFBSSxFQUFFLElBQUksUUFBUSxDQUFDLE1BQU0sRUFBRTtvQkFDckMsSUFBSSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUM7b0JBQ3RCLFFBQVEsQ0FBQyxLQUFLLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQztvQkFDakMsUUFBUSxHQUFHLElBQUksQ0FBQztpQkFDakI7Z0JBRUQsSUFBSSxJQUFJLElBQUksQ0FBQyxFQUFFO29CQUNiLElBQUksSUFBSSxDQUFDLENBQUM7b0JBQ1YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDbkMsU0FBUztpQkFDVjtnQkFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUNuQyxJQUFJO29CQUNGLElBQUksVUFBVSxHQUFHLFFBQVEsRUFBRSxFQUFFLENBQUM7b0JBQzlCLElBQUksQ0FBQyxFQUFFLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxFQUFFO3dCQUNsQyxJQUFJLElBQUksR0FBRyxNQUFNLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQzt3QkFDOUIsSUFBSSxJQUFJLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO3dCQUM1QixJQUFJLE1BQU0sR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7d0JBRTdCLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQzs0QkFDaEQsTUFBTSxLQUFLLENBQUMsc0JBQXNCLENBQUMsQ0FBQzt3QkFFdEMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7cUJBQ3BDO29CQUVELElBQUksTUFBTSxJQUFJLENBQUMsRUFBRTt3QkFDZixFQUFFLFFBQVEsQ0FBQyxLQUFLLENBQUM7cUJBQ2xCO2lCQUNGO2dCQUFDLE9BQU8sQ0FBQyxFQUFFO29CQUNWLEVBQUUsTUFBTSxDQUFDO29CQUNULEVBQUUsQ0FBQyxjQUFjLENBQUMsWUFBWSxFQUFFLEdBQUcsRUFBRSxJQUFJLENBQUMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUFDO29CQUN0RCxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztpQkFDdEI7YUFDRjtZQUVELElBQUksUUFBUSxJQUFJLElBQUksRUFBRTtnQkFDcEIsRUFBRSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFDOUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLFFBQVEsQ0FBQyxNQUFNLEtBQUssUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7YUFDN0Q7U0FDRjtLQUNGO0NBQUE7QUFFRCxTQUFzQixLQUFLOztRQUN6QixFQUFFLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3RCLEVBQUUsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFdkIsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVwQyxLQUFLLElBQUksRUFBRSxJQUFJLE1BQU0sRUFBRTtZQUNyQixJQUFJLEVBQUUsSUFBSSxZQUFZO2dCQUFFLFNBQVM7WUFFakMsSUFBSSxJQUFJLEdBQUcsU0FBUyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFcEQsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1lBQ2QsSUFBSSxPQUFPLEdBQUcsTUFBTSxZQUFZLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBRWxELEtBQUssSUFBSSxPQUFPLElBQUksT0FBTyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsRUFBRTtnQkFDL0MsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDO2dCQUNsQixLQUFLLElBQUksQ0FBQyxJQUFJLE9BQU8sQ0FDbkIsa0dBQWtHLEVBQ2xHLE9BQU8sQ0FDUixFQUFFO29CQUNELEtBQUssR0FBRyxJQUFJLENBQUM7b0JBQ2IsTUFBTTtpQkFDUDtnQkFFRCxJQUFJLENBQUMsS0FBSztvQkFBRSxTQUFTO2dCQUNyQixFQUFFLEtBQUssQ0FBQzthQUNUO1lBRUQsSUFBSSxLQUFLLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtnQkFDeEIsSUFBSSxHQUFHLE1BQU0sUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNwQyxJQUFJLEtBQUssSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO29CQUN4QixNQUFNLEtBQUssQ0FBQyxhQUFhLEVBQUUsSUFBSSxLQUFLLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7aUJBQ3hEO2FBQ0Y7WUFFRCxJQUFJLE1BQU0sR0FBRyxDQUFDLENBQUM7WUFDZixJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7WUFDakIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUU7Z0JBQ3BDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU07b0JBQUUsTUFBTSxFQUFFLENBQUM7Z0JBQzdCLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVE7b0JBQUUsUUFBUSxFQUFFLENBQUM7YUFDbEM7WUFFRCxJQUFJLE1BQU0sSUFBSSxDQUFDLElBQUksUUFBUSxJQUFJLENBQUMsRUFBRTtnQkFDaEMsSUFBSSxHQUFHLE1BQU0sUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNwQyxPQUFPLENBQUMsR0FBRyxDQUNULEdBQUcsQ0FBQyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFDL0QsTUFBTSxDQUFDLE1BQ1QsSUFBSSxFQUFFLElBQUksS0FBSyxJQUFJLENBQ3BCLENBQUM7YUFDSDtpQkFBTTtnQkFDTCxPQUFPLENBQUMsR0FBRyxDQUNULEdBQUcsQ0FBQyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFDL0QsTUFBTSxDQUFDLE1BQ1QsSUFBSSxFQUFFLElBQUksS0FBSyxFQUFFLENBQ2xCLENBQUM7YUFDSDtZQUVELElBQUksSUFBSSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUM1QixFQUFFLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDdEM7S0FDRjtDQUFBO0FBRUQsU0FBZ0IsWUFBWSxDQUFDLElBQWUsRUFBRSxNQUFjO0lBQzFELElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQztJQUNqQyxJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsQ0FBQztRQUNuQkEsb0JBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUc7UUFDekJBLG9CQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHO1FBQ3pCQSxvQkFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRztRQUN6QkEsb0JBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUc7UUFDekJBLG9CQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHO1FBQ3pCQSxvQkFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRztRQUN6QkEsb0JBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUc7UUFDekJBLG9CQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHO1FBQ3pCQSxvQkFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsU0FBUztLQUNoQyxDQUFDLENBQUM7SUFFSCxJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7SUFDaEIsSUFBSSxRQUFRLEdBQUcsRUFBRSxDQUFDO0lBRWxCLEtBQUssSUFBSSxJQUFJLElBQUksTUFBTSxFQUFFO1FBQ3ZCLEtBQUssSUFBSSxHQUFHLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQzVCLElBQUksS0FBSyxHQUFHLDJDQUEyQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNsRSxJQUFJLEtBQUssSUFBSSxJQUFJO2dCQUFFLE1BQU0sS0FBSyxDQUFDLDBCQUEwQixHQUFHLEVBQUUsQ0FBQyxDQUFDO1lBRWhFLElBQUksVUFBVSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNqQyxJQUFJLEVBQUUsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDbEIsSUFBSSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQzNCLElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUU3QixJQUFJLE1BQU0sSUFBSSwrQkFBK0I7Z0JBQUUsU0FBUztZQUV4RCxJQUFJLE1BQU0sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksSUFBSSxVQUFVLENBQUMsQ0FBQztZQUNoRSxJQUFJLE1BQU0sSUFBSSxJQUFJO2dCQUNoQixNQUFNLEtBQUssQ0FBQyxvQ0FBb0MsR0FBRyxHQUFHLENBQUMsQ0FBQztZQUUxRCxJQUFJLElBQUksR0FBRyxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FDN0IsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sSUFBSSxNQUFNLElBQUksQ0FBQyxDQUFDLElBQUksSUFBSSxJQUFJLENBQzVDLENBQUM7WUFDRixJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7Z0JBQ2hCLElBQUksS0FBSztvQkFDUCxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFDWCxJQUFJLEdBQUcsSUFBSUMsb0JBQUksQ0FDZCxNQUFNLEVBQ04sTUFBTSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBR0Msd0JBQVEsQ0FBQyxLQUFLLEdBQUdBLHdCQUFRLENBQUMsSUFBSSxFQUNuRCxJQUFJLENBQ0wsRUFDRixDQUFDOztvQkFDQyxNQUFNLEtBQUssQ0FBQyx3QkFBd0IsSUFBSSxJQUFJLE1BQU0sQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDO2FBQ2xFO1lBRUQsSUFBSSxLQUFLLENBQUM7WUFFVixJQUFJLEVBQUUsSUFBSSxNQUFNLElBQUksTUFBTSxJQUFJLHdDQUF3QyxFQUFFO2dCQUN0RSxLQUFLLEdBQUcsSUFBSUMseUJBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUM3QjtpQkFBTSxJQUFJLEVBQUUsSUFBSSxNQUFNLEVBQUU7Z0JBQ3ZCLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBRWpDLElBQUksU0FBUyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDbkMsSUFBSSxNQUFNLEdBQUdILG9CQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLElBQUksU0FBUyxDQUFDLENBQUM7Z0JBQ3hFLElBQUksTUFBTSxJQUFJLElBQUk7b0JBQ2hCLE1BQU0sS0FBSyxDQUFDLGdEQUFnRCxJQUFJLEdBQUcsQ0FBQyxDQUFDO2dCQUV2RSxLQUFLLEdBQUcsSUFBSUkseUJBQVMsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ3pELElBQUksTUFBTSxJQUFJLFVBQVUsRUFBRTtvQkFDeEIsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztpQkFDdEI7YUFDRjtpQkFBTSxJQUFJLEVBQUUsSUFBSSxTQUFTLEVBQUU7Z0JBQzFCLElBQUksQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFFMUMsSUFBSSxHQUFHLEdBQUdKLG9CQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLElBQUksTUFBTSxDQUFDLENBQUM7Z0JBQ2xFLElBQUksR0FBRyxJQUFJLElBQUk7b0JBQ2IsTUFBTSxLQUFLLENBQ1QsbURBQW1ELE1BQU0sR0FBRyxDQUM3RCxDQUFDO2dCQUVKLElBQUksTUFBTSxJQUFJLE1BQU07b0JBQUUsS0FBSyxHQUFHLElBQUlLLDRCQUFZLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO3FCQUNyRDtvQkFDSCxJQUFJLEdBQUcsR0FBR0wsb0JBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksSUFBSSxNQUFNLENBQUMsQ0FBQztvQkFDbEUsSUFBSSxHQUFHLElBQUksSUFBSTt3QkFDYixNQUFNLEtBQUssQ0FDVCxtREFBbUQsTUFBTSxHQUFHLENBQzdELENBQUM7b0JBRUosS0FBSyxHQUFHLElBQUlLLDRCQUFZLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztpQkFDMUM7YUFDRjtpQkFBTSxJQUFJLEVBQUUsSUFBSSxRQUFRLEVBQUU7Z0JBQ3pCLElBQUksQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFFMUMsSUFBSSxHQUFHLEdBQUdMLG9CQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLElBQUksTUFBTSxDQUFDLENBQUM7Z0JBQ2xFLElBQUksR0FBRyxJQUFJLElBQUk7b0JBQ2IsTUFBTSxLQUFLLENBQ1QsaURBQWlELE1BQU0sR0FBRyxDQUMzRCxDQUFDO2dCQUVKLElBQUksR0FBRyxHQUFHQSxvQkFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxJQUFJLE1BQU0sQ0FBQyxDQUFDO2dCQUNsRSxJQUFJLEdBQUcsSUFBSSxJQUFJO29CQUNiLE1BQU0sS0FBSyxDQUFDLCtDQUErQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO2dCQUV4RSxLQUFLLEdBQUcsSUFBSU0sMkJBQVcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO2FBQ3pDO2lCQUFNO2dCQUNMLE1BQU0sS0FBSyxDQUFDLGtCQUFrQixFQUFFLEVBQUUsQ0FBQyxDQUFDO2FBQ3JDO1lBRUQsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztTQUNwQjtLQUNGO0lBRUQsT0FBTyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsQ0FBQztDQUM3QjtBQUVELFNBQWdCLGNBQWMsQ0FBQyxPQUFlLEVBQUUsTUFBYztJQUM1RCxJQUFJLFFBQVEsR0FBRyxFQUFFLENBQUM7SUFFbEIsS0FBSyxJQUFJLElBQUksSUFBSSxNQUFNLEVBQUU7UUFDdkIsS0FBSyxJQUFJLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDNUIsSUFBSSxLQUFLLEdBQUcsd0NBQXdDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQy9ELElBQUksS0FBSyxJQUFJLElBQUk7Z0JBQUUsTUFBTSxLQUFLLENBQUMsNEJBQTRCLEdBQUcsR0FBRyxDQUFDLENBQUM7WUFFbkUsSUFBSSxNQUFNLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQzdCLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFO2dCQUNaLElBQUksTUFBTSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDN0IsSUFBSSxNQUFNLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUU3QixJQUFJLEdBQUcsR0FBR04sb0JBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksSUFBSSxNQUFNLENBQUMsQ0FBQztnQkFDbEUsSUFBSSxHQUFHLElBQUksSUFBSTtvQkFDYixNQUFNLEtBQUssQ0FBQyxzQ0FBc0MsR0FBRyxFQUFFLENBQUMsQ0FBQztnQkFFM0QsSUFBSSxHQUFHLEdBQUdBLG9CQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLElBQUksTUFBTSxDQUFDLENBQUM7Z0JBQ2xFLElBQUksR0FBRyxJQUFJLElBQUk7b0JBQ2IsTUFBTSxLQUFLLENBQUMsc0NBQXNDLEdBQUcsRUFBRSxDQUFDLENBQUM7Z0JBRTNELElBQUksSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsQ0FBQztnQkFDbEUsSUFBSSxJQUFJLElBQUksSUFBSTtvQkFDZCxNQUFNLEtBQUssQ0FBQyxvQ0FBb0MsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDLENBQUM7Z0JBRWpFLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxRQUFRLEVBQUUsTUFBTSxJQUFJLFVBQVUsRUFBRSxDQUFDLENBQUM7YUFDdEU7aUJBQU07Z0JBQ0wsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUVoQyxJQUFJLE1BQU0sR0FBR0Esb0JBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksSUFBSSxTQUFTLENBQUMsQ0FBQztnQkFDeEUsSUFBSSxNQUFNLElBQUksSUFBSTtvQkFDaEIsTUFBTSxLQUFLLENBQUMsc0NBQXNDLEdBQUcsRUFBRSxDQUFDLENBQUM7Z0JBRTNELElBQUksSUFBSSxHQUFHLENBQUMsR0FBRyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQzFCLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLElBQUksTUFBTSxJQUFJLENBQUMsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUM1QyxDQUFDO2dCQUNGLElBQUksSUFBSSxJQUFJLElBQUk7b0JBQ2QsTUFBTSxLQUFLLENBQUMsb0NBQW9DLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUVqRSxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLE1BQU0sSUFBSSxVQUFVLEVBQUUsQ0FBQyxDQUFDO2FBQ3ZFO1NBQ0Y7S0FDRjtJQUVELE9BQU8sUUFBUSxDQUFDO0NBQ2pCO0FBRUQsU0FBZ0IsWUFBWSxDQUFDLElBQWUsRUFBRSxNQUFjO0lBQzFELElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQztJQUVoQixLQUFLLElBQUksSUFBSSxJQUFJLE1BQU0sRUFBRTtRQUN2QixLQUFLLElBQUksR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUM1QixJQUFJLEtBQUssR0FBRyxvREFBb0QsQ0FBQyxJQUFJLENBQ25FLEdBQUcsQ0FDSixDQUFDO1lBQ0YsSUFBSSxLQUFLLElBQUksSUFBSTtnQkFBRSxNQUFNLEtBQUssQ0FBQywwQkFBMEIsR0FBRyxFQUFFLENBQUMsQ0FBQztZQUVoRSxJQUFJLE1BQU0sR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7WUFFN0IsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQ1osSUFBSSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUMzQixJQUFJLFNBQVMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBRWhDLElBQUksTUFBTSxHQUFHQSxvQkFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxJQUFJLFNBQVMsQ0FBQyxDQUFDO2dCQUN4RSxJQUFJLE1BQU0sSUFBSSxJQUFJO29CQUNoQixNQUFNLEtBQUssQ0FBQyxvQ0FBb0MsR0FBRyxFQUFFLENBQUMsQ0FBQztnQkFFekQsSUFBSSxJQUFJLEdBQUcsSUFBSUMsb0JBQUksQ0FDakIsTUFBTSxFQUNOLElBQUksSUFBSSxPQUFPLEdBQUdDLHdCQUFRLENBQUMsS0FBSyxHQUFHQSx3QkFBUSxDQUFDLElBQUksRUFDaEQsSUFBSSxDQUNMLENBQUM7Z0JBRUYsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsTUFBTSxJQUFJLFVBQVUsRUFBRSxDQUFDLENBQUM7YUFDdkQ7aUJBQU07Z0JBQ0wsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUVoQyxJQUFJLE1BQU0sR0FBR0Ysb0JBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksSUFBSSxTQUFTLENBQUMsQ0FBQztnQkFDeEUsSUFBSSxNQUFNLElBQUksSUFBSTtvQkFDaEIsTUFBTSxLQUFLLENBQUMsb0NBQW9DLEdBQUcsRUFBRSxDQUFDLENBQUM7Z0JBRXpELElBQUksSUFBSSxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUM3QixDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxJQUFJLE1BQU0sSUFBSSxDQUFDLENBQUMsSUFBSSxJQUFJLElBQUksQ0FDNUMsQ0FBQztnQkFDRixJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7b0JBQ2hCLElBQUksTUFBTSxJQUFJLFVBQVU7d0JBQUUsU0FBUzs7d0JBQzlCLE1BQU0sS0FBSyxDQUFDLGtDQUFrQyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUMsQ0FBQztpQkFDbkU7Z0JBRUQsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUUsTUFBTSxJQUFJLFVBQVUsRUFBRSxDQUFDLENBQUM7YUFDdkQ7U0FDRjtLQUNGO0lBRUQsT0FBTyxNQUFNLENBQUM7Q0FDZjtBQUVELFNBQXNCLGFBQWE7OztRQUVqQyxNQUFNLE1BQU0sR0FBRyxNQUFNLFdBQVcsQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pELE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEIsRUFBRSxDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUNyRTtDQUFBO0FBRUQsU0FBc0IsZUFBZSxDQUFDLEVBQVU7O1FBQzlDLE1BQU0sSUFBSSxHQUFHLE1BQU0sUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2hDLElBQUksSUFBSSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM1QixJQUFJLE1BQU0sR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFN0IsT0FBTyxNQUFNLENBQUM7S0FDZjtDQUFBOzs7QUN4ZkQsTUFBTSxhQUFhLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDNUIsTUFBTTtJQUNOLE1BQU07SUFDTixNQUFNO0lBQ04sTUFBTTtJQUNOLE1BQU07SUFDTixNQUFNO0lBQ04sTUFBTTtJQUNOLE1BQU07SUFDTixNQUFNO0lBQ04sTUFBTTtJQUNOLE1BQU07SUFDTixNQUFNO0lBQ04sTUFBTTtJQUNOLE1BQU07SUFDTixNQUFNO0lBQ04sTUFBTTtJQUNOLE1BQU07SUFDTixNQUFNO0lBQ04sTUFBTTtJQUNOLE1BQU07SUFDTixNQUFNO0NBQ1AsQ0FBQyxDQUFDO0FBQ0gsTUFBTSxLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDcEIsU0FBUztJQUNULFFBQVE7SUFDUixTQUFTO0lBQ1QsT0FBTztJQUNQLFNBQVM7SUFDVCxRQUFRO0lBQ1IsUUFBUTtDQUNULENBQUMsQ0FBQztBQUVILE1BQU0sTUFBTSxHQUFHLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsQ0FBQyxFQUFFLFlBQVksRUFBRSxDQUFDLEVBQUUsQ0FBQztBQUUvRCxTQUFTLFFBQVEsQ0FBQyxFQUFVLEVBQUUsS0FBb0I7SUFDaEQsSUFBSSxJQUFJLEdBQUcsSUFBSU8seUJBQVMsQ0FBQ1Asb0JBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBRWhELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFO1FBQ3JDLE9BQU8sQ0FBQyxLQUFLLENBQ1gsY0FBYyxDQUFDLEdBQUcsQ0FBQyxHQUFHLE1BQU0sR0FBRyxRQUFRLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQ3RFLENBQUM7UUFFRixJQUFJLE1BQU0sR0FBR1EsWUFBbUIsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3hELElBQUksTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7UUFFbkMsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLElBQUksTUFBTSxJQUFJLENBQUMsQ0FBQyxhQUFhLENBQUMsRUFBRTtZQUMzRCxFQUFFLE1BQU0sQ0FBQyxXQUFXLENBQUM7WUFDckIsT0FBTyxDQUFDLEdBQUcsQ0FDVCxZQUFZLEVBQUUsd0JBQXdCLE1BQU0sQ0FBQyxXQUFXLFNBQVMsQ0FDbEUsQ0FBQztZQUNGLE9BQU87U0FDUjtRQUVELElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUN4RCxJQUFJLENBQUMsRUFBRTtZQUNMLE9BQU8sQ0FBQyxHQUFHLENBQ1QsWUFBWSxFQUFFLGlCQUFpQixDQUFDLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxZQUFZLFNBQVMsQ0FDdkUsQ0FBQztZQUNGLEVBQUUsTUFBTSxDQUFDLFlBQVksQ0FBQztZQUN0QixPQUFPO1NBQ1I7UUFFRCxLQUFLLElBQUksSUFBSSxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDM0IsSUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxJQUFJLElBQUksQ0FBQyxDQUFDO1lBQy9DLElBQUksS0FBSztnQkFBRSxTQUFTO1lBQ3BCLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSUwseUJBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1NBQ2xDO1FBRUQsSUFBSSxLQUFLLEdBQUdNLHVCQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFNUIsS0FBSyxJQUFJLElBQUksSUFBSSxLQUFLLENBQUMsUUFBUSxFQUFFO1lBQy9CLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO2dCQUFFLFNBQVM7WUFDekMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzdCLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUlSLG9CQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7U0FDdkU7UUFFRCxLQUFLLElBQUksS0FBSyxJQUFJLE1BQU0sRUFBRTtZQUN4QixJQUFJLEtBQUssQ0FBQyxJQUFJLElBQUksTUFBTSxFQUFFO2dCQUN4QixJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFO29CQUNyRSxLQUFLLElBQUksSUFBSSxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUU7d0JBQzlCLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztxQkFDdkM7b0JBQ0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDbkIsU0FBUztvQkFDVFEsdUJBQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDaEIsTUFBTSxLQUFLLENBQUMsb0JBQW9CLEVBQUUsRUFBRSxDQUFDLENBQUM7aUJBQ3ZDO2FBQ0Y7U0FDRjtRQUVELElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUU7WUFDeEIsSUFBSSxPQUFPLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3JDLElBQUksUUFBUSxHQUFHQyxjQUFxQixDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVMsQ0FBQyxDQUFDO1lBQ3hFLEtBQUssSUFBSSxPQUFPLElBQUksUUFBUSxFQUFFO2dCQUM1QixJQUFJLE9BQU8sQ0FBQyxRQUFRLEVBQUU7b0JBQ3BCLElBQUksT0FBTyxDQUFDLE1BQU07d0JBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQzs7d0JBQ3ZELElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDckMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7aUJBQzlCO2FBQ0Y7WUFDRCxLQUFLLElBQUksSUFBSSxJQUFJLE9BQU8sRUFBRTtnQkFDeEIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7YUFDekI7U0FDRjtRQUVELElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDZCxJQUFJLE1BQU0sR0FBR0MsWUFBbUIsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU8sQ0FBQyxDQUFDO1lBRXpELEtBQUssSUFBSSxLQUFLLElBQUksTUFBTSxFQUFFO2dCQUN4QixJQUFJLEtBQUssQ0FBQyxRQUFRLEVBQUU7b0JBQ2xCLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQzt3QkFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7O3dCQUN6RCxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7aUJBQ2pDO2FBQ0Y7U0FDRjtRQUVELEtBQUssSUFBSSxNQUFNLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUU7WUFDbkMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsQ0FBQztZQUM5RCxJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQztnQkFBRSxNQUFNLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxFQUFFLENBQUMsQ0FBQztTQUM3RDtRQUVELElBQUksQ0FBQyxLQUFLLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1lBQzFCLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQztZQUMvQixNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN4QyxFQUFFLENBQUMsYUFBYSxDQUNkLHFDQUFxQyxFQUNyQyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQ2xDLENBQUM7U0FDSDtLQUNGO0lBRUQsRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDO0NBQ2xCO0FBRUQsU0FBZUMsS0FBRzs7UUFDaEIsRUFBRSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN0QixFQUFFLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDOztRQUl2QixJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRXBDLEtBQUssSUFBSSxFQUFFLElBQUksTUFBTSxFQUFFO1lBQ3JCLElBQUksRUFBRSxJQUFJLFlBQVk7Z0JBQUUsU0FBUztZQUNqQyxJQUFJLGFBQWEsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUFFLFNBQVM7WUFFOUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUVyQyxJQUFJLElBQUksR0FBR0MsU0FBZ0IsQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzNELFFBQVEsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDOUI7UUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0tBQ3JCO0NBQUE7QUFFRCxJQUFJLENBQUMsR0FBRyxNQUFhLENBQUM7QUFDdEIsSUFBSSxDQUFDLENBQUMsa0JBQWtCLElBQUksSUFBSTtJQUFFLENBQUMsQ0FBQyxrQkFBa0IsR0FBRyxFQUFFLENBQUM7QUFDNUQsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQ0MseUJBQVMsQ0FBQyxDQUFDO0FBRXJDLElBQUksRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFFekIsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDO0FBRTFCLElBQUksRUFBRSxJQUFJLFFBQVE7SUFBRUMsR0FBVSxFQUFFLENBQUM7S0FDNUIsSUFBSSxFQUFFLElBQUksT0FBTztJQUFFQyxLQUFZLEVBQUUsQ0FBQztLQUNsQyxJQUFJLEVBQUUsSUFBSSxLQUFLO0lBQUVKLEtBQUcsRUFBRSxDQUFDO0tBQ3ZCLElBQUksRUFBRSxJQUFJLE9BQU87SUFBRUssYUFBb0IsRUFBRSxDQUFDOztLQUUxQyxJQUFJLEVBQUUsSUFBSSxNQUFNLEVBQUU7SUFDckIsTUFBTSxLQUFLLEdBQUdDLGVBQXNCLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDakQsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUc7UUFDYixNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQzVDLE9BQU8sQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7S0FDeEIsQ0FBQyxDQUFDO0NBQ0o7S0FBTTtJQUNMLE9BQU8sQ0FBQyxHQUFHLENBQUMsNEJBQTRCLENBQUMsQ0FBQztDQUMzQzsifQ==
