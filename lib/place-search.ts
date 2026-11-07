import type { Place } from './product.ts';

export const PLACE_SHORTCUTS = [
  { name: 'Racecourse', label: 'Racecourse' },
  { name: 'Town Hall', label: 'Town Hall' },
  { name: 'Valaan Kulam', label: 'Valankulam' },
] as const;

const aliases: Record<string, string[]> = {
  'Valaan Kulam': ['Valankulam', 'Valan Kulam', 'Valankulam Lake', 'வாளங்குளம்'],
  Racecourse: ['Race Course'],
};
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('en-IN').replace(/[\s\p{P}]+/gu, ' ').trim();

export function searchPlaces(places: Place[], query: string) {
  const term = normalize(query);
  if (!term) return [];
  return places.map(place => {
    const names = [place.name, place.nativeName ?? '', ...(aliases[place.name] ?? [])].map(normalize);
    const score = Math.max(...names.map(name => name === term ? 3 : name.startsWith(term) ? 2 : name.includes(term) ? 1 : 0));
    return { place, score };
  }).filter(result => result.score > 0).sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name)).slice(0, 7).map(result => result.place);
}

export function placeCategory(place: Place) {
  if (!place.category) return 'Selected place';
  if (place.category === 'suburb') return 'Neighbourhood';
  return place.category.replace(/_/g, ' ');
}
