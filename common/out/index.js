'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

class Region {
    constructor(id, name, type, supplyCenter) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.supplyCenter = supplyCenter;
        this.attached = new Set();
        this.adjacent = new Set();
    }
    get allAdjacent() {
        let list = [...this.adjacent];
        for (let node of this.attached) {
            list.push(...node.adjacent);
        }
        for (let node of list.slice()) {
            list.push(...node.attached);
        }
        return list;
    }
    get isShore() {
        return (this.type == exports.UnitType.Land &&
            [...this.adjacent].find((a) => a.type == exports.UnitType.Water) != null);
    }
    static areSame(lhs, rhs) {
        return lhs == rhs || lhs.attached.has(rhs);
    }
    static areEqual(lhs, rhs) {
        return lhs == rhs;
    }
}
(function (UnitType) {
    UnitType[UnitType["Land"] = 0] = "Land";
    UnitType[UnitType["Water"] = 1] = "Water";
})(exports.UnitType || (exports.UnitType = {}));
class Unit {
    constructor(region, type, team) {
        this.region = region;
        this.type = type;
        this.team = team;
    }
}
class GameMap {
    constructor(regions) {
        this.regions = regions;
    }
}
class GameState {
    constructor(map, teams) {
        this.map = map;
        this.teams = teams;
        this.units = new Set();
    }
    move(unit, target) {
        this.units.delete(unit);
        this.units.add(new Unit(target, unit.type, unit.team));
    }
}
class HoldOrder {
    constructor(unit) {
        this.unit = unit;
        this.type = "hold";
    }
    toString() {
        return `${this.unit.team} ${this.unit.region.name} hold`;
    }
}
class MoveOrder {
    constructor(unit, target, requireConvoy) {
        this.unit = unit;
        this.target = target;
        this.requireConvoy = requireConvoy;
        this.type = "move";
    }
    toString() {
        let text = `${this.unit.team} ${this.unit.region.name} -> ${this.target.name}`;
        if (this.requireConvoy)
            text += ` via convoy`;
        return text;
    }
}
class SupportOrder {
    constructor(unit, target, attack) {
        this.unit = unit;
        this.target = target;
        this.attack = attack;
        this.type = "support";
    }
    toString() {
        let text = `${this.unit.team} ${this.unit.region.name} support ${this.target.name}`;
        if (this.attack)
            text += ` -> ${this.attack.name}`;
        else
            text += ` to hold`;
        return text;
    }
}
class ConvoyOrder {
    constructor(unit, start, end) {
        this.unit = unit;
        this.start = start;
        this.end = end;
        this.type = "convoy";
    }
    toString() {
        return `${this.unit.team} ${this.unit.region.name} convoy ${this.start.name} to ${this.end.name}`;
    }
}

function resolve(orders) {
    function canMove(unit, dst) {
        if (unit.type == exports.UnitType.Water) {
            if (!unit.region.adjacent.has(dst))
                return false;
            if (dst.type != exports.UnitType.Water && !dst.isShore)
                return false;
            if (dst.type == exports.UnitType.Land && unit.region.type == exports.UnitType.Land) {
                let shore = [...unit.region.adjacent].find(a => a.type == exports.UnitType.Water && dst.adjacent.has(a));
                if (shore == null)
                    return false;
            }
        }
        else {
            if (!unit.region.allAdjacent.includes(dst))
                return false;
            if (dst.type != exports.UnitType.Land)
                return false;
        }
        return true;
    }
    function canReach(unit, dst) {
        if (canMove(unit, dst))
            return true;
        let shore = [...dst.attached].find(a => unit.region.adjacent.has(a));
        return shore != null;
    }
    function isValid(order) {
        if (order.type == 'move') {
            if (Region.areSame(order.unit.region, order.target))
                return false;
            if (order.unit.type == exports.UnitType.Water && !canMove(order.unit, order.target))
                return false;
        }
        return true;
    }
    function findRoutes(order, skip) {
        let convoys = orders.filter(o => o.type == 'convoy'
            && o.unit.region != skip
            && Region.areSame(o.start, order.unit.region)
            && resolve(o));
        let used = convoys.map(() => false);
        let node = order.unit;
        let path = [];
        let paths = [];
        function search() {
            if (canMove(node, order.target) || path.length > 0 && canReach(node, order.target)) {
                paths.push(path.slice());
            }
            for (let next = 0; next < convoys.length; ++next) {
                if (used[next] || !node.region.allAdjacent.includes(convoys[next].unit.region))
                    continue;
                let previous = node;
                used[next] = true;
                path.push(convoys[next]);
                node = convoys[next].unit;
                search();
                node = previous;
                path.pop();
                used[next] = false;
            }
        }
        search();
        if (paths.length == 0)
            return null;
        if (order.requireConvoy && paths.filter(a => a.length > 0).length == 0)
            return null;
        return { convoys, paths };
    }
    function findHoldSupport(order) {
        if (order.type == 'move')
            return [];
        return orders.filter(o => o.type == 'support'
            && Region.areEqual(o.target, order.unit.region)
            && resolve(o));
    }
    function findMoveSupport(order) {
        return orders.filter(o => o.type == 'support'
            && Region.areEqual(o.target, order.unit.region)
            && resolve(o));
    }
    for (let i = 0; i < orders.length; ++i) {
        if (isValid(orders[i]))
            continue;
        let dump = orders[i];
        orders.splice(i, 1, new HoldOrder(dump.unit));
    }
    let assumed = new Set();
    let passed = new Set();
    let checked = new Set();
    let reasons = new Map();
    let stack = [];
    function fail(order, reason) {
        stack.pop();
        if (assumed.size == 0)
            reasons.set(order, reason);
        return false;
    }
    function pass(order) {
        stack.pop();
        if (assumed.size == 0)
            passed.add(order);
        return true;
    }
    function resolve(order, force = false) {
        if (stack[0] == order && stack.every(o => o.type == 'move') && stack.length > 2) {
            return true;
        }
        else if (stack.includes(order)) {
            if (stack.indexOf(order) != stack.lastIndexOf(order))
                throw error('recursive resolve');
        }
        else if (!force && assumed.size == 0) {
            if (checked.has(order))
                return passed.has(order);
            checked.add(order);
        }
        if (assumed.has(order))
            return true;
        stack.push(order);
        if (order.type == 'hold') {
            for (let attack of orders) {
                if (attack.type != 'move' || !Region.areSame(attack.target, order.unit.region))
                    continue;
                if (resolve(attack))
                    return fail(order, `Dislodged by '${attack}'`);
            }
            return pass(order);
        }
        if (order.type == 'move') {
            let current = orders.find(o => Region.areSame(o.unit.region, order.target));
            let best = [];
            let strength = 0;
            let bestDislodge = [];
            let dislodgeStrength = 0;
            let forceResolved = null;
            for (let attack of orders) {
                if (attack.type != 'move' || !Region.areSame(attack.target, order.target))
                    continue;
                let routes = findRoutes(attack);
                if (routes == null) {
                    if (attack == order)
                        return fail(order, `No valid route`);
                    continue;
                }
                let support = findMoveSupport(attack);
                if (current && current.type == 'move' && Region.areSame(current.target, attack.unit.region)) {
                    // prevent dislodged unit from bouncing with other units entering dislodger's region
                    let enemies = support.filter(o => o.unit.team != current.unit.team);
                    let currentRoutes = findRoutes(current);
                    // to fail to swap places, both must have no routes via convoy
                    if (currentRoutes == null) {
                        if (enemies.length == 0) {
                            if (attack == order)
                                return fail(order, `Overpowered by '${current}' with support '' vs '${enemies.join("', '")}'`);
                            continue;
                        }
                    }
                    else if (currentRoutes.paths.filter(o => o.length > 0).length == 0 && routes.paths.filter(o => o.length > 0).length == 0) {
                        let currentAttack = findMoveSupport(current).filter(o => o.unit.team != attack.unit.team);
                        if (currentAttack.length > enemies.length) {
                            if (attack == order)
                                return fail(order, `Overpowered by '${current}' with support '${currentAttack.join("', '")}' vs '${enemies.join("', '")}'`);
                            continue;
                        }
                    }
                    else {
                        forceResolved = attack;
                    }
                }
                if (support.length > strength) {
                    best = [attack];
                    strength = support.length;
                }
                else if (support.length == strength) {
                    best.push(attack);
                }
                if (current && attack.unit.team != current.unit.team) {
                    let enemies = support.filter(o => o.unit.team != current.unit.team);
                    if (enemies.length > dislodgeStrength) {
                        bestDislodge = [attack];
                        dislodgeStrength = enemies.length;
                    }
                    else if (enemies.length == dislodgeStrength) {
                        bestDislodge.push(attack);
                    }
                }
            }
            if (!best.includes(order))
                return fail(order, `Overpowered by '${best.join("', '")}' with strength ${strength} vs ${findMoveSupport(order).length} `);
            if (best.length != 1)
                return fail(order, `Standoff with '${best.join("', '")}' with strength ${strength} `);
            if (current && best[0] != forceResolved) {
                if (current.type == 'move' && Region.areSame(current.target, best[0].unit.region)) {
                    if (bestDislodge.length != 1 || best[0] != bestDislodge[0])
                        return fail(order, `Avoiding self-dislodgement`);
                    let currentAttack = findMoveSupport(current).filter(o => o.unit.team != best[0].unit.team);
                    if (currentAttack.length == dislodgeStrength)
                        return fail(order, `Balanced faceoff '${currentAttack.join("', '")}' vs '${findMoveSupport(order).filter(o => o.unit.team != current.unit.team).join("', '")}'`);
                    if (currentAttack.length > dislodgeStrength)
                        throw error('Failed to filter out dislodged attack');
                }
                else if (current.type != 'move' || !resolve(current)) {
                    if (bestDislodge.length != 1 || best[0] != bestDislodge[0])
                        return fail(order, `Avoiding self-dislodgement`);
                    if (dislodgeStrength == 0)
                        return fail(order, `Held with ?? vs nothing`);
                    let holdSupport = findHoldSupport(current);
                    if (holdSupport.length >= dislodgeStrength)
                        return fail(order, `Held with '${holdSupport.join(', ')}' vs '${findMoveSupport(order).filter(o => o.unit.team != current.unit.team).join("', '")}'`);
                }
            }
            return pass(order);
        }
        if (order.type == 'convoy') {
            if (order.unit.region.type != exports.UnitType.Water)
                return fail(order, 'Only water units can convoy');
            let target = orders.find(o => o.type == 'move'
                && o.unit.type == exports.UnitType.Land
                && Region.areSame(o.unit.region, order.start)
                && Region.areSame(o.target, order.end));
            if (target == null)
                return fail(order, 'No matching target');
            for (let attack of orders) {
                if (attack.type != 'move' || !Region.areSame(attack.target, order.unit.region))
                    continue;
                if (resolve(attack))
                    return fail(order, `Dislodged by '${attack}'`);
            }
            return pass(order);
        }
        if (order.type == 'support') {
            let supportee = orders.find(o => Region.areSame(o.unit.region, order.target));
            if (supportee == null)
                return fail(order, 'No matching target');
            if (order.attack) {
                if (supportee.type != 'move')
                    return fail(order, `Support attacked ${order.attack.name} target was ${supportee}`);
                if (!canReach(order.unit, order.attack))
                    return fail(order, `Support attacked ${order.attack.name} but could not reach`);
                if (!Region.areEqual(supportee.target, order.attack))
                    return fail(order, `Support attacked ${order.attack.name} but target attacked ${supportee.target}`);
            }
            else {
                if (supportee.type == 'move')
                    return fail(order, `Support held but target was ${supportee}`);
                if (!canReach(order.unit, order.target))
                    return fail(order, `Support held ${order.target.name} but could not reach`);
            }
            for (let attack of orders) {
                if (attack.type != 'move' || !Region.areSame(attack.target, order.unit.region))
                    continue;
                if (order.unit.team == attack.unit.team)
                    continue;
                if (supportee.type == 'move') {
                    if (Region.areSame(supportee.target, attack.unit.region)) {
                        // if it is from the target region of the supported attack,
                        // it can only cut support by dislodging
                        if (resolve(attack))
                            return fail(order, `Dislodged by '${attack}'`);
                    }
                    else {
                        // if it is convoyed by the target region of the supported attack,
                        // it can only cut support if it has an alternate path
                        let routes = findRoutes(attack, supportee.target);
                        if (routes != null)
                            return fail(order, `Disrupted by '${attack}'`);
                        // or if the support doesn't break the convoy
                        assumed.add(order);
                        if (resolve(attack)) {
                            assumed.delete(order);
                            return fail(order, `Dislodged by '${attack}'`);
                        }
                        assumed.delete(order);
                    }
                }
                else {
                    let routes = findRoutes(attack);
                    if (routes != null)
                        return fail(order, `Disrupted by '${attack}'`);
                }
            }
            return pass(order);
        }
        throw error(`Invalid order`);
    }
    let evicted = [];
    let resolved = [];
    for (let order of orders) {
        let valid = resolve(order);
        if (order.type == 'move' && valid) {
            resolved.push(order);
        }
        else {
            for (let attack of orders) {
                if (attack.type != 'move' || !Region.areSame(attack.target, order.unit.region))
                    continue;
                if (resolve(attack)) {
                    evicted.push(order.unit);
                    if (!reasons.has(order)) {
                        debugger;
                        resolve(order, true);
                        debugger;
                        resolve(attack, true);
                    }
                }
            }
        }
    }
    return { resolved, evicted, reasons };
}
function error(msg) {
    debugger;
    return new Error(msg);
}

var formatter = {
    header(obj, config) {
        if (obj instanceof MoveOrder || obj instanceof HoldOrder || obj instanceof SupportOrder || obj instanceof ConvoyOrder) {
            return ["span", {}, obj.toString()];
        }
        if (obj instanceof Unit) {
            return ["span", {}, `${obj.team} ${obj.type == exports.UnitType.Water ? 'fleet' : 'army'} in ${obj.region.name}`];
        }
        return null;
    },
    hasBody(obj, config) {
        return false;
    },
    body(obj, config) {
    }
};

const LAND = exports.UnitType.Land;
const WATER = exports.UnitType.Water;
const supplyCenters = [
    "RUM",
    "BUL",
    "SER",
    "POR",
    "SPA",
    "SWE",
    "NWY",
    "DEN",
    "HOL",
    "BEL",
    "TUN",
    "GRE",
    "BUD",
    "TRI",
    "VIE",
    "EDI",
    "LVP",
    "LON",
    "BRE",
    "MAR",
    "PAR",
    "BER",
    "KIE",
    "MUN",
    "NAP",
    "ROM",
    "VEN",
    "MOS",
    "STP",
    "SEV",
    "WAR",
    "ANK",
    "CON",
    "SMY",
];
function n(id, name, type) {
    const isSupplyCenter = supplyCenters.includes(id);
    return new Region(id, name, type, isSupplyCenter);
}
// austria
let BOH = n("BOH", "Bohemia", LAND);
let BUD = n("BUD", "Budapest", LAND);
let GAL = n("GAL", "Galicia", LAND);
let TRI = n("TRI", "Trieste", LAND);
let TYR = n("TYR", "Tyrolia", LAND);
let VIE = n("VIE", "Vienna", LAND);
// england
let CLY = n("CLY", "Clyde", LAND);
let EDI = n("EDI", "Edinburgh", LAND);
let LVP = n("LVP", "Liverpool", LAND);
let LON = n("LON", "London", LAND);
let WAL = n("WAL", "Wales", LAND);
let YOR = n("YOR", "Yorkshire", LAND);
// france
let BRE = n("BRE", "Brest", LAND);
let BUR = n("BUR", "Burgundy", LAND);
let GAS = n("GAS", "Gascony", LAND);
let MAR = n("MAR", "Marseilles", LAND);
let PAR = n("PAR", "Paris", LAND);
let PIC = n("PIC", "Picardy", LAND);
// germany
let BER = n("BER", "Berlin", LAND);
let KIE = n("KIE", "Kiel", LAND);
let MUN = n("MUN", "Munich", LAND);
let PRU = n("PRU", "Prussia", LAND);
let RUH = n("RUH", "Ruhr", LAND);
let SIL = n("SIL", "Silesia", LAND);
// italy
let APU = n("APU", "Apulia", LAND);
let NAP = n("NAP", "Naples", LAND);
let PIE = n("PIE", "Piedmont", LAND);
let ROM = n("ROM", "Rome", LAND);
let TUS = n("TUS", "Tuscany", LAND);
let VEN = n("VEN", "Venice", LAND);
// russia
let FIN = n("FIN", "Finland", LAND);
let LVN = n("LVN", "Livonia", LAND);
let MOS = n("MOS", "Moscow", LAND);
let SEV = n("SEV", "Sevastopol", LAND);
let STP = n("STP", "St. Petersburg", LAND);
let UKR = n("UKR", "Ukraine", LAND);
let WAR = n("WAR", "Warsaw", LAND);
// turkey
let ANK = n("ANK", "Ankara", LAND);
let ARM = n("ARM", "Armenia", LAND);
let CON = n("CON", "Constantinople", LAND);
let SMY = n("SMY", "Smyrna", LAND);
let SYR = n("SYR", "Syria", LAND);
// neutral
let ALB = n("ALB", "Albania", LAND);
let BEL = n("BEL", "Belgium", LAND);
let BUL = n("BUL", "Bulgaria", LAND);
let DEN = n("DEN", "Denmark", LAND);
let GRE = n("GRE", "Greece", LAND);
let HOL = n("HOL", "Holland", LAND);
let NWY = n("NWY", "Norway", LAND);
let NAF = n("NAF", "North Africa", LAND);
let POR = n("POR", "Portugal", LAND);
let RUM = n("RUM", "Rumania", LAND);
let SER = n("SER", "Serbia", LAND);
let SPA = n("SPA", "Spain", LAND);
let SWE = n("SWE", "Sweden", LAND);
let TUN = n("TUN", "Tunis", LAND);
// water
let ADR = n("ADR", "Adriatic Sea", WATER);
let AEG = n("AEG", "Aegean Sea", WATER);
let BAL = n("BAL", "Baltic Sea", WATER);
let BAR = n("BAR", "Barents Sea", WATER);
let BLA = n("BLA", "Black Sea", WATER);
let EAS = n("EAS", "Eastern Mediterranean", WATER);
let ENG = n("ENG", "English Channel", WATER);
let BOT = n("BOT", "Gulf of Bothnia", WATER);
let GOL = n("GOL", "Gulf of Lyon", WATER);
let HEL = n("HEL", "Helgoland Bight", WATER);
let ION = n("ION", "Ionian Sea", WATER);
let IRI = n("IRI", "Irish Sea", WATER);
let MID = n("MID", "Mid-Atlantic Ocean", WATER);
let NAT = n("NAT", "North Atlantic Ocean", WATER);
let NTH = n("NTH", "North Sea", WATER);
let NRG = n("NRG", "Norwegian Sea", WATER);
let SKA = n("SKA", "Skagerrack", WATER);
let TYN = n("TYN", "Tyrrhenian Sea", WATER);
let WES = n("WES", "Western Mediterranean", WATER);
let STP_NORTH = n("STPN", "St. Petersburg (North Coast)", LAND);
let STP_SOUTH = n("STPS", "St. Petersburg (South Coast)", LAND);
let SPA_NORTH = n("SPAN", "Spain (North Coast)", LAND);
let SPA_SOUTH = n("SPAS", "Spain (South Coast)", LAND);
let BUL_NORTH = n("BULE", "Bulgaria (East Coast)", LAND);
let BUL_SOUTH = n("BULS", "Bulgaria (South Coast)", LAND);
function border(node, adjacent) {
    for (let other of adjacent)
        node.adjacent.add(other);
}
function attach(node, attached) {
    let all = [node, ...attached];
    for (let region of all) {
        for (let other of all) {
            if (other == region)
                continue;
            region.attached.add(other);
        }
    }
}
border(STP_NORTH, [BAR, NWY]);
attach(STP, [STP_SOUTH, STP_NORTH]);
border(STP_SOUTH, [BOT, LVN, FIN]);
border(BUL_NORTH, [BLA, CON, RUM]);
attach(BUL, [BUL_SOUTH, BUL_NORTH]);
border(BUL_SOUTH, [AEG, GRE, CON]);
border(SPA_NORTH, [MID, POR, GAS]);
attach(SPA, [SPA_SOUTH, SPA_NORTH]);
border(SPA_SOUTH, [GOL, WES, MID, POR, MAR]);
border(NAT, [NRG, CLY, LVP, IRI, MID]);
border(NRG, [BAR, NWY, NTH, EDI, CLY, NAT]);
border(CLY, [NRG, EDI, LVP, NAT]);
border(LVP, [CLY, EDI, YOR, WAL, IRI, NAT]);
border(IRI, [NAT, LVP, WAL, ENG, MID]);
border(MID, [NAT, IRI, ENG, BRE, GAS, POR, WES, NAF, SPA_NORTH, SPA_SOUTH]);
border(BAR, [NRG, NWY, STP_NORTH]);
border(NWY, [NRG, BAR, STP, FIN, SWE, SKA, NTH, STP_NORTH]);
border(NTH, [NRG, NWY, SKA, DEN, HEL, HOL, BEL, ENG, LON, YOR, EDI]);
border(EDI, [NRG, NTH, YOR, LVP, CLY]);
border(YOR, [EDI, NTH, LON, WAL, LVP]);
border(WAL, [LVP, YOR, LON, ENG, IRI]);
border(ENG, [IRI, WAL, LON, NTH, BEL, PIC, BRE, MID]);
border(BRE, [ENG, PIC, PAR, GAS, MID]);
border(GAS, [BRE, PAR, BUR, MAR, SPA, MID]);
border(SPA, [GAS, MAR, POR]);
border(POR, [MID, SPA, SPA_NORTH, SPA_SOUTH]);
border(WES, [GOL, TYN, TUN, NAF, MID, SPA_SOUTH]);
border(NAF, [MID, WES, TUN]);
border(STP, [NWY, MOS, LVN, FIN]);
border(SWE, [NWY, FIN, BOT, BAL, DEN, SKA]);
border(FIN, [NWY, STP, BOT, SWE, STP_SOUTH]);
border(SKA, [NWY, SWE, DEN, NTH]);
border(DEN, [SKA, SWE, BAL, KIE, HEL, NTH]);
border(HEL, [NTH, DEN, KIE, HOL]);
border(HOL, [NTH, HEL, KIE, RUH, BEL]);
border(BEL, [ENG, NTH, HOL, RUH, BUR, PIC]);
border(LON, [YOR, NTH, ENG, WAL]);
border(PIC, [ENG, BEL, BUR, PAR, BRE]);
border(PAR, [PIC, BUR, GAS, BRE]);
border(GAS, [BRE, PAR, BUR, MAR, SPA, MID, SPA_NORTH]);
border(BUR, [PAR, PIC, BEL, RUH, MUN, MAR, GAS]);
border(MAR, [GAS, BUR, PIE, GOL, SPA, SPA_SOUTH]);
border(GOL, [MAR, PIE, TUS, TYN, WES, SPA_SOUTH]);
border(TYN, [TUS, ROM, NAP, ION, TUN, WES, GOL]);
border(TUN, [WES, TYN, ION, NAF]);
border(MOS, [STP, SEV, UKR, WAR, LVN]);
border(LVN, [BOT, STP, MOS, WAR, PRU, BAL, STP_SOUTH]);
border(BOT, [SWE, FIN, LVN, BAL, STP_SOUTH]);
border(BAL, [DEN, SWE, BOT, LVN, PRU, BER, KIE]);
border(KIE, [HEL, DEN, BAL, BER, MUN, RUH, HOL]);
border(RUH, [BEL, HOL, KIE, MUN, BUR]);
border(PIE, [TYR, VEN, TUS, GOL, MAR]);
border(TUS, [PIE, VEN, ROM, TYN, GOL]);
border(ROM, [TUS, VEN, APU, NAP, TYN]);
border(NAP, [ROM, APU, ION, TYN]);
border(ION, [TYN, NAP, APU, ADR, ALB, GRE, AEG, EAS, TUN]);
border(SEV, [UKR, MOS, ARM, BLA, RUM]);
border(UKR, [MOS, SEV, RUM, GAL, WAR]);
border(WAR, [PRU, LVN, MOS, UKR, GAL, SIL]);
border(PRU, [BAL, LVN, WAR, SIL, BER]);
border(BER, [BAL, PRU, SIL, MUN, KIE]);
border(MUN, [RUH, KIE, BER, SIL, BOH, TYR, BUR]);
border(TYR, [MUN, BOH, VIE, TRI, VEN, PIE]);
border(VEN, [TYR, TRI, ADR, APU, ROM, TUS, PIE]);
border(APU, [VEN, ADR, ION, NAP, ROM]);
border(ADR, [VEN, TRI, ALB, ION, APU]);
border(ALB, [TRI, SER, GRE, ION, ADR]);
border(GRE, [ALB, SER, BUL, AEG, ION, BUL_SOUTH]);
border(AEG, [GRE, CON, SMY, EAS, ION, BUL_SOUTH]);
border(EAS, [AEG, SMY, SYR, ION]);
border(ARM, [SEV, SYR, SMY, ANK, BLA]);
border(BLA, [RUM, SEV, ARM, ANK, CON, BUL_NORTH]);
border(RUM, [BUD, GAL, UKR, SEV, BLA, BUL, SER, BUL_NORTH]);
border(GAL, [BOH, SIL, WAR, UKR, RUM, BUD, VIE]);
border(SIL, [BER, PRU, WAR, GAL, BOH, MUN]);
border(BOH, [MUN, SIL, GAL, VIE, TYR]);
border(VIE, [BOH, GAL, BUD, TRI, TYR]);
border(TRI, [TYR, VIE, BUD, SER, ALB, ADR, VEN]);
border(SER, [BUD, RUM, BUL, GRE, ALB, TRI]);
border(BUL, [RUM, CON, GRE, SER]);
border(CON, [BUL, BLA, ANK, SMY, AEG, BUL_SOUTH, BUL_NORTH]);
border(SMY, [CON, ANK, ARM, SYR, EAS, AEG]);
border(SYR, [SMY, ARM, EAS]);
border(BUD, [VIE, GAL, RUM, SER, TRI]);
border(ANK, [BLA, ARM, SMY, CON]);
const map = new GameMap([
    BOH,
    BUD,
    GAL,
    TRI,
    TYR,
    VIE,
    CLY,
    EDI,
    LVP,
    LON,
    WAL,
    YOR,
    BRE,
    BUR,
    GAS,
    MAR,
    PAR,
    PIC,
    BER,
    KIE,
    MUN,
    PRU,
    RUH,
    SIL,
    APU,
    NAP,
    PIE,
    ROM,
    TUS,
    VEN,
    FIN,
    LVN,
    MOS,
    SEV,
    STP,
    UKR,
    WAR,
    ANK,
    ARM,
    CON,
    SMY,
    SYR,
    ALB,
    BEL,
    BUL,
    DEN,
    GRE,
    HOL,
    NWY,
    NAF,
    POR,
    RUM,
    SER,
    SPA,
    SWE,
    TUN,
    ADR,
    AEG,
    BAL,
    BAR,
    BLA,
    EAS,
    ENG,
    BOT,
    GOL,
    HEL,
    ION,
    IRI,
    MID,
    NAT,
    NTH,
    NRG,
    SKA,
    TYN,
    WES,
    STP_NORTH,
    STP_SOUTH,
    SPA_NORTH,
    SPA_SOUTH,
    BUL_NORTH,
    BUL_SOUTH,
]);
const allRegions = {
    BOH,
    BUD,
    GAL,
    TRI,
    TYR,
    VIE,
    CLY,
    EDI,
    LVP,
    LON,
    WAL,
    YOR,
    BRE,
    BUR,
    GAS,
    MAR,
    PAR,
    PIC,
    BER,
    KIE,
    MUN,
    PRU,
    RUH,
    SIL,
    APU,
    NAP,
    PIE,
    ROM,
    TUS,
    VEN,
    FIN,
    LVN,
    MOS,
    SEV,
    STP,
    UKR,
    WAR,
    ANK,
    ARM,
    CON,
    SMY,
    SYR,
    ALB,
    BEL,
    BUL,
    DEN,
    GRE,
    HOL,
    NWY,
    NAF,
    POR,
    RUM,
    SER,
    SPA,
    SWE,
    TUN,
    ADR,
    AEG,
    BAL,
    BAR,
    BLA,
    EAS,
    ENG,
    BOT,
    GOL,
    HEL,
    ION,
    IRI,
    MID,
    NAT,
    NTH,
    NRG,
    SKA,
    TYN,
    WES,
    STP_NORTH,
    STP_SOUTH,
    SPA_NORTH,
    SPA_SOUTH,
    BUL_NORTH,
    BUL_SOUTH,
};

const maps = {
    standard: {
        map: map,
        regions: allRegions,
    },
};

exports.ConvoyOrder = ConvoyOrder;
exports.GameMap = GameMap;
exports.GameState = GameState;
exports.HoldOrder = HoldOrder;
exports.MoveOrder = MoveOrder;
exports.Region = Region;
exports.SupportOrder = SupportOrder;
exports.Unit = Unit;
exports.formatter = formatter;
exports.maps = maps;
exports.resolve = resolve;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzIjpbIi4uL3NyYy9nYW1lLnRzIiwiLi4vc3JjL3J1bGVzLnRzIiwiLi4vc3JjL2Zvcm1hdHRlci50cyIsIi4uL3NyYy9tYXBzL3N0YW5kYXJkLnRzIiwiLi4vc3JjL2luZGV4LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBjbGFzcyBSZWdpb24ge1xuICByZWFkb25seSBhdHRhY2hlZCA9IG5ldyBTZXQ8UmVnaW9uPigpO1xuICByZWFkb25seSBhZGphY2VudCA9IG5ldyBTZXQ8UmVnaW9uPigpO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHJlYWRvbmx5IGlkOiBzdHJpbmcsXG4gICAgcmVhZG9ubHkgbmFtZTogc3RyaW5nLFxuICAgIHJlYWRvbmx5IHR5cGU6IFVuaXRUeXBlLFxuICAgIHJlYWRvbmx5IHN1cHBseUNlbnRlcjogYm9vbGVhblxuICApIHt9XG5cbiAgZ2V0IGFsbEFkamFjZW50KCkge1xuICAgIGxldCBsaXN0ID0gWy4uLnRoaXMuYWRqYWNlbnRdO1xuICAgIGZvciAobGV0IG5vZGUgb2YgdGhpcy5hdHRhY2hlZCkge1xuICAgICAgbGlzdC5wdXNoKC4uLm5vZGUuYWRqYWNlbnQpO1xuICAgIH1cbiAgICBmb3IgKGxldCBub2RlIG9mIGxpc3Quc2xpY2UoKSkge1xuICAgICAgbGlzdC5wdXNoKC4uLm5vZGUuYXR0YWNoZWQpO1xuICAgIH1cbiAgICByZXR1cm4gbGlzdDtcbiAgfVxuXG4gIGdldCBpc1Nob3JlKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLnR5cGUgPT0gVW5pdFR5cGUuTGFuZCAmJlxuICAgICAgWy4uLnRoaXMuYWRqYWNlbnRdLmZpbmQoKGEpID0+IGEudHlwZSA9PSBVbml0VHlwZS5XYXRlcikgIT0gbnVsbFxuICAgICk7XG4gIH1cblxuICBzdGF0aWMgYXJlU2FtZShsaHM6IFJlZ2lvbiwgcmhzOiBSZWdpb24pIHtcbiAgICByZXR1cm4gbGhzID09IHJocyB8fCBsaHMuYXR0YWNoZWQuaGFzKHJocyk7XG4gIH1cblxuICBzdGF0aWMgYXJlRXF1YWwobGhzOiBSZWdpb24sIHJoczogUmVnaW9uKSB7XG4gICAgcmV0dXJuIGxocyA9PSByaHM7XG4gIH1cbn1cblxuZXhwb3J0IGVudW0gVW5pdFR5cGUge1xuICBMYW5kLFxuICBXYXRlcixcbn1cblxuZXhwb3J0IGNsYXNzIFVuaXQge1xuICBjb25zdHJ1Y3RvcihcbiAgICByZWFkb25seSByZWdpb246IFJlZ2lvbixcbiAgICByZWFkb25seSB0eXBlOiBVbml0VHlwZSxcbiAgICByZWFkb25seSB0ZWFtOiBzdHJpbmdcbiAgKSB7fVxufVxuXG5leHBvcnQgY2xhc3MgR2FtZU1hcCB7XG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHJlZ2lvbnM6IFJlZ2lvbltdKSB7fVxufVxuXG5leHBvcnQgY2xhc3MgR2FtZVN0YXRlIHtcbiAgcmVhZG9ubHkgdW5pdHMgPSBuZXcgU2V0PFVuaXQ+KCk7XG5cbiAgY29uc3RydWN0b3IocmVhZG9ubHkgbWFwOiBHYW1lTWFwLCByZWFkb25seSB0ZWFtczogc3RyaW5nW10pIHt9XG5cbiAgbW92ZSh1bml0OiBVbml0LCB0YXJnZXQ6IFJlZ2lvbikge1xuICAgIHRoaXMudW5pdHMuZGVsZXRlKHVuaXQpO1xuICAgIHRoaXMudW5pdHMuYWRkKG5ldyBVbml0KHRhcmdldCwgdW5pdC50eXBlLCB1bml0LnRlYW0pKTtcbiAgfVxufVxuXG5pbnRlcmZhY2UgT3JkZXJCYXNlPFQgZXh0ZW5kcyBzdHJpbmc+IHtcbiAgcmVhZG9ubHkgdHlwZTogVDtcbiAgcmVhZG9ubHkgdW5pdDogVW5pdDtcbn1cblxuZXhwb3J0IGNsYXNzIEhvbGRPcmRlciBpbXBsZW1lbnRzIE9yZGVyQmFzZTxcImhvbGRcIj4ge1xuICByZWFkb25seSB0eXBlID0gXCJob2xkXCI7XG4gIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHVuaXQ6IFVuaXQpIHt9XG5cbiAgdG9TdHJpbmcoKSB7XG4gICAgcmV0dXJuIGAke3RoaXMudW5pdC50ZWFtfSAke3RoaXMudW5pdC5yZWdpb24ubmFtZX0gaG9sZGA7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vdmVPcmRlciBpbXBsZW1lbnRzIE9yZGVyQmFzZTxcIm1vdmVcIj4ge1xuICByZWFkb25seSB0eXBlID0gXCJtb3ZlXCI7XG4gIGNvbnN0cnVjdG9yKFxuICAgIHJlYWRvbmx5IHVuaXQ6IFVuaXQsXG4gICAgcmVhZG9ubHkgdGFyZ2V0OiBSZWdpb24sXG4gICAgcmVhZG9ubHkgcmVxdWlyZUNvbnZveTogYm9vbGVhblxuICApIHt9XG5cbiAgdG9TdHJpbmcoKSB7XG4gICAgbGV0IHRleHQgPSBgJHt0aGlzLnVuaXQudGVhbX0gJHt0aGlzLnVuaXQucmVnaW9uLm5hbWV9IC0+ICR7dGhpcy50YXJnZXQubmFtZX1gO1xuICAgIGlmICh0aGlzLnJlcXVpcmVDb252b3kpIHRleHQgKz0gYCB2aWEgY29udm95YDtcbiAgICByZXR1cm4gdGV4dDtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgU3VwcG9ydE9yZGVyIGltcGxlbWVudHMgT3JkZXJCYXNlPFwic3VwcG9ydFwiPiB7XG4gIHJlYWRvbmx5IHR5cGUgPSBcInN1cHBvcnRcIjtcbiAgY29uc3RydWN0b3IoXG4gICAgcmVhZG9ubHkgdW5pdDogVW5pdCxcbiAgICByZWFkb25seSB0YXJnZXQ6IFJlZ2lvbixcbiAgICByZWFkb25seSBhdHRhY2s/OiBSZWdpb25cbiAgKSB7fVxuXG4gIHRvU3RyaW5nKCkge1xuICAgIGxldCB0ZXh0ID0gYCR7dGhpcy51bml0LnRlYW19ICR7dGhpcy51bml0LnJlZ2lvbi5uYW1lfSBzdXBwb3J0ICR7dGhpcy50YXJnZXQubmFtZX1gO1xuICAgIGlmICh0aGlzLmF0dGFjaykgdGV4dCArPSBgIC0+ICR7dGhpcy5hdHRhY2submFtZX1gO1xuICAgIGVsc2UgdGV4dCArPSBgIHRvIGhvbGRgO1xuICAgIHJldHVybiB0ZXh0O1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBDb252b3lPcmRlciBpbXBsZW1lbnRzIE9yZGVyQmFzZTxcImNvbnZveVwiPiB7XG4gIHJlYWRvbmx5IHR5cGUgPSBcImNvbnZveVwiO1xuICBjb25zdHJ1Y3RvcihcbiAgICByZWFkb25seSB1bml0OiBVbml0LFxuICAgIHJlYWRvbmx5IHN0YXJ0OiBSZWdpb24sXG4gICAgcmVhZG9ubHkgZW5kOiBSZWdpb25cbiAgKSB7fVxuXG4gIHRvU3RyaW5nKCkge1xuICAgIHJldHVybiBgJHt0aGlzLnVuaXQudGVhbX0gJHt0aGlzLnVuaXQucmVnaW9uLm5hbWV9IGNvbnZveSAke3RoaXMuc3RhcnQubmFtZX0gdG8gJHt0aGlzLmVuZC5uYW1lfWA7XG4gIH1cbn1cblxuZXhwb3J0IHR5cGUgQW55T3JkZXIgPSBIb2xkT3JkZXIgfCBNb3ZlT3JkZXIgfCBTdXBwb3J0T3JkZXIgfCBDb252b3lPcmRlcjtcbiIsImltcG9ydCB7IFVuaXQsIFJlZ2lvbiwgVW5pdFR5cGUsIEFueU9yZGVyLCBNb3ZlT3JkZXIsIENvbnZveU9yZGVyLCBTdXBwb3J0T3JkZXIsIEhvbGRPcmRlciB9IGZyb20gJy4vZ2FtZSc7XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlKG9yZGVyczogQW55T3JkZXJbXSkge1xuICAgIGZ1bmN0aW9uIGNhbk1vdmUodW5pdDogVW5pdCwgZHN0OiBSZWdpb24pIHtcbiAgICAgICAgaWYgKHVuaXQudHlwZSA9PSBVbml0VHlwZS5XYXRlcikge1xuICAgICAgICAgICAgaWYgKCF1bml0LnJlZ2lvbi5hZGphY2VudC5oYXMoZHN0KSlcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICBpZiAoZHN0LnR5cGUgIT0gVW5pdFR5cGUuV2F0ZXIgJiYgIWRzdC5pc1Nob3JlKVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGlmIChkc3QudHlwZSA9PSBVbml0VHlwZS5MYW5kICYmIHVuaXQucmVnaW9uLnR5cGUgPT0gVW5pdFR5cGUuTGFuZCkge1xuICAgICAgICAgICAgICAgIGxldCBzaG9yZSA9IFsuLi51bml0LnJlZ2lvbi5hZGphY2VudF0uZmluZChhID0+IGEudHlwZSA9PSBVbml0VHlwZS5XYXRlciAmJiBkc3QuYWRqYWNlbnQuaGFzKGEpKTtcbiAgICAgICAgICAgICAgICBpZiAoc2hvcmUgPT0gbnVsbClcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKCF1bml0LnJlZ2lvbi5hbGxBZGphY2VudC5pbmNsdWRlcyhkc3QpKVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIGlmIChkc3QudHlwZSAhPSBVbml0VHlwZS5MYW5kKVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNhblJlYWNoKHVuaXQ6IFVuaXQsIGRzdDogUmVnaW9uKSB7XG4gICAgICAgIGlmIChjYW5Nb3ZlKHVuaXQsIGRzdCkpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcblxuICAgICAgICBsZXQgc2hvcmUgPSBbLi4uZHN0LmF0dGFjaGVkXS5maW5kKGEgPT4gdW5pdC5yZWdpb24uYWRqYWNlbnQuaGFzKGEpKTtcbiAgICAgICAgcmV0dXJuIHNob3JlICE9IG51bGw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaXNWYWxpZChvcmRlcjogQW55T3JkZXIpIHtcbiAgICAgICAgaWYgKG9yZGVyLnR5cGUgPT0gJ21vdmUnKSB7XG4gICAgICAgICAgICBpZiAoUmVnaW9uLmFyZVNhbWUob3JkZXIudW5pdC5yZWdpb24sIG9yZGVyLnRhcmdldCkpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAgICAgICBpZiAob3JkZXIudW5pdC50eXBlID09IFVuaXRUeXBlLldhdGVyICYmICFjYW5Nb3ZlKG9yZGVyLnVuaXQsIG9yZGVyLnRhcmdldCkpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmluZFJvdXRlcyhvcmRlcjogTW92ZU9yZGVyLCBza2lwPzogUmVnaW9uKSB7XG4gICAgICAgIGxldCBjb252b3lzID0gb3JkZXJzLmZpbHRlcihvID0+IG8udHlwZSA9PSAnY29udm95J1xuICAgICAgICAgICAgJiYgby51bml0LnJlZ2lvbiAhPSBza2lwXG4gICAgICAgICAgICAmJiBSZWdpb24uYXJlU2FtZShvLnN0YXJ0LCBvcmRlci51bml0LnJlZ2lvbilcbiAgICAgICAgICAgICYmIHJlc29sdmUobykpIGFzIENvbnZveU9yZGVyW107XG5cbiAgICAgICAgbGV0IHVzZWQgPSBjb252b3lzLm1hcCgoKSA9PiBmYWxzZSk7XG4gICAgICAgIGxldCBub2RlID0gb3JkZXIudW5pdDtcblxuICAgICAgICBsZXQgcGF0aDogQ29udm95T3JkZXJbXSA9IFtdO1xuICAgICAgICBsZXQgcGF0aHM6IENvbnZveU9yZGVyW11bXSA9IFtdO1xuXG4gICAgICAgIGZ1bmN0aW9uIHNlYXJjaCgpIHtcbiAgICAgICAgICAgIGlmIChjYW5Nb3ZlKG5vZGUsIG9yZGVyLnRhcmdldCkgfHwgcGF0aC5sZW5ndGggPiAwICYmIGNhblJlYWNoKG5vZGUsIG9yZGVyLnRhcmdldCkpIHtcbiAgICAgICAgICAgICAgICBwYXRocy5wdXNoKHBhdGguc2xpY2UoKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAobGV0IG5leHQgPSAwOyBuZXh0IDwgY29udm95cy5sZW5ndGg7ICsrbmV4dCkge1xuICAgICAgICAgICAgICAgIGlmICh1c2VkW25leHRdIHx8ICFub2RlLnJlZ2lvbi5hbGxBZGphY2VudC5pbmNsdWRlcyhjb252b3lzW25leHRdLnVuaXQucmVnaW9uKSlcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgICAgICBsZXQgcHJldmlvdXMgPSBub2RlO1xuICAgICAgICAgICAgICAgIHVzZWRbbmV4dF0gPSB0cnVlO1xuICAgICAgICAgICAgICAgIHBhdGgucHVzaChjb252b3lzW25leHRdKTtcbiAgICAgICAgICAgICAgICBub2RlID0gY29udm95c1tuZXh0XS51bml0O1xuXG4gICAgICAgICAgICAgICAgc2VhcmNoKCk7XG5cbiAgICAgICAgICAgICAgICBub2RlID0gcHJldmlvdXM7XG4gICAgICAgICAgICAgICAgcGF0aC5wb3AoKTtcbiAgICAgICAgICAgICAgICB1c2VkW25leHRdID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBzZWFyY2goKTtcblxuICAgICAgICBpZiAocGF0aHMubGVuZ3RoID09IDApXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcblxuICAgICAgICBpZiAob3JkZXIucmVxdWlyZUNvbnZveSAmJiBwYXRocy5maWx0ZXIoYSA9PiBhLmxlbmd0aCA+IDApLmxlbmd0aCA9PSAwKVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgcmV0dXJuIHsgY29udm95cywgcGF0aHMgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaW5kSG9sZFN1cHBvcnQob3JkZXI6IEFueU9yZGVyKSB7XG4gICAgICAgIGlmIChvcmRlci50eXBlID09ICdtb3ZlJylcbiAgICAgICAgICAgIHJldHVybiBbXTtcblxuICAgICAgICByZXR1cm4gb3JkZXJzLmZpbHRlcihvID0+IG8udHlwZSA9PSAnc3VwcG9ydCdcbiAgICAgICAgICAgICYmIFJlZ2lvbi5hcmVFcXVhbChvLnRhcmdldCwgb3JkZXIudW5pdC5yZWdpb24pXG4gICAgICAgICAgICAmJiByZXNvbHZlKG8pKSBhcyBTdXBwb3J0T3JkZXJbXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBmaW5kTW92ZVN1cHBvcnQob3JkZXI6IE1vdmVPcmRlcikge1xuICAgICAgICByZXR1cm4gb3JkZXJzLmZpbHRlcihvID0+IG8udHlwZSA9PSAnc3VwcG9ydCdcbiAgICAgICAgICAgICYmIFJlZ2lvbi5hcmVFcXVhbChvLnRhcmdldCwgb3JkZXIudW5pdC5yZWdpb24pXG4gICAgICAgICAgICAmJiByZXNvbHZlKG8pKSBhcyBTdXBwb3J0T3JkZXJbXTtcbiAgICB9XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG9yZGVycy5sZW5ndGg7ICsraSkge1xuICAgICAgICBpZiAoaXNWYWxpZChvcmRlcnNbaV0pKVxuICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgbGV0IGR1bXAgPSBvcmRlcnNbaV07XG4gICAgICAgIG9yZGVycy5zcGxpY2UoaSwgMSwgbmV3IEhvbGRPcmRlcihkdW1wLnVuaXQpKTtcbiAgICB9XG5cbiAgICBsZXQgYXNzdW1lZCA9IG5ldyBTZXQ8QW55T3JkZXI+KCk7XG5cbiAgICBsZXQgcGFzc2VkID0gbmV3IFNldDxBbnlPcmRlcj4oKTtcbiAgICBsZXQgY2hlY2tlZCA9IG5ldyBTZXQ8QW55T3JkZXI+KCk7XG4gICAgbGV0IHJlYXNvbnMgPSBuZXcgTWFwPEFueU9yZGVyLCBzdHJpbmc+KCk7XG5cbiAgICBsZXQgc3RhY2s6IEFueU9yZGVyW10gPSBbXTtcblxuICAgIGZ1bmN0aW9uIGZhaWwob3JkZXI6IEFueU9yZGVyLCByZWFzb246IHN0cmluZyk6IGZhbHNlIHtcbiAgICAgICAgc3RhY2sucG9wKCk7XG4gICAgICAgIGlmIChhc3N1bWVkLnNpemUgPT0gMClcbiAgICAgICAgICAgIHJlYXNvbnMuc2V0KG9yZGVyLCByZWFzb24pO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGFzcyhvcmRlcjogQW55T3JkZXIpOiB0cnVlIHtcbiAgICAgICAgc3RhY2sucG9wKCk7XG4gICAgICAgIGlmIChhc3N1bWVkLnNpemUgPT0gMClcbiAgICAgICAgICAgIHBhc3NlZC5hZGQob3JkZXIpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNvbHZlKG9yZGVyOiBBbnlPcmRlciwgZm9yY2UgPSBmYWxzZSk6IGJvb2xlYW4ge1xuICAgICAgICBpZiAoc3RhY2tbMF0gPT0gb3JkZXIgJiYgc3RhY2suZXZlcnkobyA9PiBvLnR5cGUgPT0gJ21vdmUnKSAmJiBzdGFjay5sZW5ndGggPiAyKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIGlmIChzdGFjay5pbmNsdWRlcyhvcmRlcikpIHtcbiAgICAgICAgICAgIGlmIChzdGFjay5pbmRleE9mKG9yZGVyKSAhPSBzdGFjay5sYXN0SW5kZXhPZihvcmRlcikpXG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyb3IoJ3JlY3Vyc2l2ZSByZXNvbHZlJyk7XG4gICAgICAgIH0gZWxzZSBpZiAoIWZvcmNlICYmIGFzc3VtZWQuc2l6ZSA9PSAwKSB7XG4gICAgICAgICAgICBpZiAoY2hlY2tlZC5oYXMob3JkZXIpKVxuICAgICAgICAgICAgICAgIHJldHVybiBwYXNzZWQuaGFzKG9yZGVyKTtcbiAgICAgICAgICAgIGNoZWNrZWQuYWRkKG9yZGVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhc3N1bWVkLmhhcyhvcmRlcikpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcblxuICAgICAgICBzdGFjay5wdXNoKG9yZGVyKTtcblxuICAgICAgICBpZiAob3JkZXIudHlwZSA9PSAnaG9sZCcpIHtcbiAgICAgICAgICAgIGZvciAobGV0IGF0dGFjayBvZiBvcmRlcnMpIHtcbiAgICAgICAgICAgICAgICBpZiAoYXR0YWNrLnR5cGUgIT0gJ21vdmUnIHx8ICFSZWdpb24uYXJlU2FtZShhdHRhY2sudGFyZ2V0LCBvcmRlci51bml0LnJlZ2lvbikpXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICAgICAgaWYgKHJlc29sdmUoYXR0YWNrKSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwob3JkZXIsIGBEaXNsb2RnZWQgYnkgJyR7YXR0YWNrfSdgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHBhc3Mob3JkZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG9yZGVyLnR5cGUgPT0gJ21vdmUnKSB7XG4gICAgICAgICAgICBsZXQgY3VycmVudCA9IG9yZGVycy5maW5kKG8gPT4gUmVnaW9uLmFyZVNhbWUoby51bml0LnJlZ2lvbiwgb3JkZXIudGFyZ2V0KSk7XG5cbiAgICAgICAgICAgIGxldCBiZXN0OiBNb3ZlT3JkZXJbXSA9IFtdO1xuICAgICAgICAgICAgbGV0IHN0cmVuZ3RoID0gMDtcblxuICAgICAgICAgICAgbGV0IGJlc3REaXNsb2RnZTogTW92ZU9yZGVyW10gPSBbXTtcbiAgICAgICAgICAgIGxldCBkaXNsb2RnZVN0cmVuZ3RoID0gMDtcblxuICAgICAgICAgICAgbGV0IGZvcmNlUmVzb2x2ZWQ6IE1vdmVPcmRlciB8IG51bGwgPSBudWxsO1xuXG4gICAgICAgICAgICBmb3IgKGxldCBhdHRhY2sgb2Ygb3JkZXJzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGF0dGFjay50eXBlICE9ICdtb3ZlJyB8fCAhUmVnaW9uLmFyZVNhbWUoYXR0YWNrLnRhcmdldCwgb3JkZXIudGFyZ2V0KSlcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgICAgICBsZXQgcm91dGVzID0gZmluZFJvdXRlcyhhdHRhY2spO1xuICAgICAgICAgICAgICAgIGlmIChyb3V0ZXMgPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXR0YWNrID09IG9yZGVyKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwob3JkZXIsIGBObyB2YWxpZCByb3V0ZWApO1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGxldCBzdXBwb3J0ID0gZmluZE1vdmVTdXBwb3J0KGF0dGFjayk7XG5cbiAgICAgICAgICAgICAgICBpZiAoY3VycmVudCAmJiBjdXJyZW50LnR5cGUgPT0gJ21vdmUnICYmIFJlZ2lvbi5hcmVTYW1lKGN1cnJlbnQudGFyZ2V0LCBhdHRhY2sudW5pdC5yZWdpb24pKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHByZXZlbnQgZGlzbG9kZ2VkIHVuaXQgZnJvbSBib3VuY2luZyB3aXRoIG90aGVyIHVuaXRzIGVudGVyaW5nIGRpc2xvZGdlcidzIHJlZ2lvblxuICAgICAgICAgICAgICAgICAgICBsZXQgZW5lbWllcyA9IHN1cHBvcnQuZmlsdGVyKG8gPT4gby51bml0LnRlYW0gIT0gY3VycmVudCEudW5pdC50ZWFtKTtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGN1cnJlbnRSb3V0ZXMgPSBmaW5kUm91dGVzKGN1cnJlbnQpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIHRvIGZhaWwgdG8gc3dhcCBwbGFjZXMsIGJvdGggbXVzdCBoYXZlIG5vIHJvdXRlcyB2aWEgY29udm95XG4gICAgICAgICAgICAgICAgICAgIGlmIChjdXJyZW50Um91dGVzID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChlbmVtaWVzLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGF0dGFjayA9PSBvcmRlcilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwob3JkZXIsIGBPdmVycG93ZXJlZCBieSAnJHtjdXJyZW50fScgd2l0aCBzdXBwb3J0ICcnIHZzICcke2VuZW1pZXMuam9pbihcIicsICdcIil9J2ApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoY3VycmVudFJvdXRlcy5wYXRocy5maWx0ZXIobyA9PiBvLmxlbmd0aCA+IDApLmxlbmd0aCA9PSAwICYmIHJvdXRlcy5wYXRocy5maWx0ZXIobyA9PiBvLmxlbmd0aCA+IDApLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgY3VycmVudEF0dGFjayA9IGZpbmRNb3ZlU3VwcG9ydChjdXJyZW50KS5maWx0ZXIobyA9PiBvLnVuaXQudGVhbSAhPSBhdHRhY2sudW5pdC50ZWFtKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjdXJyZW50QXR0YWNrLmxlbmd0aCA+IGVuZW1pZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGF0dGFjayA9PSBvcmRlcilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwob3JkZXIsIGBPdmVycG93ZXJlZCBieSAnJHtjdXJyZW50fScgd2l0aCBzdXBwb3J0ICcke2N1cnJlbnRBdHRhY2suam9pbihcIicsICdcIil9JyB2cyAnJHtlbmVtaWVzLmpvaW4oXCInLCAnXCIpfSdgKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yY2VSZXNvbHZlZCA9IGF0dGFjaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChzdXBwb3J0Lmxlbmd0aCA+IHN0cmVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGJlc3QgPSBbYXR0YWNrXTtcbiAgICAgICAgICAgICAgICAgICAgc3RyZW5ndGggPSBzdXBwb3J0Lmxlbmd0aDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHN1cHBvcnQubGVuZ3RoID09IHN0cmVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGJlc3QucHVzaChhdHRhY2spO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChjdXJyZW50ICYmIGF0dGFjay51bml0LnRlYW0gIT0gY3VycmVudC51bml0LnRlYW0pIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IGVuZW1pZXMgPSBzdXBwb3J0LmZpbHRlcihvID0+IG8udW5pdC50ZWFtICE9IGN1cnJlbnQhLnVuaXQudGVhbSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChlbmVtaWVzLmxlbmd0aCA+IGRpc2xvZGdlU3RyZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJlc3REaXNsb2RnZSA9IFthdHRhY2tdO1xuICAgICAgICAgICAgICAgICAgICAgICAgZGlzbG9kZ2VTdHJlbmd0aCA9IGVuZW1pZXMubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGVuZW1pZXMubGVuZ3RoID09IGRpc2xvZGdlU3RyZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJlc3REaXNsb2RnZS5wdXNoKGF0dGFjayk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghYmVzdC5pbmNsdWRlcyhvcmRlcikpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwob3JkZXIsIGBPdmVycG93ZXJlZCBieSAnJHtiZXN0LmpvaW4oXCInLCAnXCIpfScgd2l0aCBzdHJlbmd0aCAke3N0cmVuZ3RofSB2cyAke2ZpbmRNb3ZlU3VwcG9ydChvcmRlcikubGVuZ3RofSBgKTtcblxuICAgICAgICAgICAgaWYgKGJlc3QubGVuZ3RoICE9IDEpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwob3JkZXIsIGBTdGFuZG9mZiB3aXRoICcke2Jlc3Quam9pbihcIicsICdcIil9JyB3aXRoIHN0cmVuZ3RoICR7c3RyZW5ndGh9IGApO1xuXG4gICAgICAgICAgICBpZiAoY3VycmVudCAmJiBiZXN0WzBdICE9IGZvcmNlUmVzb2x2ZWQpIHtcbiAgICAgICAgICAgICAgICBpZiAoY3VycmVudC50eXBlID09ICdtb3ZlJyAmJiBSZWdpb24uYXJlU2FtZShjdXJyZW50LnRhcmdldCwgYmVzdFswXS51bml0LnJlZ2lvbikpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGJlc3REaXNsb2RnZS5sZW5ndGggIT0gMSB8fCBiZXN0WzBdICE9IGJlc3REaXNsb2RnZVswXSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKG9yZGVyLCBgQXZvaWRpbmcgc2VsZi1kaXNsb2RnZW1lbnRgKTtcblxuICAgICAgICAgICAgICAgICAgICBsZXQgY3VycmVudEF0dGFjayA9IGZpbmRNb3ZlU3VwcG9ydChjdXJyZW50KS5maWx0ZXIobyA9PiBvLnVuaXQudGVhbSAhPSBiZXN0WzBdLnVuaXQudGVhbSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjdXJyZW50QXR0YWNrLmxlbmd0aCA9PSBkaXNsb2RnZVN0cmVuZ3RoKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwob3JkZXIsIGBCYWxhbmNlZCBmYWNlb2ZmICcke2N1cnJlbnRBdHRhY2suam9pbihcIicsICdcIil9JyB2cyAnJHtmaW5kTW92ZVN1cHBvcnQob3JkZXIpLmZpbHRlcihvID0+IG8udW5pdC50ZWFtICE9IGN1cnJlbnQhLnVuaXQudGVhbSkuam9pbihcIicsICdcIil9J2ApO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChjdXJyZW50QXR0YWNrLmxlbmd0aCA+IGRpc2xvZGdlU3RyZW5ndGgpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBlcnJvcignRmFpbGVkIHRvIGZpbHRlciBvdXQgZGlzbG9kZ2VkIGF0dGFjaycpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoY3VycmVudC50eXBlICE9ICdtb3ZlJyB8fCAhcmVzb2x2ZShjdXJyZW50KSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoYmVzdERpc2xvZGdlLmxlbmd0aCAhPSAxIHx8IGJlc3RbMF0gIT0gYmVzdERpc2xvZGdlWzBdKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwob3JkZXIsIGBBdm9pZGluZyBzZWxmLWRpc2xvZGdlbWVudGApO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChkaXNsb2RnZVN0cmVuZ3RoID09IDApXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChvcmRlciwgYEhlbGQgd2l0aCA/PyB2cyBub3RoaW5nYCk7XG5cbiAgICAgICAgICAgICAgICAgICAgbGV0IGhvbGRTdXBwb3J0ID0gZmluZEhvbGRTdXBwb3J0KGN1cnJlbnQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaG9sZFN1cHBvcnQubGVuZ3RoID49IGRpc2xvZGdlU3RyZW5ndGgpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChvcmRlciwgYEhlbGQgd2l0aCAnJHtob2xkU3VwcG9ydC5qb2luKCcsICcpfScgdnMgJyR7ZmluZE1vdmVTdXBwb3J0KG9yZGVyKS5maWx0ZXIobyA9PiBvLnVuaXQudGVhbSAhPSBjdXJyZW50IS51bml0LnRlYW0pLmpvaW4oXCInLCAnXCIpfSdgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBwYXNzKG9yZGVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChvcmRlci50eXBlID09ICdjb252b3knKSB7XG4gICAgICAgICAgICBpZiAob3JkZXIudW5pdC5yZWdpb24udHlwZSAhPSBVbml0VHlwZS5XYXRlcilcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChvcmRlciwgJ09ubHkgd2F0ZXIgdW5pdHMgY2FuIGNvbnZveScpO1xuXG4gICAgICAgICAgICBsZXQgdGFyZ2V0ID0gb3JkZXJzLmZpbmQobyA9PiBvLnR5cGUgPT0gJ21vdmUnXG4gICAgICAgICAgICAgICAgJiYgby51bml0LnR5cGUgPT0gVW5pdFR5cGUuTGFuZFxuICAgICAgICAgICAgICAgICYmIFJlZ2lvbi5hcmVTYW1lKG8udW5pdC5yZWdpb24sIG9yZGVyLnN0YXJ0KVxuICAgICAgICAgICAgICAgICYmIFJlZ2lvbi5hcmVTYW1lKG8udGFyZ2V0LCBvcmRlci5lbmQpKTtcbiAgICAgICAgICAgIGlmICh0YXJnZXQgPT0gbnVsbClcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChvcmRlciwgJ05vIG1hdGNoaW5nIHRhcmdldCcpO1xuXG4gICAgICAgICAgICBmb3IgKGxldCBhdHRhY2sgb2Ygb3JkZXJzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGF0dGFjay50eXBlICE9ICdtb3ZlJyB8fCAhUmVnaW9uLmFyZVNhbWUoYXR0YWNrLnRhcmdldCwgb3JkZXIudW5pdC5yZWdpb24pKVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgICAgIGlmIChyZXNvbHZlKGF0dGFjaykpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKG9yZGVyLCBgRGlzbG9kZ2VkIGJ5ICcke2F0dGFja30nYCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBwYXNzKG9yZGVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChvcmRlci50eXBlID09ICdzdXBwb3J0Jykge1xuICAgICAgICAgICAgbGV0IHN1cHBvcnRlZSA9IG9yZGVycy5maW5kKG8gPT4gUmVnaW9uLmFyZVNhbWUoby51bml0LnJlZ2lvbiwgb3JkZXIudGFyZ2V0KSk7XG4gICAgICAgICAgICBpZiAoc3VwcG9ydGVlID09IG51bGwpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwob3JkZXIsICdObyBtYXRjaGluZyB0YXJnZXQnKTtcblxuICAgICAgICAgICAgaWYgKG9yZGVyLmF0dGFjaykge1xuICAgICAgICAgICAgICAgIGlmIChzdXBwb3J0ZWUudHlwZSAhPSAnbW92ZScpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKG9yZGVyLCBgU3VwcG9ydCBhdHRhY2tlZCAke29yZGVyLmF0dGFjay5uYW1lfSB0YXJnZXQgd2FzICR7c3VwcG9ydGVlfWApO1xuICAgICAgICAgICAgICAgIGlmICghY2FuUmVhY2gob3JkZXIudW5pdCwgb3JkZXIuYXR0YWNrKSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwob3JkZXIsIGBTdXBwb3J0IGF0dGFja2VkICR7b3JkZXIuYXR0YWNrLm5hbWV9IGJ1dCBjb3VsZCBub3QgcmVhY2hgKTtcbiAgICAgICAgICAgICAgICBpZiAoIVJlZ2lvbi5hcmVFcXVhbChzdXBwb3J0ZWUudGFyZ2V0LCBvcmRlci5hdHRhY2spKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChvcmRlciwgYFN1cHBvcnQgYXR0YWNrZWQgJHtvcmRlci5hdHRhY2submFtZX0gYnV0IHRhcmdldCBhdHRhY2tlZCAke3N1cHBvcnRlZS50YXJnZXR9YCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChzdXBwb3J0ZWUudHlwZSA9PSAnbW92ZScpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWlsKG9yZGVyLCBgU3VwcG9ydCBoZWxkIGJ1dCB0YXJnZXQgd2FzICR7c3VwcG9ydGVlfWApO1xuICAgICAgICAgICAgICAgIGlmICghY2FuUmVhY2gob3JkZXIudW5pdCwgb3JkZXIudGFyZ2V0KSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwob3JkZXIsIGBTdXBwb3J0IGhlbGQgJHtvcmRlci50YXJnZXQubmFtZX0gYnV0IGNvdWxkIG5vdCByZWFjaGApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGxldCBhdHRhY2sgb2Ygb3JkZXJzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGF0dGFjay50eXBlICE9ICdtb3ZlJyB8fCAhUmVnaW9uLmFyZVNhbWUoYXR0YWNrLnRhcmdldCwgb3JkZXIudW5pdC5yZWdpb24pKVxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgICAgIGlmIChvcmRlci51bml0LnRlYW0gPT0gYXR0YWNrLnVuaXQudGVhbSlcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgICAgICBpZiAoc3VwcG9ydGVlLnR5cGUgPT0gJ21vdmUnKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChSZWdpb24uYXJlU2FtZShzdXBwb3J0ZWUudGFyZ2V0LCBhdHRhY2sudW5pdC5yZWdpb24pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiBpdCBpcyBmcm9tIHRoZSB0YXJnZXQgcmVnaW9uIG9mIHRoZSBzdXBwb3J0ZWQgYXR0YWNrLFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaXQgY2FuIG9ubHkgY3V0IHN1cHBvcnQgYnkgZGlzbG9kZ2luZ1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc29sdmUoYXR0YWNrKSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFpbChvcmRlciwgYERpc2xvZGdlZCBieSAnJHthdHRhY2t9J2ApO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaWYgaXQgaXMgY29udm95ZWQgYnkgdGhlIHRhcmdldCByZWdpb24gb2YgdGhlIHN1cHBvcnRlZCBhdHRhY2ssXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpdCBjYW4gb25seSBjdXQgc3VwcG9ydCBpZiBpdCBoYXMgYW4gYWx0ZXJuYXRlIHBhdGhcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCByb3V0ZXMgPSBmaW5kUm91dGVzKGF0dGFjaywgc3VwcG9ydGVlLnRhcmdldCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocm91dGVzICE9IG51bGwpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwob3JkZXIsIGBEaXNydXB0ZWQgYnkgJyR7YXR0YWNrfSdgKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gb3IgaWYgdGhlIHN1cHBvcnQgZG9lc24ndCBicmVhayB0aGUgY29udm95XG4gICAgICAgICAgICAgICAgICAgICAgICBhc3N1bWVkLmFkZChvcmRlcik7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzb2x2ZShhdHRhY2spKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXNzdW1lZC5kZWxldGUob3JkZXIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwob3JkZXIsIGBEaXNsb2RnZWQgYnkgJyR7YXR0YWNrfSdgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGFzc3VtZWQuZGVsZXRlKG9yZGVyKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IHJvdXRlcyA9IGZpbmRSb3V0ZXMoYXR0YWNrKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJvdXRlcyAhPSBudWxsKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhaWwob3JkZXIsIGBEaXNydXB0ZWQgYnkgJyR7YXR0YWNrfSdgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBwYXNzKG9yZGVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRocm93IGVycm9yKGBJbnZhbGlkIG9yZGVyYCk7XG4gICAgfVxuXG4gICAgbGV0IGV2aWN0ZWQ6IFVuaXRbXSA9IFtdO1xuICAgIGxldCByZXNvbHZlZDogTW92ZU9yZGVyW10gPSBbXTtcblxuICAgIGZvciAobGV0IG9yZGVyIG9mIG9yZGVycykge1xuICAgICAgICBsZXQgdmFsaWQgPSByZXNvbHZlKG9yZGVyKTtcblxuICAgICAgICBpZiAob3JkZXIudHlwZSA9PSAnbW92ZScgJiYgdmFsaWQpIHtcbiAgICAgICAgICAgIHJlc29sdmVkLnB1c2gob3JkZXIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZm9yIChsZXQgYXR0YWNrIG9mIG9yZGVycykge1xuICAgICAgICAgICAgICAgIGlmIChhdHRhY2sudHlwZSAhPSAnbW92ZScgfHwgIVJlZ2lvbi5hcmVTYW1lKGF0dGFjay50YXJnZXQsIG9yZGVyLnVuaXQucmVnaW9uKSlcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgICAgICBpZiAocmVzb2x2ZShhdHRhY2spKSB7XG4gICAgICAgICAgICAgICAgICAgIGV2aWN0ZWQucHVzaChvcmRlci51bml0KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFyZWFzb25zLmhhcyhvcmRlcikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlYnVnZ2VyO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShvcmRlciwgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWJ1Z2dlcjtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoYXR0YWNrLCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7IHJlc29sdmVkLCBldmljdGVkLCByZWFzb25zIH07XG59XG5cbmZ1bmN0aW9uIGVycm9yKG1zZzogc3RyaW5nKSB7XG4gICAgZGVidWdnZXI7XG4gICAgcmV0dXJuIG5ldyBFcnJvcihtc2cpO1xufVxuIiwiaW1wb3J0IHsgTW92ZU9yZGVyLCBIb2xkT3JkZXIsIFN1cHBvcnRPcmRlciwgQ29udm95T3JkZXIsIFVuaXQsIFVuaXRUeXBlIH0gZnJvbSBcIi4vZ2FtZVwiO1xuXG5leHBvcnQgZGVmYXVsdCB7XG4gICAgaGVhZGVyKG9iajogYW55LCBjb25maWc6IGFueSkge1xuICAgICAgICBpZiAob2JqIGluc3RhbmNlb2YgTW92ZU9yZGVyIHx8IG9iaiBpbnN0YW5jZW9mIEhvbGRPcmRlciB8fCBvYmogaW5zdGFuY2VvZiBTdXBwb3J0T3JkZXIgfHwgb2JqIGluc3RhbmNlb2YgQ29udm95T3JkZXIpIHtcbiAgICAgICAgICAgIHJldHVybiBbXCJzcGFuXCIsIHt9LCBvYmoudG9TdHJpbmcoKV07XG4gICAgICAgIH1cblxuICAgICAgICBpZiAob2JqIGluc3RhbmNlb2YgVW5pdCkge1xuICAgICAgICAgICAgcmV0dXJuIFtcInNwYW5cIiwge30sIGAke29iai50ZWFtfSAke29iai50eXBlID09IFVuaXRUeXBlLldhdGVyID8gJ2ZsZWV0JyA6ICdhcm15J30gaW4gJHtvYmoucmVnaW9uLm5hbWV9YF07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9LFxuICAgIGhhc0JvZHkob2JqOiBhbnksIGNvbmZpZzogYW55KSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9LFxuICAgIGJvZHkob2JqOiBhbnksIGNvbmZpZzogYW55KSB7XG4gICAgfVxufTtcbiIsImltcG9ydCB7IFJlZ2lvbiwgR2FtZU1hcCwgVW5pdFR5cGUgfSBmcm9tIFwiLi4vZ2FtZVwiO1xuXG5jb25zdCBMQU5EID0gVW5pdFR5cGUuTGFuZDtcbmNvbnN0IFdBVEVSID0gVW5pdFR5cGUuV2F0ZXI7XG5cbmV4cG9ydCBjb25zdCBzdXBwbHlDZW50ZXJzID0gW1xuICBcIlJVTVwiLFxuICBcIkJVTFwiLFxuICBcIlNFUlwiLFxuICBcIlBPUlwiLFxuICBcIlNQQVwiLFxuICBcIlNXRVwiLFxuICBcIk5XWVwiLFxuICBcIkRFTlwiLFxuICBcIkhPTFwiLFxuICBcIkJFTFwiLFxuICBcIlRVTlwiLFxuICBcIkdSRVwiLFxuICBcIkJVRFwiLFxuICBcIlRSSVwiLFxuICBcIlZJRVwiLFxuICBcIkVESVwiLFxuICBcIkxWUFwiLFxuICBcIkxPTlwiLFxuICBcIkJSRVwiLFxuICBcIk1BUlwiLFxuICBcIlBBUlwiLFxuICBcIkJFUlwiLFxuICBcIktJRVwiLFxuICBcIk1VTlwiLFxuICBcIk5BUFwiLFxuICBcIlJPTVwiLFxuICBcIlZFTlwiLFxuICBcIk1PU1wiLFxuICBcIlNUUFwiLFxuICBcIlNFVlwiLFxuICBcIldBUlwiLFxuICBcIkFOS1wiLFxuICBcIkNPTlwiLFxuICBcIlNNWVwiLFxuXTtcblxuZnVuY3Rpb24gbihpZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIHR5cGU6IFVuaXRUeXBlKTogUmVnaW9uIHtcbiAgY29uc3QgaXNTdXBwbHlDZW50ZXIgPSBzdXBwbHlDZW50ZXJzLmluY2x1ZGVzKGlkKTtcbiAgcmV0dXJuIG5ldyBSZWdpb24oaWQsIG5hbWUsIHR5cGUsIGlzU3VwcGx5Q2VudGVyKTtcbn1cblxuLy8gYXVzdHJpYVxubGV0IEJPSCA9IG4oXCJCT0hcIiwgXCJCb2hlbWlhXCIsIExBTkQpO1xubGV0IEJVRCA9IG4oXCJCVURcIiwgXCJCdWRhcGVzdFwiLCBMQU5EKTtcbmxldCBHQUwgPSBuKFwiR0FMXCIsIFwiR2FsaWNpYVwiLCBMQU5EKTtcbmxldCBUUkkgPSBuKFwiVFJJXCIsIFwiVHJpZXN0ZVwiLCBMQU5EKTtcbmxldCBUWVIgPSBuKFwiVFlSXCIsIFwiVHlyb2xpYVwiLCBMQU5EKTtcbmxldCBWSUUgPSBuKFwiVklFXCIsIFwiVmllbm5hXCIsIExBTkQpO1xuXG4vLyBlbmdsYW5kXG5sZXQgQ0xZID0gbihcIkNMWVwiLCBcIkNseWRlXCIsIExBTkQpO1xubGV0IEVESSA9IG4oXCJFRElcIiwgXCJFZGluYnVyZ2hcIiwgTEFORCk7XG5sZXQgTFZQID0gbihcIkxWUFwiLCBcIkxpdmVycG9vbFwiLCBMQU5EKTtcbmxldCBMT04gPSBuKFwiTE9OXCIsIFwiTG9uZG9uXCIsIExBTkQpO1xubGV0IFdBTCA9IG4oXCJXQUxcIiwgXCJXYWxlc1wiLCBMQU5EKTtcbmxldCBZT1IgPSBuKFwiWU9SXCIsIFwiWW9ya3NoaXJlXCIsIExBTkQpO1xuXG4vLyBmcmFuY2VcbmxldCBCUkUgPSBuKFwiQlJFXCIsIFwiQnJlc3RcIiwgTEFORCk7XG5sZXQgQlVSID0gbihcIkJVUlwiLCBcIkJ1cmd1bmR5XCIsIExBTkQpO1xubGV0IEdBUyA9IG4oXCJHQVNcIiwgXCJHYXNjb255XCIsIExBTkQpO1xubGV0IE1BUiA9IG4oXCJNQVJcIiwgXCJNYXJzZWlsbGVzXCIsIExBTkQpO1xubGV0IFBBUiA9IG4oXCJQQVJcIiwgXCJQYXJpc1wiLCBMQU5EKTtcbmxldCBQSUMgPSBuKFwiUElDXCIsIFwiUGljYXJkeVwiLCBMQU5EKTtcblxuLy8gZ2VybWFueVxubGV0IEJFUiA9IG4oXCJCRVJcIiwgXCJCZXJsaW5cIiwgTEFORCk7XG5sZXQgS0lFID0gbihcIktJRVwiLCBcIktpZWxcIiwgTEFORCk7XG5sZXQgTVVOID0gbihcIk1VTlwiLCBcIk11bmljaFwiLCBMQU5EKTtcbmxldCBQUlUgPSBuKFwiUFJVXCIsIFwiUHJ1c3NpYVwiLCBMQU5EKTtcbmxldCBSVUggPSBuKFwiUlVIXCIsIFwiUnVoclwiLCBMQU5EKTtcbmxldCBTSUwgPSBuKFwiU0lMXCIsIFwiU2lsZXNpYVwiLCBMQU5EKTtcblxuLy8gaXRhbHlcbmxldCBBUFUgPSBuKFwiQVBVXCIsIFwiQXB1bGlhXCIsIExBTkQpO1xubGV0IE5BUCA9IG4oXCJOQVBcIiwgXCJOYXBsZXNcIiwgTEFORCk7XG5sZXQgUElFID0gbihcIlBJRVwiLCBcIlBpZWRtb250XCIsIExBTkQpO1xubGV0IFJPTSA9IG4oXCJST01cIiwgXCJSb21lXCIsIExBTkQpO1xubGV0IFRVUyA9IG4oXCJUVVNcIiwgXCJUdXNjYW55XCIsIExBTkQpO1xubGV0IFZFTiA9IG4oXCJWRU5cIiwgXCJWZW5pY2VcIiwgTEFORCk7XG5cbi8vIHJ1c3NpYVxubGV0IEZJTiA9IG4oXCJGSU5cIiwgXCJGaW5sYW5kXCIsIExBTkQpO1xubGV0IExWTiA9IG4oXCJMVk5cIiwgXCJMaXZvbmlhXCIsIExBTkQpO1xubGV0IE1PUyA9IG4oXCJNT1NcIiwgXCJNb3Njb3dcIiwgTEFORCk7XG5sZXQgU0VWID0gbihcIlNFVlwiLCBcIlNldmFzdG9wb2xcIiwgTEFORCk7XG5sZXQgU1RQID0gbihcIlNUUFwiLCBcIlN0LiBQZXRlcnNidXJnXCIsIExBTkQpO1xubGV0IFVLUiA9IG4oXCJVS1JcIiwgXCJVa3JhaW5lXCIsIExBTkQpO1xubGV0IFdBUiA9IG4oXCJXQVJcIiwgXCJXYXJzYXdcIiwgTEFORCk7XG5cbi8vIHR1cmtleVxubGV0IEFOSyA9IG4oXCJBTktcIiwgXCJBbmthcmFcIiwgTEFORCk7XG5sZXQgQVJNID0gbihcIkFSTVwiLCBcIkFybWVuaWFcIiwgTEFORCk7XG5sZXQgQ09OID0gbihcIkNPTlwiLCBcIkNvbnN0YW50aW5vcGxlXCIsIExBTkQpO1xubGV0IFNNWSA9IG4oXCJTTVlcIiwgXCJTbXlybmFcIiwgTEFORCk7XG5sZXQgU1lSID0gbihcIlNZUlwiLCBcIlN5cmlhXCIsIExBTkQpO1xuXG4vLyBuZXV0cmFsXG5sZXQgQUxCID0gbihcIkFMQlwiLCBcIkFsYmFuaWFcIiwgTEFORCk7XG5sZXQgQkVMID0gbihcIkJFTFwiLCBcIkJlbGdpdW1cIiwgTEFORCk7XG5sZXQgQlVMID0gbihcIkJVTFwiLCBcIkJ1bGdhcmlhXCIsIExBTkQpO1xubGV0IERFTiA9IG4oXCJERU5cIiwgXCJEZW5tYXJrXCIsIExBTkQpO1xubGV0IEdSRSA9IG4oXCJHUkVcIiwgXCJHcmVlY2VcIiwgTEFORCk7XG5sZXQgSE9MID0gbihcIkhPTFwiLCBcIkhvbGxhbmRcIiwgTEFORCk7XG5sZXQgTldZID0gbihcIk5XWVwiLCBcIk5vcndheVwiLCBMQU5EKTtcbmxldCBOQUYgPSBuKFwiTkFGXCIsIFwiTm9ydGggQWZyaWNhXCIsIExBTkQpO1xubGV0IFBPUiA9IG4oXCJQT1JcIiwgXCJQb3J0dWdhbFwiLCBMQU5EKTtcbmxldCBSVU0gPSBuKFwiUlVNXCIsIFwiUnVtYW5pYVwiLCBMQU5EKTtcbmxldCBTRVIgPSBuKFwiU0VSXCIsIFwiU2VyYmlhXCIsIExBTkQpO1xubGV0IFNQQSA9IG4oXCJTUEFcIiwgXCJTcGFpblwiLCBMQU5EKTtcbmxldCBTV0UgPSBuKFwiU1dFXCIsIFwiU3dlZGVuXCIsIExBTkQpO1xubGV0IFRVTiA9IG4oXCJUVU5cIiwgXCJUdW5pc1wiLCBMQU5EKTtcblxuLy8gd2F0ZXJcbmxldCBBRFIgPSBuKFwiQURSXCIsIFwiQWRyaWF0aWMgU2VhXCIsIFdBVEVSKTtcbmxldCBBRUcgPSBuKFwiQUVHXCIsIFwiQWVnZWFuIFNlYVwiLCBXQVRFUik7XG5sZXQgQkFMID0gbihcIkJBTFwiLCBcIkJhbHRpYyBTZWFcIiwgV0FURVIpO1xubGV0IEJBUiA9IG4oXCJCQVJcIiwgXCJCYXJlbnRzIFNlYVwiLCBXQVRFUik7XG5sZXQgQkxBID0gbihcIkJMQVwiLCBcIkJsYWNrIFNlYVwiLCBXQVRFUik7XG5sZXQgRUFTID0gbihcIkVBU1wiLCBcIkVhc3Rlcm4gTWVkaXRlcnJhbmVhblwiLCBXQVRFUik7XG5sZXQgRU5HID0gbihcIkVOR1wiLCBcIkVuZ2xpc2ggQ2hhbm5lbFwiLCBXQVRFUik7XG5sZXQgQk9UID0gbihcIkJPVFwiLCBcIkd1bGYgb2YgQm90aG5pYVwiLCBXQVRFUik7XG5sZXQgR09MID0gbihcIkdPTFwiLCBcIkd1bGYgb2YgTHlvblwiLCBXQVRFUik7XG5sZXQgSEVMID0gbihcIkhFTFwiLCBcIkhlbGdvbGFuZCBCaWdodFwiLCBXQVRFUik7XG5sZXQgSU9OID0gbihcIklPTlwiLCBcIklvbmlhbiBTZWFcIiwgV0FURVIpO1xubGV0IElSSSA9IG4oXCJJUklcIiwgXCJJcmlzaCBTZWFcIiwgV0FURVIpO1xubGV0IE1JRCA9IG4oXCJNSURcIiwgXCJNaWQtQXRsYW50aWMgT2NlYW5cIiwgV0FURVIpO1xubGV0IE5BVCA9IG4oXCJOQVRcIiwgXCJOb3J0aCBBdGxhbnRpYyBPY2VhblwiLCBXQVRFUik7XG5sZXQgTlRIID0gbihcIk5USFwiLCBcIk5vcnRoIFNlYVwiLCBXQVRFUik7XG5sZXQgTlJHID0gbihcIk5SR1wiLCBcIk5vcndlZ2lhbiBTZWFcIiwgV0FURVIpO1xubGV0IFNLQSA9IG4oXCJTS0FcIiwgXCJTa2FnZXJyYWNrXCIsIFdBVEVSKTtcbmxldCBUWU4gPSBuKFwiVFlOXCIsIFwiVHlycmhlbmlhbiBTZWFcIiwgV0FURVIpO1xubGV0IFdFUyA9IG4oXCJXRVNcIiwgXCJXZXN0ZXJuIE1lZGl0ZXJyYW5lYW5cIiwgV0FURVIpO1xuXG5sZXQgU1RQX05PUlRIID0gbihcIlNUUE5cIiwgXCJTdC4gUGV0ZXJzYnVyZyAoTm9ydGggQ29hc3QpXCIsIExBTkQpO1xubGV0IFNUUF9TT1VUSCA9IG4oXCJTVFBTXCIsIFwiU3QuIFBldGVyc2J1cmcgKFNvdXRoIENvYXN0KVwiLCBMQU5EKTtcblxubGV0IFNQQV9OT1JUSCA9IG4oXCJTUEFOXCIsIFwiU3BhaW4gKE5vcnRoIENvYXN0KVwiLCBMQU5EKTtcbmxldCBTUEFfU09VVEggPSBuKFwiU1BBU1wiLCBcIlNwYWluIChTb3V0aCBDb2FzdClcIiwgTEFORCk7XG5cbmxldCBCVUxfTk9SVEggPSBuKFwiQlVMRVwiLCBcIkJ1bGdhcmlhIChFYXN0IENvYXN0KVwiLCBMQU5EKTtcbmxldCBCVUxfU09VVEggPSBuKFwiQlVMU1wiLCBcIkJ1bGdhcmlhIChTb3V0aCBDb2FzdClcIiwgTEFORCk7XG5cbmZ1bmN0aW9uIGJvcmRlcihub2RlOiBSZWdpb24sIGFkamFjZW50OiBSZWdpb25bXSkge1xuICBmb3IgKGxldCBvdGhlciBvZiBhZGphY2VudCkgbm9kZS5hZGphY2VudC5hZGQob3RoZXIpO1xufVxuXG5mdW5jdGlvbiBhdHRhY2gobm9kZTogUmVnaW9uLCBhdHRhY2hlZDogUmVnaW9uW10pIHtcbiAgbGV0IGFsbCA9IFtub2RlLCAuLi5hdHRhY2hlZF07XG4gIGZvciAobGV0IHJlZ2lvbiBvZiBhbGwpIHtcbiAgICBmb3IgKGxldCBvdGhlciBvZiBhbGwpIHtcbiAgICAgIGlmIChvdGhlciA9PSByZWdpb24pIGNvbnRpbnVlO1xuICAgICAgcmVnaW9uLmF0dGFjaGVkLmFkZChvdGhlcik7XG4gICAgfVxuICB9XG59XG5cbmJvcmRlcihTVFBfTk9SVEgsIFtCQVIsIE5XWV0pO1xuYXR0YWNoKFNUUCwgW1NUUF9TT1VUSCwgU1RQX05PUlRIXSk7XG5ib3JkZXIoU1RQX1NPVVRILCBbQk9ULCBMVk4sIEZJTl0pO1xuXG5ib3JkZXIoQlVMX05PUlRILCBbQkxBLCBDT04sIFJVTV0pO1xuYXR0YWNoKEJVTCwgW0JVTF9TT1VUSCwgQlVMX05PUlRIXSk7XG5ib3JkZXIoQlVMX1NPVVRILCBbQUVHLCBHUkUsIENPTl0pO1xuXG5ib3JkZXIoU1BBX05PUlRILCBbTUlELCBQT1IsIEdBU10pO1xuYXR0YWNoKFNQQSwgW1NQQV9TT1VUSCwgU1BBX05PUlRIXSk7XG5ib3JkZXIoU1BBX1NPVVRILCBbR09MLCBXRVMsIE1JRCwgUE9SLCBNQVJdKTtcblxuYm9yZGVyKE5BVCwgW05SRywgQ0xZLCBMVlAsIElSSSwgTUlEXSk7XG5ib3JkZXIoTlJHLCBbQkFSLCBOV1ksIE5USCwgRURJLCBDTFksIE5BVF0pO1xuYm9yZGVyKENMWSwgW05SRywgRURJLCBMVlAsIE5BVF0pO1xuYm9yZGVyKExWUCwgW0NMWSwgRURJLCBZT1IsIFdBTCwgSVJJLCBOQVRdKTtcbmJvcmRlcihJUkksIFtOQVQsIExWUCwgV0FMLCBFTkcsIE1JRF0pO1xuYm9yZGVyKE1JRCwgW05BVCwgSVJJLCBFTkcsIEJSRSwgR0FTLCBQT1IsIFdFUywgTkFGLCBTUEFfTk9SVEgsIFNQQV9TT1VUSF0pO1xuYm9yZGVyKEJBUiwgW05SRywgTldZLCBTVFBfTk9SVEhdKTtcbmJvcmRlcihOV1ksIFtOUkcsIEJBUiwgU1RQLCBGSU4sIFNXRSwgU0tBLCBOVEgsIFNUUF9OT1JUSF0pO1xuYm9yZGVyKE5USCwgW05SRywgTldZLCBTS0EsIERFTiwgSEVMLCBIT0wsIEJFTCwgRU5HLCBMT04sIFlPUiwgRURJXSk7XG5ib3JkZXIoRURJLCBbTlJHLCBOVEgsIFlPUiwgTFZQLCBDTFldKTtcbmJvcmRlcihZT1IsIFtFREksIE5USCwgTE9OLCBXQUwsIExWUF0pO1xuYm9yZGVyKFdBTCwgW0xWUCwgWU9SLCBMT04sIEVORywgSVJJXSk7XG5ib3JkZXIoRU5HLCBbSVJJLCBXQUwsIExPTiwgTlRILCBCRUwsIFBJQywgQlJFLCBNSURdKTtcbmJvcmRlcihCUkUsIFtFTkcsIFBJQywgUEFSLCBHQVMsIE1JRF0pO1xuYm9yZGVyKEdBUywgW0JSRSwgUEFSLCBCVVIsIE1BUiwgU1BBLCBNSURdKTtcbmJvcmRlcihTUEEsIFtHQVMsIE1BUiwgUE9SXSk7XG5ib3JkZXIoUE9SLCBbTUlELCBTUEEsIFNQQV9OT1JUSCwgU1BBX1NPVVRIXSk7XG5ib3JkZXIoV0VTLCBbR09MLCBUWU4sIFRVTiwgTkFGLCBNSUQsIFNQQV9TT1VUSF0pO1xuYm9yZGVyKE5BRiwgW01JRCwgV0VTLCBUVU5dKTtcbmJvcmRlcihTVFAsIFtOV1ksIE1PUywgTFZOLCBGSU5dKTtcbmJvcmRlcihTV0UsIFtOV1ksIEZJTiwgQk9ULCBCQUwsIERFTiwgU0tBXSk7XG5ib3JkZXIoRklOLCBbTldZLCBTVFAsIEJPVCwgU1dFLCBTVFBfU09VVEhdKTtcbmJvcmRlcihTS0EsIFtOV1ksIFNXRSwgREVOLCBOVEhdKTtcbmJvcmRlcihERU4sIFtTS0EsIFNXRSwgQkFMLCBLSUUsIEhFTCwgTlRIXSk7XG5ib3JkZXIoSEVMLCBbTlRILCBERU4sIEtJRSwgSE9MXSk7XG5ib3JkZXIoSE9MLCBbTlRILCBIRUwsIEtJRSwgUlVILCBCRUxdKTtcbmJvcmRlcihCRUwsIFtFTkcsIE5USCwgSE9MLCBSVUgsIEJVUiwgUElDXSk7XG5ib3JkZXIoTE9OLCBbWU9SLCBOVEgsIEVORywgV0FMXSk7XG5ib3JkZXIoUElDLCBbRU5HLCBCRUwsIEJVUiwgUEFSLCBCUkVdKTtcbmJvcmRlcihQQVIsIFtQSUMsIEJVUiwgR0FTLCBCUkVdKTtcbmJvcmRlcihHQVMsIFtCUkUsIFBBUiwgQlVSLCBNQVIsIFNQQSwgTUlELCBTUEFfTk9SVEhdKTtcbmJvcmRlcihCVVIsIFtQQVIsIFBJQywgQkVMLCBSVUgsIE1VTiwgTUFSLCBHQVNdKTtcbmJvcmRlcihNQVIsIFtHQVMsIEJVUiwgUElFLCBHT0wsIFNQQSwgU1BBX1NPVVRIXSk7XG5ib3JkZXIoR09MLCBbTUFSLCBQSUUsIFRVUywgVFlOLCBXRVMsIFNQQV9TT1VUSF0pO1xuYm9yZGVyKFRZTiwgW1RVUywgUk9NLCBOQVAsIElPTiwgVFVOLCBXRVMsIEdPTF0pO1xuYm9yZGVyKFRVTiwgW1dFUywgVFlOLCBJT04sIE5BRl0pO1xuYm9yZGVyKE1PUywgW1NUUCwgU0VWLCBVS1IsIFdBUiwgTFZOXSk7XG5ib3JkZXIoTFZOLCBbQk9ULCBTVFAsIE1PUywgV0FSLCBQUlUsIEJBTCwgU1RQX1NPVVRIXSk7XG5ib3JkZXIoQk9ULCBbU1dFLCBGSU4sIExWTiwgQkFMLCBTVFBfU09VVEhdKTtcbmJvcmRlcihCQUwsIFtERU4sIFNXRSwgQk9ULCBMVk4sIFBSVSwgQkVSLCBLSUVdKTtcbmJvcmRlcihLSUUsIFtIRUwsIERFTiwgQkFMLCBCRVIsIE1VTiwgUlVILCBIT0xdKTtcbmJvcmRlcihSVUgsIFtCRUwsIEhPTCwgS0lFLCBNVU4sIEJVUl0pO1xuYm9yZGVyKFBJRSwgW1RZUiwgVkVOLCBUVVMsIEdPTCwgTUFSXSk7XG5ib3JkZXIoVFVTLCBbUElFLCBWRU4sIFJPTSwgVFlOLCBHT0xdKTtcbmJvcmRlcihST00sIFtUVVMsIFZFTiwgQVBVLCBOQVAsIFRZTl0pO1xuYm9yZGVyKE5BUCwgW1JPTSwgQVBVLCBJT04sIFRZTl0pO1xuYm9yZGVyKElPTiwgW1RZTiwgTkFQLCBBUFUsIEFEUiwgQUxCLCBHUkUsIEFFRywgRUFTLCBUVU5dKTtcbmJvcmRlcihTRVYsIFtVS1IsIE1PUywgQVJNLCBCTEEsIFJVTV0pO1xuYm9yZGVyKFVLUiwgW01PUywgU0VWLCBSVU0sIEdBTCwgV0FSXSk7XG5ib3JkZXIoV0FSLCBbUFJVLCBMVk4sIE1PUywgVUtSLCBHQUwsIFNJTF0pO1xuYm9yZGVyKFBSVSwgW0JBTCwgTFZOLCBXQVIsIFNJTCwgQkVSXSk7XG5ib3JkZXIoQkVSLCBbQkFMLCBQUlUsIFNJTCwgTVVOLCBLSUVdKTtcbmJvcmRlcihNVU4sIFtSVUgsIEtJRSwgQkVSLCBTSUwsIEJPSCwgVFlSLCBCVVJdKTtcbmJvcmRlcihUWVIsIFtNVU4sIEJPSCwgVklFLCBUUkksIFZFTiwgUElFXSk7XG5ib3JkZXIoVkVOLCBbVFlSLCBUUkksIEFEUiwgQVBVLCBST00sIFRVUywgUElFXSk7XG5ib3JkZXIoQVBVLCBbVkVOLCBBRFIsIElPTiwgTkFQLCBST01dKTtcbmJvcmRlcihBRFIsIFtWRU4sIFRSSSwgQUxCLCBJT04sIEFQVV0pO1xuYm9yZGVyKEFMQiwgW1RSSSwgU0VSLCBHUkUsIElPTiwgQURSXSk7XG5ib3JkZXIoR1JFLCBbQUxCLCBTRVIsIEJVTCwgQUVHLCBJT04sIEJVTF9TT1VUSF0pO1xuYm9yZGVyKEFFRywgW0dSRSwgQ09OLCBTTVksIEVBUywgSU9OLCBCVUxfU09VVEhdKTtcbmJvcmRlcihFQVMsIFtBRUcsIFNNWSwgU1lSLCBJT05dKTtcbmJvcmRlcihBUk0sIFtTRVYsIFNZUiwgU01ZLCBBTkssIEJMQV0pO1xuYm9yZGVyKEJMQSwgW1JVTSwgU0VWLCBBUk0sIEFOSywgQ09OLCBCVUxfTk9SVEhdKTtcbmJvcmRlcihSVU0sIFtCVUQsIEdBTCwgVUtSLCBTRVYsIEJMQSwgQlVMLCBTRVIsIEJVTF9OT1JUSF0pO1xuYm9yZGVyKEdBTCwgW0JPSCwgU0lMLCBXQVIsIFVLUiwgUlVNLCBCVUQsIFZJRV0pO1xuYm9yZGVyKFNJTCwgW0JFUiwgUFJVLCBXQVIsIEdBTCwgQk9ILCBNVU5dKTtcbmJvcmRlcihCT0gsIFtNVU4sIFNJTCwgR0FMLCBWSUUsIFRZUl0pO1xuYm9yZGVyKFZJRSwgW0JPSCwgR0FMLCBCVUQsIFRSSSwgVFlSXSk7XG5ib3JkZXIoVFJJLCBbVFlSLCBWSUUsIEJVRCwgU0VSLCBBTEIsIEFEUiwgVkVOXSk7XG5ib3JkZXIoU0VSLCBbQlVELCBSVU0sIEJVTCwgR1JFLCBBTEIsIFRSSV0pO1xuYm9yZGVyKEJVTCwgW1JVTSwgQ09OLCBHUkUsIFNFUl0pO1xuYm9yZGVyKENPTiwgW0JVTCwgQkxBLCBBTkssIFNNWSwgQUVHLCBCVUxfU09VVEgsIEJVTF9OT1JUSF0pO1xuYm9yZGVyKFNNWSwgW0NPTiwgQU5LLCBBUk0sIFNZUiwgRUFTLCBBRUddKTtcbmJvcmRlcihTWVIsIFtTTVksIEFSTSwgRUFTXSk7XG5ib3JkZXIoQlVELCBbVklFLCBHQUwsIFJVTSwgU0VSLCBUUkldKTtcbmJvcmRlcihBTkssIFtCTEEsIEFSTSwgU01ZLCBDT05dKTtcblxuZXhwb3J0IGNvbnN0IG1hcCA9IG5ldyBHYW1lTWFwKFtcbiAgQk9ILFxuICBCVUQsXG4gIEdBTCxcbiAgVFJJLFxuICBUWVIsXG4gIFZJRSxcbiAgQ0xZLFxuICBFREksXG4gIExWUCxcbiAgTE9OLFxuICBXQUwsXG4gIFlPUixcbiAgQlJFLFxuICBCVVIsXG4gIEdBUyxcbiAgTUFSLFxuICBQQVIsXG4gIFBJQyxcbiAgQkVSLFxuICBLSUUsXG4gIE1VTixcbiAgUFJVLFxuICBSVUgsXG4gIFNJTCxcbiAgQVBVLFxuICBOQVAsXG4gIFBJRSxcbiAgUk9NLFxuICBUVVMsXG4gIFZFTixcbiAgRklOLFxuICBMVk4sXG4gIE1PUyxcbiAgU0VWLFxuICBTVFAsXG4gIFVLUixcbiAgV0FSLFxuICBBTkssXG4gIEFSTSxcbiAgQ09OLFxuICBTTVksXG4gIFNZUixcbiAgQUxCLFxuICBCRUwsXG4gIEJVTCxcbiAgREVOLFxuICBHUkUsXG4gIEhPTCxcbiAgTldZLFxuICBOQUYsXG4gIFBPUixcbiAgUlVNLFxuICBTRVIsXG4gIFNQQSxcbiAgU1dFLFxuICBUVU4sXG4gIEFEUixcbiAgQUVHLFxuICBCQUwsXG4gIEJBUixcbiAgQkxBLFxuICBFQVMsXG4gIEVORyxcbiAgQk9ULFxuICBHT0wsXG4gIEhFTCxcbiAgSU9OLFxuICBJUkksXG4gIE1JRCxcbiAgTkFULFxuICBOVEgsXG4gIE5SRyxcbiAgU0tBLFxuICBUWU4sXG4gIFdFUyxcbiAgU1RQX05PUlRILFxuICBTVFBfU09VVEgsXG4gIFNQQV9OT1JUSCxcbiAgU1BBX1NPVVRILFxuICBCVUxfTk9SVEgsXG4gIEJVTF9TT1VUSCxcbl0pO1xuXG5leHBvcnQgY29uc3QgYWxsUmVnaW9ucyA9IHtcbiAgQk9ILFxuICBCVUQsXG4gIEdBTCxcbiAgVFJJLFxuICBUWVIsXG4gIFZJRSxcbiAgQ0xZLFxuICBFREksXG4gIExWUCxcbiAgTE9OLFxuICBXQUwsXG4gIFlPUixcbiAgQlJFLFxuICBCVVIsXG4gIEdBUyxcbiAgTUFSLFxuICBQQVIsXG4gIFBJQyxcbiAgQkVSLFxuICBLSUUsXG4gIE1VTixcbiAgUFJVLFxuICBSVUgsXG4gIFNJTCxcbiAgQVBVLFxuICBOQVAsXG4gIFBJRSxcbiAgUk9NLFxuICBUVVMsXG4gIFZFTixcbiAgRklOLFxuICBMVk4sXG4gIE1PUyxcbiAgU0VWLFxuICBTVFAsXG4gIFVLUixcbiAgV0FSLFxuICBBTkssXG4gIEFSTSxcbiAgQ09OLFxuICBTTVksXG4gIFNZUixcbiAgQUxCLFxuICBCRUwsXG4gIEJVTCxcbiAgREVOLFxuICBHUkUsXG4gIEhPTCxcbiAgTldZLFxuICBOQUYsXG4gIFBPUixcbiAgUlVNLFxuICBTRVIsXG4gIFNQQSxcbiAgU1dFLFxuICBUVU4sXG4gIEFEUixcbiAgQUVHLFxuICBCQUwsXG4gIEJBUixcbiAgQkxBLFxuICBFQVMsXG4gIEVORyxcbiAgQk9ULFxuICBHT0wsXG4gIEhFTCxcbiAgSU9OLFxuICBJUkksXG4gIE1JRCxcbiAgTkFULFxuICBOVEgsXG4gIE5SRyxcbiAgU0tBLFxuICBUWU4sXG4gIFdFUyxcbiAgU1RQX05PUlRILFxuICBTVFBfU09VVEgsXG4gIFNQQV9OT1JUSCxcbiAgU1BBX1NPVVRILFxuICBCVUxfTk9SVEgsXG4gIEJVTF9TT1VUSCxcbn07XG4iLCJleHBvcnQgKiBmcm9tICcuL2dhbWUnO1xuZXhwb3J0ICogZnJvbSAnLi9ydWxlcyc7XG5cbmltcG9ydCBmb3JtYXR0ZXIgZnJvbSAnLi9mb3JtYXR0ZXInO1xuXG5leHBvcnQgeyBmb3JtYXR0ZXIgfTtcblxuaW1wb3J0ICogYXMgc3RhbmRhcmQgZnJvbSAnLi9tYXBzL3N0YW5kYXJkJztcblxuZXhwb3J0IGNvbnN0IG1hcHMgPSB7XG4gICAgc3RhbmRhcmQ6IHtcbiAgICAgICAgbWFwOiBzdGFuZGFyZC5tYXAsXG4gICAgICAgIHJlZ2lvbnM6IHN0YW5kYXJkLmFsbFJlZ2lvbnMsXG4gICAgfSxcbn07XG4iXSwibmFtZXMiOlsiVW5pdFR5cGUiLCJzdGFuZGFyZC5tYXAiLCJzdGFuZGFyZC5hbGxSZWdpb25zIl0sIm1hcHBpbmdzIjoiOzs7O01BQWEsTUFBTTtJQUlqQixZQUNXLEVBQVUsRUFDVixJQUFZLEVBQ1osSUFBYyxFQUNkLFlBQXFCO1FBSHJCLE9BQUUsR0FBRixFQUFFLENBQVE7UUFDVixTQUFJLEdBQUosSUFBSSxDQUFRO1FBQ1osU0FBSSxHQUFKLElBQUksQ0FBVTtRQUNkLGlCQUFZLEdBQVosWUFBWSxDQUFTO1FBUHZCLGFBQVEsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO1FBQzdCLGFBQVEsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO0tBT2xDO0lBRUosSUFBSSxXQUFXO1FBQ2IsSUFBSSxJQUFJLEdBQUcsQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM5QixLQUFLLElBQUksSUFBSSxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUU7WUFDOUIsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztTQUM3QjtRQUNELEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQzdCLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7U0FDN0I7UUFDRCxPQUFPLElBQUksQ0FBQztLQUNiO0lBRUQsSUFBSSxPQUFPO1FBQ1QsUUFDRSxJQUFJLENBQUMsSUFBSSxJQUFJQSxnQkFBUSxDQUFDLElBQUk7WUFDMUIsQ0FBQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FB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R0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUN0QyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNuQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNsQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQzs7QUFHdEMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDbEMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDckMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDcEMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDdkMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDbEMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7O0FBR3BDLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ25DLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ2pDLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ25DLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ3BDLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ2pDLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDOztBQUdwQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNuQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNuQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNyQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNqQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNwQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQzs7QUFHbkMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDcEMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDcEMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDbkMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDdkMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUMzQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNwQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQzs7QUFHbkMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDbkMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDcEMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUMzQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNuQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQzs7QUFHbEMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDcEMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDcEMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDckMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDcEMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDbkMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDcEMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7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RUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRW5DLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDbkMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQ3BDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFFbkMsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNuQyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDcEMsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRTdDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUN2QyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQzVDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ2xDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDNUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3ZDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQzVFLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDbkMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQzVELE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNyRSxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDdkMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3ZDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUN2QyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDdEQsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3ZDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDNUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUM3QixNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUM5QyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQ2xELE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDN0IsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDbEMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUM1QyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDN0MsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDbEMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUM1QyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNsQyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDdkMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUM1QyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNsQyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDdkMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDbEMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDdkQsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDakQsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUNsRCxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQ2xELE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ2pELE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ2xDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUN2QyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUN2RCxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDN0MsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDakQsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDakQsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3ZDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUN2QyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDdkMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3ZDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ2xDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDM0QsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3ZDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUN2QyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQzVDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUN2QyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDdkMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDakQsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUM1QyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNqRCxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDdkMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3ZDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUN2QyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQ2xELE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDbEQsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDbEMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3ZDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDbEQsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQzVELE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ2pELE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDNUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3ZDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUN2QyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNqRCxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQzVDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ2xDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQzdELE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDNUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUM3QixNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDdkMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFFbEMsQUFBTyxNQUFNLEdBQUcsR0FBRyxJQUFJLE9BQU8sQ0FBQztJQUM3QixHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxTQUFTO0lBQ1QsU0FBUztJQUNULFNBQVM7SUFDVCxTQUFTO0lBQ1QsU0FBUztJQUNULFNBQVM7Q0FDVixDQUFDLENBQUM7QUFFSCxBQUFPLE1BQU0sVUFBVSxHQUFHO0lBQ3hCLEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILEdBQUc7SUFDSCxHQUFHO0lBQ0gsR0FBRztJQUNILFNBQVM7SUFDVCxTQUFTO0lBQ1QsU0FBUztJQUNULFNBQVM7SUFDVCxTQUFTO0lBQ1QsU0FBUztDQUNWLENBQUM7O01DelpXLElBQUksR0FBRztJQUNoQixRQUFRLEVBQUU7UUFDTixHQUFHLEVBQUVDLEdBQVk7UUFDakIsT0FBTyxFQUFFQyxVQUFtQjtLQUMvQjtDQUNKOzs7Ozs7Ozs7Ozs7OzsifQ==
