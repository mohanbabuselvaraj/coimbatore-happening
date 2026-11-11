import { env } from 'cloudflare:workers';
import { validatePost } from './content';
import { isArchived, type Post, type Weather, KEEP_VOTES, NOTE_ARCHIVE_DAYS } from './product';
import { publicResponse } from './public-cache';
import { postQuery } from './post-query';

import { ApiError, json, payload } from './http';
import { recordActivity } from './activity';
import { adminRoutes } from './admin-api';
import { loadWeather } from './weather';
const publicSelect = `SELECT p.id, p.kind, p.body, p.place, p.lng, p.lat,
  p.created_at AS createdAt, p.starts_at AS startsAt, p.ends_at AS endsAt,
  (SELECT COUNT(*) FROM votes v WHERE v.post_id=p.id) AS votes FROM posts p`;
const digest = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');

async function budget(request: Request, action: string, max: number) {
  if (!env.DB || !env.RATE_LIMIT_SECRET) throw new ApiError('Posting is temporarily unavailable. Try again shortly.',503);
  const now=Date.now(), hour=Math.floor(now/3600000);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.RATE_LIMIT_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const ip=request.headers.get('cf-connecting-ip') ?? 'local-preview';
  const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${action}:${hour}:${ip}`));
  const bucket=[...new Uint8Array(signature)].map(x=>x.toString(16).padStart(2,'0')).join('');
  // Only a keyed, hourly, action-specific digest is stored; never the raw IP.
  const row=await env.DB.prepare(`INSERT INTO budgets (key,count,expires_at) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`).bind(bucket,(hour+1)*3600000).first<{count:number}>();
  await env.DB.prepare('DELETE FROM budgets WHERE expires_at < ?').bind(now).run();
  if(!row || row.count>max) throw new ApiError('A few too many requests. Try again in an hour.',429);
}

function token(value: unknown) {
  if(typeof value!=='string'||! /^[a-zA-Z0-9_-]{32,100}$/.test(value)) throw new ApiError('Reload the page and try again.');
  return value;
}

async function postRoutes(request:Request,url:URL) {
  if(!env.DB) throw new ApiError('Posts are temporarily unavailable. Try again shortly.',503);
  const db=env.DB, path=url.pathname;
  if(request.method==='GET' && path==='/api/posts') {
    let query:ReturnType<typeof postQuery>;
    try { query=postQuery(url.searchParams); } catch(error) { throw new ApiError((error as Error).message); }
    const rows=await db.prepare(`${publicSelect} WHERE ${query.where} ORDER BY p.created_at DESC, p.id DESC LIMIT 101`).bind(...query.values).all<Post>();
    const page=rows.results.slice(0,100),hasMore=rows.results.length>100,last=page.at(-1);
    return json({posts:page,hasMore,asOf:query.at,nextCursor:hasMore&&last?`${last.createdAt}:${last.id}`:null,policy:{noteDays:NOTE_ARCHIVE_DAYS,keepVotes:KEEP_VOTES}});
  }
  if(request.method==='POST' && path==='/api/posts/revalidate') {
    const data=await payload(request);
    if(!Array.isArray(data.ids)||data.ids.length>100||data.ids.some(id=>typeof id!=='string'||! /^[a-f0-9-]{36}$/.test(id)))throw new ApiError('Refresh the posts to continue.');
    const ids=[...new Set(data.ids as string[])];if(!ids.length)return json({posts:[]});
    const result=await db.prepare(`${publicSelect} WHERE p.hidden_at IS NULL AND p.id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all<Post>();
    return json({posts:result.results});
  }
  if(request.method==='POST' && path==='/api/posts') {
    const data=await payload(request);
    const checked=validatePost(data);
    if(checked.error) throw new ApiError(checked.error);
    if(data.website) throw new ApiError('The post could not be published.');
    const deleteHash=await digest(token(data.deleteToken));
    await budget(request,'post',8);
    const p=checked.value!,id=crypto.randomUUID(),createdAt=Date.now();
    await db.prepare(`INSERT INTO posts (id,kind,body,place,lng,lat,created_at,starts_at,ends_at,delete_hash) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,p.kind,p.body,p.place,p.lng,p.lat,createdAt,p.startsAt,p.endsAt,deleteHash).run();
    return json({post:{id,...p,createdAt,votes:0}},201);
  }
  const match=path.match(/^\/api\/posts\/([a-f0-9-]{36})\/(vote|report|delete)$/);
  if(request.method==='POST' && match) {
    const [,id,action]=match, data=await payload(request);
    if(!await db.prepare(`SELECT id FROM posts WHERE id=?${action==='delete'?'':' AND hidden_at IS NULL'}`).bind(id).first()) throw new ApiError('This post is no longer available.',404);
    if(action==='delete') {
      await budget(request,'delete',20);
      const hash=await digest(token(data.token));
      const deleted=await db.prepare('DELETE FROM posts WHERE id=? AND delete_hash=?').bind(id,hash).run();
      if(!deleted.meta.changes) throw new ApiError('Only the device that posted this can remove it.',403);
      return json({ok:true});
    }
    const hash=await digest(token(data.token));
    await budget(request,action,action==='vote'?80:15);
    if(action==='vote') {
      await db.prepare('INSERT INTO votes (post_id,token_hash) VALUES (?,?) ON CONFLICT DO NOTHING').bind(id,hash).run();
      const post=await db.prepare(`${publicSelect} WHERE p.id=?`).bind(id).first<Post>();
      return json({votes:post?.votes??0,archived:post?isArchived(post):false});
    }
    const reasons=['contact','unsafe','spam'];
    if(typeof data.reason!=='string'||!reasons.includes(data.reason)) throw new ApiError('Choose a report reason.');
    await db.prepare('INSERT INTO reports (post_id,token_hash,reason,created_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING').bind(id,hash,data.reason,Date.now()).run();
    return json({ok:true});
  }
  throw new ApiError('This action is not available.',404);
}

const providerHeaders={'User-Agent':'CoimbatorePlaceMap/1.0 (+https://coimbatore-place-map.hushedscout64.chatgpt.site)'};
function proxyUrl(value:string) {
  return '/api/map/'+value.slice('https://tiles.openfreemap.org/'.length);
}
function rewrite(value:unknown):unknown {
  if(typeof value==='string' && value.startsWith('https://tiles.openfreemap.org/')) return proxyUrl(value);
  if(Array.isArray(value)) return value.map(rewrite);
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v)]));
  return value;
}
async function mapRoute(request:Request,url:URL) {
  let source:URL;
  try { source=new URL(url.pathname.startsWith('/api/map/')?url.pathname.slice('/api/map/'.length):'styles/liberty','https://tiles.openfreemap.org/'); }
  catch {throw new ApiError('Map resource not found.',404);}
  if(source.protocol!=='https:'||source.hostname!=='tiles.openfreemap.org'||source.port||source.username||source.password||source.search||source.hash)
    throw new ApiError('Map resource not found.',404);
  if(!/^\/(styles|planet|fonts|sprites|[0-9a-f]{8,})[\w\-./%{},@ ]*$/i.test(source.pathname)) throw new ApiError('Map resource not found.',404);
  return publicResponse(new Request(url.toString()),async()=>{
    const response=await fetch(source,{headers:providerHeaders,signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new ApiError('The map could not load. Retry in a moment.',502);
    const type=response.headers.get('content-type')??'application/octet-stream';
    return type.includes('json') ? Response.json(rewrite(await response.json()),{headers:{'Cache-Control':'public,max-age=86400'}})
      : new Response(response.body,{headers:{'Content-Type':type,'Cache-Control':'public,max-age=86400'}});
  });
}

let weatherMemory:{value:Weather;time:number}|undefined;
async function weatherRoute(request:Request) {
  return publicResponse(new Request(request.url),async()=>{
  if(weatherMemory && Date.now()-weatherMemory.time<300000) return Response.json(weatherMemory.value,{headers:{'Cache-Control':'public,max-age=300'}});
  try {
    const value=await loadWeather();
    weatherMemory={value,time:Date.now()};
    return Response.json(value,{headers:{'Cache-Control':'public,max-age=300'}});
  }catch{
    if(weatherMemory && Date.now()-weatherMemory.value.observedAt<7200000)return Response.json({...weatherMemory.value,stale:true},{headers:{'Cache-Control':'no-store'}});
    throw new ApiError('Weather is unavailable.',503);
  }
  });
}

export async function api(request:Request) {
  try {
    const url=new URL(request.url);
    if(import.meta.env.DEV) {
      if(request.method==='GET'&&url.pathname==='/api/dev-ui/harness') {
        const {uiLabHtml}=await import('../dev/ui-lab-harness');
        return new Response(uiLabHtml(url),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
      }
      if(request.headers.has('X-UI-Fixture')) {
        const {uiFixtureResponse}=await import('../dev/ui-lab-fixtures');
        const fixture=await uiFixtureResponse(request,url);if(fixture)return fixture;
      }
    }
    if(request.method==='POST') {
      const origin=request.headers.get('origin');
      if(request.headers.get('sec-fetch-site')==='cross-site'||(origin && origin!==url.origin)) throw new ApiError('Use the app to publish or vote.',403);
    }
    if(request.method==='GET' && (url.pathname==='/api/map'||url.pathname.startsWith('/api/map/')))return await mapRoute(request,url);
    if(request.method==='GET' && url.pathname==='/api/weather')return await weatherRoute(request);
    if(url.pathname==='/api/activity')return await recordActivity(request,env.DB,()=>budget(request,'activity',240));
    if(url.pathname.startsWith('/api/admin'))return await adminRoutes(request,url,env.DB,env.ADMIN_OWNER_EMAIL);
    if(url.pathname.startsWith('/api/posts'))return await postRoutes(request,url);
    throw new ApiError('Not found.',404);
  }catch(error){
    if(error instanceof ApiError)return json({error:error.message},error.status);
    if(import.meta.env.DEV) console.error('API diagnostic',error instanceof Error?error.message:'Unknown error');
    // Do not log post contents, request headers, visitor addresses, or secrets.
    return json({error:'This service is temporarily unavailable. Try again shortly.'},503);
  }
}
