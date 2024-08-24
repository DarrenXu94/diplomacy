const ORDER_TYPES = ["move", "hold", "support", "convoy"];

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

function splitBeforeOrderType(inputString: string) {
  // Loop through each order type and check if it exists in the input string
  for (let orderType of ORDER_TYPES) {
    // Find the position of the order type in the string
    let index = inputString.indexOf(orderType.toUpperCase());

    // If the order type is found, return the substring before it
    if (index !== -1) {
      return inputString.substring(0, index).trim();
    }
  }

  // If no order type is found, return the original string
  return inputString;
}

export function convertDataToUnits(data: Record<string, string[]>) {
  let units = [] as any[];

  // Loop through each line of the data

  const teams = Object.keys(data);

  for (let team of teams) {
    // Loop through each line of the team
    for (let line of data[team]) {
      const region = splitBeforeOrderType(line);

      console.log(region);

      // console.log(allRegions);

      const findRegion = allRegions.find(
        (r) => r.region.name === region || hasSameId(r.region.attached, region)
      );

      if (!findRegion) continue;

      // const findRegion = allRegions.find(
      //   (r) => r.region.name === region || hasSameId(r.region.attached, region)
      // )?.region;

      // console.log(findRegion)

      const unitWithLocation = {
        team: titleCase(team),
        region: findRegion.region,
        type: 1,
      };

      units.push(unitWithLocation);
    }
  }

  console.log(units);

  return units;
}
