import { mkdir, writeFile } from 'node:fs/promises';
const query = `[out:json][timeout:40];(
nwr["name"]["amenity"~"hospital|university|college|theatre|cinema|bus_station|library"](10.90,76.87,11.17,77.13);
nwr["name"]["leisure"="park"](10.90,76.87,11.17,77.13);
nwr["name"]["place"~"suburb|neighbourhood|quarter|city"](10.90,76.87,11.17,77.13);
nwr["name"]["railway"="station"](10.90,76.87,11.17,77.13);
nwr["name"]["natural"="water"](10.90,76.87,11.17,77.13);
nwr["name"]["tourism"~"museum|attraction"](10.90,76.87,11.17,77.13);
);out center tags;`;
const response = await fetch(process.env.OSM_OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter', {
  method: 'POST', body: new URLSearchParams({data:query}),
  headers: {'User-Agent':'CoimbatorePlaceMap/1.0 (OSM gazetteer extraction)'}, signal:AbortSignal.timeout(60000),
});
if (!response.ok) throw new Error(`OSM extraction failed: ${response.status}`);
const data = await response.json();
if (!Array.isArray(data.elements)) throw new Error('No OSM elements returned.');
const seen = new Set();
const places = data.elements.map(item => {
  const coords = item.center ?? item;
  return {id:`${item.type}/${item.id}`, name:item.tags['name:en'] ?? item.tags.name,
    nativeName:item.tags['name:ta'] ?? '', lng:coords.lon, lat:coords.lat,
    category:item.tags.place ?? item.tags.amenity ?? item.tags.leisure ?? item.tags.tourism ?? item.tags.railway ?? 'lake'};
}).filter(place => {
  if (!place.name || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return false;
  const key = place.name.toLowerCase().replace(/\s/g,'');
  if (seen.has(key)) return false;
  seen.add(key); return true;
}).sort((a,b)=>a.name.localeCompare(b.name));
await mkdir('public/data',{recursive:true});
await writeFile('public/data/places.json', JSON.stringify({
  source:'OpenStreetMap contributors', license:'ODbL-1.0', licenseUrl:'https://www.openstreetmap.org/copyright',
  extractedAt:new Date().toISOString(), osmTimestamp:data.osm3s?.timestamp_osm_base, places,
}));
console.log(`Saved ${places.length} OSM places for local search.`);

