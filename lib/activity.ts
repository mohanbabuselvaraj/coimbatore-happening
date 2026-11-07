import { ApiError, json, payload } from './http.ts';
import { inCity } from './product.ts';
import indexed from '../public/data/places.json' with {type:'json'};
export const activityDay=(at:number)=>new Date(at+19800000).toISOString().slice(0,10);
const places=new Map(indexed.places.map(place=>[place.id,place]));
export function activityLocation(raw:Record<string,unknown>){
 if(raw.type==='visit')return {key:'@map',place:'Map',lng:null,lat:null};
 if(raw.type!=='place')throw new ApiError('Choose an activity type.');
 if(typeof raw.placeId==='string'){
  const place=places.get(raw.placeId);if(!place)throw new ApiError('Choose a known place.');
  return {key:place.id,place:place.name,lng:place.lng,lat:place.lat};
 }
 if(typeof raw.lng!=='number'||typeof raw.lat!=='number'||!inCity(raw.lng,raw.lat))throw new ApiError('Choose a place in Coimbatore.');
 // Unnamed selections are grouped into roughly 100m cells, never device locations.
 const lng=Number(raw.lng.toFixed(3)),lat=Number(raw.lat.toFixed(3));
 return {key:`pin:${lng.toFixed(3)}:${lat.toFixed(3)}`,place:'Map pin',lng,lat};
}
export async function recordActivity(request:Request,db:D1Database|undefined,limit:()=>Promise<void>){
 const url=new URL(request.url);
 if(request.method!=='POST')throw new ApiError('Not found.',404);
 if(request.headers.get('origin')!==url.origin)throw new ApiError('Use the map to record activity.',403);
 if(request.headers.get('sec-gpc')==='1'||request.headers.get('dnt')==='1')return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
 if(!db)throw new ApiError('Activity is unavailable.',503);
 const location=activityLocation(await payload(request)),now=Date.now(),day=activityDay(now);
 await limit();
 await db.batch([
  db.prepare("INSERT INTO activity_meta(key,value) VALUES('started',?) ON CONFLICT DO NOTHING").bind(now),
  db.prepare('INSERT INTO activity_daily(day,location_key,place,lng,lat,views) VALUES(?,?,?,?,?,1) ON CONFLICT(day,location_key) DO UPDATE SET views=views+1').bind(day,location.key,location.place,location.lng,location.lat),
  db.prepare('DELETE FROM activity_daily WHERE day<?').bind(activityDay(now-89*86400000)),
 ]);
 return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
}
export async function activityOverview(url:URL,db:D1Database){
 const window=url.searchParams.get('days')??'7';if(!['7','30','90'].includes(window))throw new ApiError('Choose 7, 30 or 90 days.');
 const days=Number(window),now=Date.now(),from=activityDay(now-(days-1)*86400000),today=activityDay(now);
 const meta=await db.prepare("SELECT value FROM activity_meta WHERE key='started'").first<{value:number}>();
 const daily=await db.prepare("SELECT day,SUM(CASE WHEN location_key='@map' THEN views ELSE 0 END) AS visits,SUM(CASE WHEN location_key<>'@map' THEN views ELSE 0 END) AS placeViews FROM activity_daily WHERE day>=? AND day<=? GROUP BY day ORDER BY day").bind(from,today).all<{day:string;visits:number;placeViews:number}>();
 const total=await db.prepare("SELECT COALESCE(SUM(CASE WHEN location_key='@map' THEN views ELSE 0 END),0) AS visits,COALESCE(SUM(CASE WHEN location_key<>'@map' THEN views ELSE 0 END),0) AS placeViews,COUNT(DISTINCT CASE WHEN location_key<>'@map' THEN location_key END) AS places FROM activity_daily WHERE day>=? AND day<=?").bind(from,today).first<{visits:number;placeViews:number;places:number}>();
 const q=(url.searchParams.get('q')??'').trim();if(q.length>100)throw new ApiError('Use a shorter place search.');
 const escaped='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
 const offsetValue=url.searchParams.get('offset')??'0';if(!/^\d{1,6}$/.test(offsetValue)||Number(offsetValue)>100000)throw new ApiError('Refresh the place list.');const offset=Number(offsetValue);
 const ranked=await db.prepare("SELECT location_key AS key,place,lng,lat,SUM(views) AS views,MAX(day) AS lastDay FROM activity_daily WHERE location_key<>'@map' AND day>=? AND day<=? AND place LIKE ? ESCAPE '\\' GROUP BY location_key ORDER BY views DESC,location_key ASC LIMIT 21 OFFSET ?").bind(from,today,escaped,offset).all<{key:string;place:string;lng:number;lat:number;views:number;lastDay:string}>();
 const count=await db.prepare("SELECT COUNT(DISTINCT location_key) AS total FROM activity_daily WHERE location_key<>'@map' AND day>=? AND day<=? AND place LIKE ? ESCAPE '\\'").bind(from,today,escaped).first<{total:number}>();
 const moderation=await db.prepare("SELECT COUNT(*) AS entries,COALESCE(SUM(CASE WHEN kind='note' THEN 1 ELSE 0 END),0) AS notes,COALESCE(SUM(CASE WHEN kind='event' THEN 1 ELSE 0 END),0) AS events,COALESCE(SUM(CASE WHEN hidden_at IS NOT NULL THEN 1 ELSE 0 END),0) AS hidden,(SELECT COUNT(*) FROM reports WHERE resolution_id IS NULL) AS openReports FROM posts").first();
 const points=Array.from({length:days},(_,i)=>{const day=activityDay(now-(days-1-i)*86400000),row=daily.results.find(row=>row.day===day),measured=meta!==null&&day>=activityDay(meta.value);return {day,visits:measured?row?.visits??0:null,placeViews:measured?row?.placeViews??0:null};});
 return json({days,from,to:today,startedAt:meta?.value??null,totals:total??{visits:0,placeViews:0,places:0},daily:points,places:ranked.results.slice(0,20),placeTotal:count?.total??0,nextOffset:ranked.results.length>20?offset+20:null,moderation,updatedAt:now});
}
