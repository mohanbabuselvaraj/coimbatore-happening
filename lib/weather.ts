import type {Weather} from './product.ts';
import {publicResponse} from './public-cache.ts';

export const OPEN_METEO_URL='https://api.open-meteo.com/v1/forecast?latitude=11.0168&longitude=76.9558&current=temperature_2m,weather_code,cloud_cover,precipitation&daily=sunrise,sunset&timezone=Asia%2FKolkata&timeformat=unixtime&forecast_days=1';
export function createWeatherLoader(fetcher:typeof fetch=fetch,now=()=>Date.now()){
 const memory=new Map<string,{data:unknown;expires:number}>(),pending=new Map<string,Promise<unknown>>();let limitedUntil=0;
 async function json(url:string){
  const cached=memory.get(url);if(cached&&cached.expires>now())return cached.data;
  if(pending.has(url))return pending.get(url)!;
  const operation=(async()=>{
   const response=await publicResponse(new Request(url),async()=>{
    const r=await fetcher(url,{headers:{'User-Agent':'CoimbatoreCommunityMap/1.0 https://coimbatore.hushedscout64.chatgpt.site/ https://github.com/mohanbabuselvaraj/coimbatore-happening'},signal:AbortSignal.timeout(8000)});
    if(!r.ok){
     if(r.status===429&&url===OPEN_METEO_URL){const retry=r.headers.get('Retry-After'),seconds=retry&&/^\d+$/.test(retry)?Number(retry)*1000:Date.parse(retry??'')-now();limitedUntil=now()+(Number.isFinite(seconds)&&seconds>0?seconds:3600000);}
     throw Error('Weather provider unavailable');
    }
    const data=await r.json(),expiry=Date.parse(r.headers.get('Expires')??'');
    const expires=Number.isFinite(expiry)&&expiry>now()?expiry:now()+300000;
    return Response.json(data,{headers:{Expires:new Date(expires).toUTCString(),'Cache-Control':`public,max-age=${Math.ceil((expires-now())/1000)}`}});
   });
   const data:unknown=await response.json();memory.set(url,{data,expires:Date.parse(response.headers.get('Expires')??'')});return data;
  })();pending.set(url,operation);
  try{return await operation;}finally{pending.delete(url);}
 }
 return async():Promise<Weather>=>{
  if(limitedUntil<=now())try{
   const data=await json(OPEN_METEO_URL) as {current?:{temperature_2m:number;weather_code:number;cloud_cover:number;precipitation:number;time:number};daily?:{sunrise:number[];sunset:number[]}};
   const c=data?.current,d=data?.daily;
   return valid({temperature:c?.temperature_2m,code:c?.weather_code,cloud:c?.cloud_cover,rain:c?.precipitation,sunrise:(d?.sunrise?.[0]??NaN)*1000,sunset:(d?.sunset?.[0]??NaN)*1000,observedAt:(c?.time??NaN)*1000,fetchedAt:now(),source:'open-meteo'},now());
  }catch{/* A separate provider supplies real data when the primary is unavailable. */}
  const day=new Date(now()+19800000).toISOString().slice(0,10);
  const [rawForecast,rawSun]=await Promise.all([
   json('https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=11.0168&lon=76.9558'),
   json(`https://api.met.no/weatherapi/sunrise/3.0/sun?lat=11.0168&lon=76.9558&date=${day}&offset=%2B05%3A30`),
  ]);
  const forecast=rawForecast as {properties?:{timeseries?:{time:string;data:{instant?:{details?:{air_temperature:number;cloud_area_fraction:number}};next_1_hours?:{summary?:{symbol_code:string};details?:{precipitation_amount:number}}}}[]}};
  const sun=rawSun as {properties?:{sunrise?:{time:string};sunset?:{time:string}}};
  const series=forecast?.properties?.timeseries;if(!Array.isArray(series))throw Error('Weather provider data invalid');
  const current=series.filter(row=>Date.parse(row.time)<=now()&&now()-Date.parse(row.time)<5400000).sort((a,b)=>Date.parse(b.time)-Date.parse(a.time))[0];
  const instant=current?.data?.instant?.details,hour=current?.data?.next_1_hours,symbol=hour?.summary?.symbol_code?.replace(/_(day|night|polartwilight)$/,'');
  if(!symbol)throw Error('Weather provider data invalid');
  const condition=metCondition(symbol);
  return valid({temperature:instant?.air_temperature,cloud:instant?.cloud_area_fraction,rain:hour?.details?.precipitation_amount,code:condition.code,label:condition.label,sunrise:Date.parse(sun?.properties?.sunrise?.time??''),sunset:Date.parse(sun?.properties?.sunset?.time??''),observedAt:Date.parse(current.time),fetchedAt:now(),source:'met-norway'},now());
 };
}

function valid(value:Record<string,unknown>,now:number):Weather{
 for(const field of ['temperature','cloud','rain','code','sunrise','sunset','observedAt','fetchedAt'])if(typeof value[field]!=='number'||!Number.isFinite(value[field]))throw Error('Weather provider data invalid');
 const w=value as Weather;
 if(w.cloud<0||w.cloud>100||w.rain<0||w.sunset<=w.sunrise||w.observedAt>now+60000||now-w.observedAt>=7200000)throw Error('Weather provider data invalid');
 return w;
}
function metCondition(symbol:string){
 if(symbol.includes('thunder'))return {code:95,label:'Thunderstorms'};
 if(symbol.includes('sleet'))return {code:66,label:'Sleet'};
 if(symbol.includes('snow'))return {code:symbol.includes('showers')?85:71,label:'Snow'};
 if(symbol.includes('rain'))return {code:symbol.includes('showers')?80:61,label:symbol.includes('heavy')?'Heavy rain':symbol.includes('light')?'Light rain':symbol.includes('showers')?'Showers':'Rain'};
 const clear:Record<string,{code:number;label:string}>={clearsky:{code:0,label:'Clear'},fair:{code:1,label:'Mostly clear'},partlycloudy:{code:2,label:'Partly cloudy'},cloudy:{code:3,label:'Cloudy'},fog:{code:45,label:'Fog'}};
 if(!clear[symbol])throw Error('Weather provider condition invalid');return clear[symbol];
}
export const loadWeather=createWeatherLoader();
