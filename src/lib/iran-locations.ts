import snapshot from "./iran-locations.json";
import { normalizeSearch } from "./persian";

export const iranLocations = [...snapshot].sort((a,b)=>a.name.localeCompare(b.name,"fa"));
export function provinceCities(provinceName:string) {
  const province=iranLocations.find(row=>normalizeSearch(row.name)===normalizeSearch(provinceName));
  return province ? [...province.cities].sort((a,b)=>a.name.localeCompare(b.name,"fa")) : [];
}
