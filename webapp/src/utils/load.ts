import { Unit } from "diplomacy-common";

import finalState from "../data/final-state.json";
import { allRegions } from "../data";

function titleCase(str) {
  return str
    .toLowerCase()
    .split(" ")
    .map(function(word) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function hasSameId(setOfObjects, idToCheck) {
  for (let obj of setOfObjects) {
    if (obj.name === idToCheck) {
      return true;
    }
  }
  return false;
}
export function load() {
  const units = finalState.map((o) => {
    const region = allRegions.find(
      (r) =>
        r.region.id === o.region.id || hasSameId(r.region.attached, o.region.id)
    ).region;

    return new Unit(region, o.type, titleCase(o.team));
  });
  return units;
}
