'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BrowserRouter, useSearchParams } from 'react-router';
import { ArrowUp, Archive, CalendarDays, Check, ChevronDown, Cloud, CloudRain, Compass, Flag, Info, Layers2, LocateFixed, MapPin, Minus, Moon, Plus, Search, SlidersHorizontal, StickyNote, Sun, Trash2, X, LoaderCircle, ArrowUpRight } from 'lucide-react';
import CityMap, { type MapHandle, type MapLoadState } from '../components/CityMap';
import Rain from '../components/Rain';
import MapViewTabs from '../components/MapViewTabs';
import { contentError } from '../lib/content';
import { trackActivity } from '../lib/activity-client';
import { request } from '../lib/client-request';
import { searchPlaces } from '../lib/place-search';
import { eventInWindow, type EventWindow, type PostKindFilter } from '../lib/post-query';
import DiscoveryDock from '../components/DiscoveryDock';
import PlacePreview from '../components/PlacePreview';
import PostFilters from '../components/PostFilters';
import { usePostFeed } from '../components/usePostFeed';
import { eventLabel, formatCount, voteCountLabel } from '../lib/presentation';
import type { PostLocation } from '../lib/post-locations';
import { isArchived, KEEP_VOTES, MAX_BODY, MAX_PLACE_LENGTH, NOTE_ARCHIVE_DAYS, weatherName, type Place, type Post, type Weather } from '../lib/product';

const localDate=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
const clock=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false});
const memoryTokens=new Map<string,string>();
function deviceToken(key:string){
  try{const stored=localStorage.getItem(key);if(stored)return stored;}catch{}
  let value=memoryTokens.get(key);if(!value){value=crypto.randomUUID().replace(/-/g,'');memoryTokens.set(key,value);try{localStorage.setItem(key,value);}catch{}}
  return value;
}
function readOwn(id:string){try{return localStorage.getItem('own:'+id);}catch{return memoryTokens.get('own:'+id);}}
export default function Home(){
  const [mounted,setMounted]=useState(false);
  useEffect(()=>setMounted(true),[]);
  // Browser history is available after hydration; Worker API routing stays server-side.
  if(!mounted)return <main className="city-app" aria-busy="true"><div className="map-loading" role="status"><LoaderCircle size={18} className="spin"/><span>Loading Coimbatore</span></div></main>;
  return <BrowserRouter><CityMapApplication/></BrowserRouter>;
}

function CityMapApplication(){
  const [searchParams,setSearchParams]=useSearchParams();
  const fixture=import.meta.env.DEV?searchParams.get('data'):null;
  const archive=searchParams.get('view')==='archive';
  const filterValue=searchParams.get('kind'),whenValue=searchParams.get('when');
  const when:EventWindow=whenValue==='now'||whenValue==='today'?whenValue:'any';
  const filter:PostKindFilter=when!=='any'?'event':filterValue==='note'||filterValue==='event'?filterValue:'all';
  const changeFilters=(kind:PostKindFilter,window:EventWindow)=>setSearchParams(previous=>{
    const next=new URLSearchParams(previous);
    if(kind==='all')next.delete('kind');else next.set('kind',kind);
    if(window==='any')next.delete('when');else next.set('when',window);
    return next;
  });
  const map=useRef<MapHandle>(null);
  const panel=useRef<HTMLElement>(null),postList=useRef<HTMLDivElement>(null);

  const [now,setNow]=useState<number|null>(null),[weather,setWeather]=useState<(Weather&{stale?:boolean})|null>(null),[weatherError,setWeatherError]=useState(false);
  const [places,setPlaces]=useState<Place[]>([]),[placeLoadError,setPlaceLoadError]=useState(false),[query,setQuery]=useState(''),[searchOpen,setSearchOpen]=useState(false);
  const [selected,setSelected]=useState<Place|null>(null),[activePost,setActivePost]=useState<Post|null>(null),[panelOpen,setPanelOpen]=useState(archive||filter!=='all'),[composing,setComposing]=useState(false);

  useEffect(()=>{panel.current?.scrollTo({top:0});},[selected?.name,activePost?.id,composing,fixture]);
  useEffect(()=>{postList.current?.scrollTo({top:0});},[archive,filter,when,fixture]);
  const {posts,setPosts,loading,error:postError,nextCursor,moreLoading,refresh:loadPosts,loadMore}=usePostFeed(`archive=${archive?1:0}&kind=${filter}&when=${when}`,fixture);
  const [kind,setKind]=useState<'note'|'event'>('note'),[body,setBody]=useState(''),[placeName,setPlaceName]=useState(''),[startsAt,setStartsAt]=useState(''),[endsAt,setEndsAt]=useState(''),[busy,setBusy]=useState(false),[formError,setFormError]=useState('');
  const [notice,setNotice]=useState(''),[viewOpen,setViewOpen]=useState(false),[infoOpen,setInfoOpen]=useState(false),[scene,setScene]=useState<'auto'|'day'|'night'>('auto'),[flat,setFlat]=useState(false),[mapState,setMapState]=useState<MapLoadState>('loading'),[voted,setVoted]=useState<Set<string>>(new Set()),[actionBusy,setActionBusy]=useState(''),[reportOpen,setReportOpen]=useState(false),[deleteConfirm,setDeleteConfirm]=useState(false);
  const draftKey=JSON.stringify([kind,placeName,body,startsAt,endsAt]);
  const currentDraft=useRef(draftKey);currentDraft.current=draftKey;
  useEffect(()=>{
    if(!import.meta.env.DEV||!fixture)return;
    let disposed=false,cleanup:(()=>void)|undefined;
    import('../dev/ui-lab-client').then(({attachUiLab})=>{if(!disposed)cleanup=attachUiLab(value=>setSearchParams(previous=>{const next=new URLSearchParams(previous);next.set('data',value);return next;}));});
    return()=>{disposed=true;cleanup?.();};
  },[setSearchParams,!!fixture]);
  useEffect(()=>{if(import.meta.env.DEV&&fixture){setSelected(null);setActivePost(null);setBody('');setNotice('');setVoted(new Set());}},[fixture]);
  const time=now??0;
  const localHour=now?Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hourCycle:'h23'}).format(now)):12;
  const freshWeather=weather&&!weather.stale&&now&&now-weather.observedAt<7200000?weather:null;
  const night=scene==='night'||(scene==='auto'&&(freshWeather?(time<freshWeather.sunrise||time>=freshWeather.sunset):(localHour<6||localHour>=18)));
  useEffect(()=>{trackActivity();},[]);
  useEffect(()=>{setNow(Date.now());const id=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(id);},[]);
  useEffect(()=>{let alive=true;const load=()=>request<Weather&{stale?:boolean}>('/api/weather').then(data=>{if(alive){setWeather(data);setWeatherError(false);}}).catch(()=>{if(alive)setWeatherError(true);});load();const id=setInterval(load,300000);return()=>{alive=false;clearInterval(id);};},[fixture]);
  useEffect(()=>{const controller=new AbortController();setPlaceLoadError(false);request<{places:Place[]}>(import.meta.env.DEV&&fixture?'/api/dev-ui/places':'/data/places.json',undefined,controller.signal).then(data=>{if(!controller.signal.aborted)setPlaces(data.places);}).catch(()=>{if(!controller.signal.aborted)setPlaceLoadError(true);});return()=>controller.abort();},[fixture]);
  useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(''),5500);return()=>clearTimeout(id);},[notice]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.key!=='Escape')return;
      if(searchOpen){setSearchOpen(false);return;}
      if(viewOpen||infoOpen||reportOpen||deleteConfirm){setViewOpen(false);setInfoOpen(false);setReportOpen(false);setDeleteConfirm(false);return;}
      if(composing||activePost){setComposing(false);setActivePost(null);setFormError('');requestAnimationFrame(()=>panel.current?.focus());return;}
      if(selected){setSelected(null);setBody('');requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.browse-posts')?.focus());return;}
      if(panelOpen){setPanelOpen(false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.browse-posts')?.focus());}
    };
    document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);
  },[searchOpen,viewOpen,infoOpen,reportOpen,deleteConfirm,composing,activePost,selected,panelOpen]);
  const selectPlace=useCallback((place:Place)=>{trackActivity(place);setSelected(place);setPlaceName(place.name);setActivePost(null);setComposing(false);setBody('');setFormError('');setSearchOpen(false);setReportOpen(false);setDeleteConfirm(false);},[]);
  const selectPost=useCallback((post:Post)=>{trackActivity({name:post.place,lng:post.lng,lat:post.lat});setActivePost(post);setComposing(false);setSelected(previous=>({name:post.place,lng:post.lng,lat:post.lat,...(previous?.lng===post.lng&&previous?.lat===post.lat?{category:previous.category}:{})}));setSearchOpen(false);setReportOpen(false);setDeleteConfirm(false);},[]);
  const selectLocation=useCallback((location:PostLocation)=>selectPlace({name:location.place,lng:location.lng,lat:location.lat}),[selectPlace]);
  const clearSelection=()=>{setSelected(null);setActivePost(null);setComposing(false);setFormError('');setBody('');};
  const startComposer=(value:'note'|'event')=>{if(!selected)return;setKind(value);setComposing(true);setActivePost(null);setPlaceName(selected.name);setBody('');setStartsAt('');setEndsAt('');setFormError('');};
  const results=useMemo(()=>searchPlaces(places,query),[places,query]);
  const visible=useMemo(()=>now===null?posts:posts.filter(post=>isArchived(post,now)===archive&&eventInWindow(post,when,now)),[posts,now,archive,when]);
  useEffect(()=>{
    if(!selected&&!panelOpen)return;
    const frame=requestAnimationFrame(()=>panel.current?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame);
  },[!!selected,panelOpen]);
  const activePostId=activePost?.id;
  useEffect(()=>{
    if(!activePostId)return;
    const controller=new AbortController();
    const refresh=async()=>{
      try{
        const data=await request<{posts:Post[]}>('/api/posts/revalidate',{ids:[activePostId]},controller.signal);
        if(controller.signal.aborted)return;
        const updated=data.posts[0];
        if(!updated){setActivePost(null);setSelected(null);setNotice('This post is no longer available.');return;}
        setActivePost(previous=>previous?.id===updated.id?updated:previous);
        setSelected(previous=>previous&&(previous.name!==updated.place||previous.lng!==updated.lng||previous.lat!==updated.lat)?{name:updated.place,lng:updated.lng,lat:updated.lat}:previous);
      }catch{if(!controller.signal.aborted)setNotice('This post could not be refreshed. Try again shortly.');}
    };
    void refresh();const timer=setInterval(()=>void refresh(),60000);
    return()=>{controller.abort();clearInterval(timer);};
  },[activePostId,posts]);
  const validation=placeName.trim().length>MAX_PLACE_LENGTH?`Choose a place name of up to ${MAX_PLACE_LENGTH} characters.`:body?contentError(`${placeName}\n${body}`):null;
  async function publish(event:FormEvent){
    event.preventDefault();if(!selected||busy)return;setFormError('');if(validation){setFormError(validation);return;}
    setBusy(true);const submittedDraft=draftKey,deleteToken=crypto.randomUUID().replace(/-/g,'');
    try{const data=await request<{post:Post}>('/api/posts',{kind,body,place:placeName,lng:selected.lng,lat:selected.lat,startsAt,endsAt,deleteToken});
      memoryTokens.set('own:'+data.post.id,deleteToken);try{localStorage.setItem('own:'+data.post.id,deleteToken);}catch{}
      setComposing(false);setActivePost(data.post);setSelected({name:data.post.place,lng:data.post.lng,lat:data.post.lat});setBody('');setNotice('Posted. No name attached.');if(archive||filter!=='all'||when!=='any')setSearchParams(previous=>{const next=new URLSearchParams(previous);next.delete('view');next.delete('kind');next.delete('when');return next;});else {setPosts(previous=>[data.post,...previous]);await loadPosts(true);}
    }catch(error){if(currentDraft.current===submittedDraft)setFormError((error as Error).message);}finally{setBusy(false);}
  }
  async function upvote(post:Post){
    if(actionBusy||voted.has(post.id))return;setActionBusy(post.id);
    try{const data=await request<{votes:number}>(`/api/posts/${post.id}/vote`,{token:deviceToken('vote:'+post.id)});setVoted(previous=>new Set(previous).add(post.id));setPosts(previous=>previous.map(p=>p.id===post.id?{...p,votes:data.votes}:p));setActivePost(previous=>previous?.id===post.id?{...previous,votes:data.votes}:previous);if(data.votes>=KEEP_VOTES&&archive)await loadPosts(true);}
    catch(error){setNotice((error as Error).message);}finally{setActionBusy('');}
  }
  async function removePost(post:Post){const own=readOwn(post.id);if(!own)return;setActionBusy(post.id);try{await request(`/api/posts/${post.id}/delete`,{token:own});setPosts(previous=>previous.filter(p=>p.id!==post.id));clearSelection();setDeleteConfirm(false);setNotice('Post removed.');}catch(error){setNotice((error as Error).message);}finally{setActionBusy('');}}
  async function reportPost(post:Post,reason:string){setActionBusy(post.id);try{await request(`/api/posts/${post.id}/report`,{token:deviceToken('report:'+post.id),reason});setNotice('Report saved for review.');setReportOpen(false);}catch(error){setNotice((error as Error).message);}finally{setActionBusy('');}}
  const WeatherIcon=weather&&weather.code>=51?CloudRain:night?Moon:weather&&weather.code>=2?Cloud:Sun;
  return <main className={`city-app ${night?'night':'day'}${mapState==='failed'?' map-failed':''}`}>
    <a className="skip-link" href="#post-panel" onClick={()=>setPanelOpen(true)}>Skip to notes and events</a>
    <CityMap ref={map} places={places} posts={visible} selected={selected} night={night} cloud={freshWeather?.cloud??25} onSelect={selectPlace} onPost={selectPost} onGroup={selectLocation} onError={setNotice} onStateChange={setMapState}/><Rain active={!!freshWeather&&freshWeather.rain>0}/>
    {mapState==='loading'&&<div className="map-loading" role="status"><LoaderCircle size={18} className="spin"/><span>Loading Coimbatore</span></div>}
    {mapState==='failed'&&<div className="map-failure" role="alert"><p>The map could not load.</p><button onClick={()=>map.current?.retry()}>Retry map</button></div>}
    <header className="city-header">
      <button className="city-brand" onClick={()=>{map.current?.reset();clearSelection();setPanelOpen(false);}} aria-label="Return to Coimbatore city view"><span className="brand-icon"><MapPin size={23} strokeWidth={1.7}/></span><h1>Coimbatore<span className="brand-dot"/></h1></button>
      <div className="search-wrap"><form className="place-search" role="search" onSubmit={event=>{event.preventDefault();if(results[0]){selectPlace(results[0]);setQuery('');}}}><Search size={18}/><input aria-label="Find a place in Coimbatore" value={query} placeholder="Find a place" autoComplete="off" maxLength={100} onFocus={()=>setSearchOpen(true)} onChange={event=>{setQuery(event.target.value);setSearchOpen(true);}} aria-controls="place-results" aria-expanded={searchOpen&&!!query}/>{query?<button type="button" className="icon-button small" aria-label="Clear search" onClick={()=>setQuery('')}><X size={16}/></button>:<span className="search-hint">Search</span>}</form>
        {searchOpen&&query&&<div className="search-results" id="place-results" aria-label="Place search results">{results.length?results.map(place=><button key={place.id??place.name} onClick={()=>{selectPlace(place);setQuery('');}}><MapPin size={16}/><span>{place.name}<small>{place.category?.replace(/_/g,' ')}</small></span><ArrowUpRight size={15}/></button>):<p>{placeLoadError?'Place search is unavailable. Choose a point on the map.':'No matching places. Choose a point on the map.'}</p>}<button className="search-close" onClick={()=>setSearchOpen(false)}>Close search</button></div>}
      </div>
      <div className={`city-conditions ${!weather?'weather-quiet':''}`} title={weather?`${weather.source==='met-norway'?'Forecast':'Weather'} for Coimbatore · ${localDate.format(weather.observedAt)} · ${weather.source==='met-norway'?'MET Norway':'Open-Meteo'}`:'Coimbatore local time'}>
        {weather?<><WeatherIcon size={21} strokeWidth={1.6}/><div className="weather-reading"><strong>{Math.round(weather.temperature)}°</strong><span>{weather.label??weatherName(weather.code)}</span><small className="weather-state" aria-live="polite">{weatherError||weather.stale||!freshWeather?'Last ':''}{clock.format(weather.observedAt)} {weather.source==='met-norway'?'forecast':'update'}</small></div><span className="conditions-divider"/></>:<span className="weather-unavailable" role="status">{weatherError?'Weather unavailable':'Weather loading'}</span>}
        <time dateTime={now?new Date(now).toISOString():undefined}>{now?clock.format(now):'--:--'}<small>IST{scene!=='auto'?` · ${scene} preview`:''}</small></time>
      </div>
    </header>
    {!selected&&!panelOpen&&<DiscoveryDock places={places} onSelect={selectPlace} onBrowse={()=>setPanelOpen(true)}/>}
    {(selected||panelOpen)&&<aside ref={panel} className={`post-panel ${selected?'has-selection':''} ${composing?'is-composing':''}`} id="post-panel" aria-label={selected?`Selected place: ${selected.name}`:'Notes and events'} tabIndex={-1}>
      {selected?<><div className="panel-heading"><span className={`place-symbol ${activePost?.kind??'note'}`}>{activePost?.kind==='event'?<CalendarDays size={19}/>:<MapPin size={19}/>}</span><h2>{activePost?.place??selected.name}</h2><button className="icon-button" aria-label="Close selected place" onClick={clearSelection}><X size={18}/></button></div>
        {(activePost||composing)&&<button className="back-to-place text-button" onClick={()=>{setActivePost(null);setComposing(false);setFormError('');}}>Back to place</button>}{activePost?<div className="post-detail"><div className="post-meta"><span>{activePost.kind==='event'?'Event':'Note'}</span><time>{eventLabel(activePost,time)}</time></div><p className="post-body" dir="auto">{activePost.body}</p>{activePost.kind==='event'&&<p className="event-range">{localDate.format(activePost.startsAt!)}<br/>to {localDate.format(activePost.endsAt!)} IST</p>}
          <div className="post-actions"><button className={`vote-button ${voted.has(activePost.id)?'voted':''}`} onClick={()=>upvote(activePost)} disabled={!!actionBusy||voted.has(activePost.id)} aria-label={`Upvote this post. ${voteCountLabel(activePost.votes)}`}><ArrowUp size={16}/>{formatCount(activePost.votes)}<span>{voted.has(activePost.id)?'Upvoted':'Upvote'}</span></button><button className="icon-button" aria-label="Report this post" onClick={()=>setReportOpen(value=>!value)}><Flag size={16}/></button>{readOwn(activePost.id)&&<button className="icon-button" aria-label="Remove your post" onClick={()=>setDeleteConfirm(true)}><Trash2 size={16}/></button>}</div>
          {activePost.votes>=KEEP_VOTES&&<p className="kept-label"><Check size={14}/>Kept by the community</p>}{reportOpen&&<div className="inline-confirm"><p>Report this post</p>{[['contact','Contact details'],['unsafe','Unsafe content'],['spam','Spam']].map(([value,label])=><button key={value} disabled={!!actionBusy} onClick={()=>reportPost(activePost,value)}>{label}</button>)}</div>}{deleteConfirm&&<div className="inline-confirm"><p>Remove your post?</p><button className="danger-text" disabled={!!actionBusy} onClick={()=>removePost(activePost)}>Remove</button><button onClick={()=>setDeleteConfirm(false)}>Keep</button></div>}<button className="secondary-button full" onClick={()=>{setActivePost(null);setComposing(false);}}>View place<ArrowUpRight size={16}/></button>
        </div>:composing?<form className="composer" onSubmit={publish}><div className="segmented" aria-label="Post type"><button type="button" aria-pressed={kind==='note'} onClick={()=>{setKind('note');setFormError('');}}><StickyNote size={15}/>Note</button><button type="button" aria-pressed={kind==='event'} onClick={()=>{setKind('event');setFormError('');}}><CalendarDays size={15}/>Event</button></div><label className="field-label" htmlFor="place-name">Place</label><input id="place-name" value={placeName} maxLength={MAX_PLACE_LENGTH} onChange={event=>{setPlaceName(event.target.value);setFormError('');}} required/><label className="field-label" htmlFor="post-body">{kind==='note'?'Your note':'What’s happening?'}</label><textarea id="post-body" autoFocus value={body} onChange={event=>{setBody(event.target.value);setFormError('');}} placeholder={kind==='note'?'Something worth knowing here.':'A few details about the event.'} maxLength={MAX_BODY} minLength={3} rows={4} required aria-describedby="post-privacy post-validation"/><div className="composer-caption"><span id="post-privacy">Anonymous. No contact details.</span><span>{body.length}/{MAX_BODY}</span></div>{kind==='event'&&<div className="event-fields"><label>Starts · IST<input type="datetime-local" value={startsAt} onChange={event=>{setStartsAt(event.target.value);setFormError('');}} required/></label><label>Ends · IST<input type="datetime-local" value={endsAt} onChange={event=>{setEndsAt(event.target.value);setFormError('');}} required/></label></div>}<div id="post-validation" aria-live="polite">{(formError||validation)&&<p className="form-error">{validation||formError}</p>}</div><button className="primary-button full" type="submit" disabled={busy||!!validation||body.trim().length<3}>{busy?<LoaderCircle size={17} className="spin"/>:<Plus size={17}/>}<span>{busy?'Publishing…':kind==='note'?'Publish note':'Publish event'}</span></button></form>:<PlacePreview key={`${selected.lng}:${selected.lat}`} place={selected} now={time} fixture={fixture} onPost={selectPost} onCompose={startComposer}/>}
      </>:<><div className="panel-heading"><h2>{archive?'Archive':'Notes & events'}</h2><button className="icon-button" aria-label="Collapse notes and events" onClick={()=>{setPanelOpen(false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.browse-posts')?.focus());}}><ChevronDown size={18}/></button></div><MapViewTabs/>
        <PostFilters kind={filter} when={when} archive={archive} loading={loading} onChange={changeFilters} onRefresh={()=>void loadPosts()}/>
        <div ref={postList} className="post-list" aria-busy={loading}>{loading?<div className="empty-state" role="status"><LoaderCircle size={22} className="spin"/><p>Loading posts</p></div>:postError&&!visible.length?<div className="empty-state"><p>{postError}</p><button className="text-button" onClick={()=>loadPosts()}>Try again</button></div>:visible.length?visible.map(post=><article className="post-row" key={post.id}><button className="post-row-main" onClick={()=>selectPost(post)}><span className={`row-kind ${post.kind}`}>{post.kind==='event'?<CalendarDays size={15}/>:<StickyNote size={15}/>}</span><span><strong dir="auto">{post.place}</strong><span className="row-body" dir="auto">{post.body}</span><small>{eventLabel(post,time)}</small></span></button><button className={`row-vote ${voted.has(post.id)?'voted':''}`} disabled={!!actionBusy||voted.has(post.id)} onClick={()=>upvote(post)} aria-label={`Upvote post at ${post.place}. ${voteCountLabel(post.votes)}`}><ArrowUp size={15}/><span>{formatCount(post.votes)}</span></button></article>):<div className="empty-state"><span className="empty-map-icon">{archive?<Archive size={24} strokeWidth={1.3}/>:<MapPin size={27} strokeWidth={1.3}/>}</span><h3>{archive?'No archived posts yet.':when==='now'?'No events happening now.':when==='today'?'No events today.':filter==='event'?'No events yet.':filter==='note'?'No notes yet.':'Nothing here yet.'}</h3><p>{archive?'Older posts will stay here.':when!=='any'?'Try another time filter.':'Choose a place to explore.'}</p></div>}{postError&&!!visible.length&&<div className="feed-error" role="alert"><p>{postError}</p><button className="text-button" onClick={()=>void loadPosts()}>Try again</button></div>}{nextCursor&&<button className="load-more" onClick={loadMore} disabled={moreLoading}>{moreLoading?<LoaderCircle size={14} className="spin"/>:<ChevronDown size={14}/>}Older posts</button>}</div><button className="primary-button full" onClick={()=>selectPlace(map.current?.center()??{name:'Dropped pin',lng:76.9778,lat:10.9991})}><Plus size={17}/>Add a post</button><p className="panel-footnote"><span className="anonymous-dot"/>No account. No name.</p></>}
    </aside>}
    <div className="map-tools" aria-label="Map controls"><div className="tool-group"><button className="icon-button" aria-label="Zoom in" onClick={()=>map.current?.zoom(1)}><Plus size={19}/></button><button className="icon-button" aria-label="Zoom out" onClick={()=>map.current?.zoom(-1)}><Minus size={19}/></button></div><div className="tool-group"><button className="icon-button" aria-label="Reset orientation" onClick={()=>map.current?.reset()}><Compass size={20} strokeWidth={1.5}/></button><button className="icon-button" aria-label="Use my location" onClick={()=>map.current?.locate()}><LocateFixed size={19} strokeWidth={1.5}/></button><button className={`icon-button ${flat?'active-tool':''}`} aria-label={flat?'Switch to 3D map':'Switch to 2D map'} aria-pressed={flat} onClick={()=>{map.current?.flat(!flat);setFlat(!flat);}}><Layers2 size={19} strokeWidth={1.5}/><span className="tool-label">{flat?'2D':'3D'}</span></button></div><div className="tool-group"><button className="icon-button" aria-label="Map appearance" aria-expanded={viewOpen} onClick={()=>{setViewOpen(value=>!value);setInfoOpen(false);}}><SlidersHorizontal size={18}/></button><button className="icon-button" aria-label="About this map and privacy" aria-expanded={infoOpen} onClick={()=>{setInfoOpen(value=>!value);setViewOpen(false);}}><Info size={19}/></button></div></div>
    {viewOpen&&<section className="view-panel" aria-label="Map appearance"><div className="mini-heading"><h2>Light</h2><button className="icon-button small" aria-label="Close appearance" onClick={()=>setViewOpen(false)}><X size={16}/></button></div>{([['auto','Local time'],['day','Day preview'],['night','Night preview']] as const).map(([value,label])=><button className="view-option" key={value} aria-pressed={scene===value} onClick={()=>setScene(value)}>{value==='night'?<Moon size={16}/>:<Sun size={16}/>}<span>{label}</span>{scene===value&&<Check size={16}/>}</button>)}</section>}
    {infoOpen&&<section className="info-panel" aria-label="About the map"><div className="mini-heading"><h2>A shared city.</h2><button className="icon-button small" aria-label="Close map information" onClick={()=>setInfoOpen(false)}><X size={16}/></button></div><p>Post at a place. Upvote what helps. Older posts stay in Archive.</p><p>Notes move after {NOTE_ARCHIVE_DAYS} days; events after they end. {KEEP_VOTES} upvotes keep a post visible. These are the starting rules.</p><h3>Privacy</h3><p>No accounts or public identities. Posts and selected places are public. Keep personal details out. Known phone-number formats are blocked; unusual disguises can still evade checks.</p><p>Votes and removal keys stay on this device. Brief, keyed network digests limit spam. Hosting providers can still receive connection data.</p><p>Map and weather requests go through our server. Anonymous totals count map visits and place views. No visitor identifiers or automatic location tracking. Activity respects browser privacy signals.</p><h3>Map & weather</h3><p>Initial coverage is the Coimbatore area. Building heights may be estimated. Weather is modeled data, checked every five minutes. Provider caches can delay updates.</p><p className="source-links"><a href="/admin">Admin login</a><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a><a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a><a href="https://api.met.no/license_data.html" target="_blank" rel="noreferrer">MET Norway · CC BY 4.0</a></p></section>}
    {notice&&<div className="notice" role="status"><span>{notice}</span><button className="icon-button small" aria-label="Dismiss message" onClick={()=>setNotice('')}><X size={15}/></button></div>}
  </main>;
}

