import indexedPlaces from '../public/data/places.json';
import { PLACE_SHORTCUTS } from '../lib/place-search.ts';
import { istDay, postQuery } from '../lib/post-query.ts';
import { postLocationKey } from '../lib/post-locations.ts';
import { validatePost } from '../lib/content.ts';
import { isArchived, type Place, type Post, type Weather } from '../lib/product.ts';
import { isUiCase, type UiCase } from './ui-lab-contract.ts';

// UI_LAB_FIXTURE_ONLY: this module is reachable only inside an import.meta.env.DEV branch.
// These values are returned by the development API; none are inserted into D1.
const epoch = Math.floor(Date.now()/60000)*60000;
const day = 86400000;
const longName = 'Government Medical College And Employees State Insurance Corporation Hospital Canteen — East Entrance';
const actualIndexedName = 'Ortho One Orthopaedic Speciality Center(A Unit Of Spine Arthroscopic and Joint Replacement Center Pvt Ltd)';
const paragraph = 'Volunteers will meet by the community garden entrance before sunset. Bring drinking water, a reusable bag and comfortable shoes. Keep the footpath clear for neighbours and leave the planted beds undisturbed. If it rains, wait under the covered walkway. Everyone is welcome to read, walk or help collect litter. Please take your belongings home and return borrowed tools to the caretaker before leaving. ';
const maximumBody = (paragraph+paragraph).slice(0,420);
function post(index:number, values:Partial<Post>={}):Post {
  return {id:`bbbbbbbb-0000-4000-8000-${index.toString(16).padStart(12,'0')}`,kind:'note',body:'A quiet place for an evening walk.',place:'Race Course',lng:76.9678+(index%4)*.0003,lat:11.0183+(index%3)*.0003,createdAt:epoch-index*1000,startsAt:null,endsAt:null,votes:0,...values};
}
const demo:Post[]=[
  post(1,{place:'Race Course',body:'The shaded path is open for an evening walk.',votes:3}),
  post(2,{kind:'event',place:'Gass Forest Museum',body:'A small sketching circle. Bring a notebook.',startsAt:epoch+2*3600000,endsAt:epoch+3*3600000,votes:1}),
  post(3,{place:'Valankulam',body:'Please leave the lake edge clear for people walking past.',votes:0}),
  post(4,{place:'Town Hall',body:'The community mural is beside the entrance.',createdAt:epoch-9*day}),
  post(5,{kind:'event',place:'VOC Park',body:'A neighbourhood reading circle.',createdAt:epoch-5*day,startsAt:epoch-4*day,endsAt:epoch-4*day+3600000}),
];
const midnight=Math.ceil((epoch+19800000)/day)*day-19800000;
let yearEnd=Date.UTC(new Date(epoch).getUTCFullYear(),11,31,18,0);
if(yearEnd<epoch||yearEnd>epoch+89*day)yearEnd=midnight-1800000;
const worst:Post[]=[
  post(101,{place:longName.slice(0,100),body:maximumBody,votes:1284}),
  post(102,{place:'கோயம்புத்தூர் மாநகராட்சி சமுதாய நலக்கூடம் — தெற்கு நுழைவாயில்',body:'மாலை நேரத்தில் நூல் வாசிப்பும் அமைதியான நடைப்பயிற்சியும் நடைபெறும்.\nநடைபாதையைச் சுத்தமாக வைத்திருக்க உதவுங்கள்.',votes:1}),
  post(103,{place:'Q',body:'Tea',votes:0}),
  post(104,{place:'👩🏽‍💻 Community reading circle',body:'Bring a reusable bottle. 🌳📚\nThe shaded entrance is beside the garden.',votes:1000000}),
  post(105,{place:'Benachrichtigungseinstellungen',body:'InterdisciplinaryEnvironmentalRestorationVolunteerOrientation\nA community workshop with a long printed title.',votes:1}),
  post(106,{place:'نور الهدى — مدخل الحديقة',body:'أهلاً بالجميع في لقاء القراءة.\nيرجى ترك الممر مفتوحاً للمشاة.',votes:10}),
  post(107,{place:'Community workshop',body:'Literal text: <b>bring a hat</b> &amp; **a notebook**.\nNo markup should execute here.',votes:0}),
  post(108,{kind:'event',place:'R.S. Puram community hall',body:'An evening gathering that continues past midnight.',startsAt:yearEnd,endsAt:yearEnd+5400000,votes:1}),
  post(109,{kind:'event',place:'Garden reading circle',body:'An ongoing outdoor reading circle.',startsAt:epoch-600000,endsAt:epoch+3600000,votes:1284}),
  post(110,{place:'Old community notice',body:'This useful note has stayed in the archive.',createdAt:epoch-3*365*day,votes:9}),
  post(111,{kind:'event',place:'Past event kept by readers',body:'This event has ended, even though its post is popular.',createdAt:epoch-9*day,startsAt:epoch-8*day,endsAt:epoch-8*day+3600000,votes:1284}),
];
export function fixturePosts(mode:UiCase):Post[] {
  if(mode==='empty')return [];
  if(mode==='one')return [post(201,{place:'Q',body:'Tea',votes:1})];
  if(['page','page-plus','huge'].includes(mode)) {
    const count=mode==='page'?100:mode==='page-plus'?101:1000;
    return Array.from({length:count},(_,index)=>post(1000+index,{place:['Race Course','Valankulam','R.S. Puram reading room'][index%3],body:paragraph.slice(0,140),votes:index%12}));
  }
  return mode==='worst'?worst:demo;
}
export function fixturePlaces(mode:UiCase):Place[] {
  return [...indexedPlaces.places.filter(place=>PLACE_SHORTCUTS.some(shortcut=>shortcut.name===place.name)),...fixturePosts(mode).map(p=>({id:p.id,name:p.place,lng:p.lng,lat:p.lat})),
    {id:'indexed-long-name',name:actualIndexedName,lng:76.99,lat:11.01,category:'hospital'},
    {id:'tall-category',name:'Community centre',lng:76.97,lat:11.02,category:'community_environmental_restoration_volunteer_orientation'},
    {id:'no-category',name:'Jo',lng:76.96,lat:11.02},
  ];
}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function uiFixtureResponse(request:Request,url:URL):Promise<Response|undefined> {
  const mode=request.headers.get('X-UI-Fixture');
  if(!isUiCase(mode))return;
  if(request.method==='POST'&&url.pathname==='/api/posts/revalidate'){const data=await request.json() as {ids:string[]};return json({posts:fixturePosts(mode).filter(post=>data.ids.includes(post.id))});}
  if(request.method==='POST') {
    if(url.pathname==='/api/posts') {
      const checked=validatePost(await request.json());
      return checked.error?json({error:checked.error},400):json({error:'UI test only. Nothing was published.'},409);
    }
    const match=url.pathname.match(/^\/api\/posts\/([a-f0-9-]+)\/vote$/);
    if(match){const p=fixturePosts(mode).find(p=>p.id===match[1]);return json({votes:(p?.votes??0)+1});}
    return json({error:'UI test only. No database writes are allowed.'},409);
  }
  if(url.pathname==='/api/dev-ui/places')return json({places:fixturePlaces(mode)});
  if(mode==='map-error'&&url.pathname==='/api/map')return json({error:'The map could not load. Retry in a moment.'},502);
  if(url.pathname==='/api/weather') {
    if(mode==='error'||mode==='map-error')return json({error:'Weather is unavailable.'},503);
    const stale=mode==='stale';
    const weather:Weather&{stale?:boolean}={temperature:mode==='worst'?47:28,code:mode==='worst'?95:3,cloud:85,rain:0,sunrise:epoch-8*3600000,sunset:epoch+3*3600000,observedAt:epoch-(stale?3*3600000:60000),fetchedAt:epoch,...stale?{stale:true}:{}};
    return json(weather);
  }
  if(url.pathname!=='/api/posts')return;
  if(mode==='error')return json({error:'This service is temporarily unavailable. Try again shortly.'},503);
  const archive=url.searchParams.get('archive')==='1';
  if(mode==='loading'||(mode==='slow-current'&&!archive))await new Promise(resolve=>setTimeout(resolve,mode==='loading'?15000:1800));
  let query:ReturnType<typeof postQuery>;try{query=postQuery(url.searchParams,epoch);}catch(error){return json({error:(error as Error).message},400);}
  const kind=url.searchParams.get('kind')??'all',when=url.searchParams.get('when')??'any',start=istDay(query.at);
  let posts=fixturePosts(mode).filter(p=>isArchived(p,query.at)===archive).filter(p=>when==='any'?(kind==='all'||p.kind===kind):p.kind==='event'&&p.startsAt!==null&&p.endsAt!==null&&(when==='now'?p.startsAt<=query.at&&p.endsAt>query.at:p.startsAt<start+day&&p.endsAt>start)).filter(p=>!url.searchParams.has('lng')||postLocationKey(p)===postLocationKey({lng:Number(url.searchParams.get('lng')),lat:Number(url.searchParams.get('lat'))})).sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id));
  const cursor=url.searchParams.get('cursor');
  if(cursor){const [time,id]=cursor.split(':');posts=posts.filter(p=>p.createdAt<Number(time)||(p.createdAt===Number(time)&&p.id<id));}
  const page=posts.slice(0,100),last=page.at(-1),hasMore=posts.length>100;
  return json({posts:page,hasMore,asOf:query.at,nextCursor:hasMore&&last?`${last.createdAt}:${last.id}`:null,policy:{noteDays:7,keepVotes:10}});
}
