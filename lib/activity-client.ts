import type { Place } from './product';
let visited=false;
const recentlyViewed=new Map<string,number>();
export function trackActivity(place?:Place){
 if(typeof window==='undefined'||navigator.doNotTrack==='1'||(navigator as Navigator&{globalPrivacyControl?:boolean}).globalPrivacyControl)return;
 if(import.meta.env.DEV&&new URLSearchParams(location.search).has('data'))return;
 const now=Date.now(),key=place?.id??(place?`${place.lng.toFixed(3)}:${place.lat.toFixed(3)}`:'@map');
 if(place){if(now-(recentlyViewed.get(key)??0)<30000)return;recentlyViewed.set(key,now);}else{if(visited)return;visited=true;}
 // No analytics cookies or visitor IDs. Existing platform access still applies.
 const body=place?{type:'place',...place.id?{placeId:place.id}:{lng:place.lng,lat:place.lat}}:{type:'visit'};
 void fetch('/api/activity',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:true}).catch(()=>{});
}
