import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWeatherLoader} from '../lib/weather.ts';

const epoch=Date.parse('2026-11-07T12:15:00Z');
const forecast={properties:{timeseries:[{time:'2026-11-07T12:00:00Z',data:{instant:{details:{air_temperature:25.7,cloud_area_fraction:93}},next_1_hours:{summary:{symbol_code:'heavyrain'},details:{precipitation_amount:1.9}}}}]}};
const sun={properties:{sunrise:{time:'2026-11-07T06:15+05:30'},sunset:{time:'2026-11-07T17:56+05:30'}}};
const expires=new Date(epoch+30*60000).toUTCString();

test('a hosted Open-Meteo 429 falls back to real MET data, with IST daylight and provider attribution',async()=>{
 const calls:string[]=[];
 const fetcher=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);calls.push(url);
  if(url.includes('api.open-meteo.com'))return Response.json({error:true,reason:'Daily API request limit exceeded'},{status:429,headers:{'Retry-After':'3600'}});
  assert.match(new Headers(init?.headers).get('User-Agent')??'',/coimbatore\.hushedscout64\.chatgpt\.site/);
  assert.equal(new URL(url).searchParams.get('lat'),'11.0168');assert.equal(new URL(url).searchParams.get('lon'),'76.9558');
  if(url.includes('/sunrise/')){assert.equal(new URL(url).searchParams.get('date'),'2026-11-07');return Response.json(sun,{headers:{Expires:expires}});}
  return Response.json(forecast,{headers:{Expires:expires}});
 }) as typeof fetch;
 const load=createWeatherLoader(fetcher,()=>epoch),result=await load();
 assert.equal(result.temperature,25.7);assert.equal(result.rain,1.9);assert.equal(result.cloud,93);
 assert.equal(result.source,'met-norway');assert.equal(result.sunrise,Date.parse(sun.properties.sunrise.time));assert.equal(result.sunset,Date.parse(sun.properties.sunset.time));
 assert.equal(result.observedAt,Date.parse('2026-11-07T12:00:00Z'));assert.equal(calls.length,3);
 await load();assert.equal(calls.length,3,'Do not hammer a rate-limited provider or refetch MET before its Expires time');
});

const primary={current:{temperature_2m:26,weather_code:3,cloud_cover:90,precipitation:0,time:(epoch-900000)/1000},daily:{sunrise:[Date.parse(sun.properties.sunrise.time)/1000],sunset:[Date.parse(sun.properties.sunset.time)/1000]}};

test('healthy primary data is preserved without contacting a fallback',async()=>{
 let calls=0;const load=createWeatherLoader((async()=>{calls++;return Response.json(primary);}) as typeof fetch,()=>epoch);
 const result=await load();assert.equal(result.source,'open-meteo');assert.equal(result.temperature,26);assert.equal(result.code,3);assert.equal(calls,1);
});

test('MET cache expiry is respected; a 429 retry window survives forecast refresh',async()=>{
 let at=epoch,primaryCalls=0,forecastCalls=0;
 const load=createWeatherLoader((async(input:RequestInfo|URL)=>{const url=String(input);if(url.includes('open-meteo')){primaryCalls++;return new Response('',{status:429,headers:{'Retry-After':'3600'}});}if(url.includes('locationforecast'))forecastCalls++;return Response.json(url.includes('sunrise')?sun:forecast,{headers:{Expires:new Date(at+600000).toUTCString()}});}) as typeof fetch,()=>at);
 await load();at+=300000;await load();assert.equal(forecastCalls,1);at+=300001;await load();assert.equal(forecastCalls,2);assert.equal(primaryCalls,1);
});

test('the fallback uses the Kolkata date after local midnight rather than the UTC date',async()=>{
 const midnight=Date.parse('2026-11-07T18:45:00Z');let date='';
 const f={properties:{timeseries:[{...forecast.properties.timeseries[0],time:'2026-11-07T18:00:00Z'}]}};
 const s={properties:{sunrise:{time:'2026-11-08T06:15+05:30'},sunset:{time:'2026-11-08T17:56+05:30'}}};
 const load=createWeatherLoader((async(input:RequestInfo|URL)=>{const url=String(input);if(url.includes('open-meteo'))return new Response('',{status:429});if(url.includes('sunrise'))date=new URL(url).searchParams.get('date')!;return Response.json(url.includes('sunrise')?s:f);}) as typeof fetch,()=>midnight);
 const result=await load();assert.equal(date,'2026-11-08');assert.equal(result.sunrise,Date.parse(s.properties.sunrise.time));
});

test('concurrent cold loads share provider requests',async()=>{
 let calls=0;const load=createWeatherLoader((async(input:RequestInfo|URL)=>{calls++;const url=String(input);if(url.includes('open-meteo'))return new Response('',{status:429});return Response.json(url.includes('sunrise')?sun:forecast);}) as typeof fetch,()=>epoch);
 await Promise.all([load(),load(),load()]);assert.equal(calls,3);
});

test('invalid primary data falls back, but missing, stale, future or incomplete fallback data is never invented',async()=>{
 for(const broken of [{},{properties:{timeseries:[{...forecast.properties.timeseries[0],time:'2026-11-07T09:00:00Z'}]}},{properties:{timeseries:[{...forecast.properties.timeseries[0],time:'2026-11-07T15:00:00Z'}]}},{properties:{timeseries:[{time:'2026-11-07T12:00:00Z',data:{instant:{details:{air_temperature:null,cloud_area_fraction:93}}}}]}}]){
  const load=createWeatherLoader((async(input:RequestInfo|URL)=>Response.json(String(input).includes('sunrise')?sun:broken)) as typeof fetch,()=>epoch);
  await assert.rejects(load(),/Weather provider/);
 }
 const load=createWeatherLoader((async(input:RequestInfo|URL)=>Response.json(String(input).includes('open-meteo')?{}:String(input).includes('sunrise')?sun:forecast)) as typeof fetch,()=>epoch);
 assert.equal((await load()).source,'met-norway');
});

test('complete provider outages still reject without fabricated readings',async()=>{
 const load=createWeatherLoader((async()=>{throw new TypeError('Network unavailable');}) as typeof fetch,()=>epoch);await assert.rejects(load(),/Network unavailable/);
});
