'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Map as LibreMap, Marker, StyleSpecification } from 'maplibre-gl';
import { CITY_BOUNDS, CITY_CENTER, inCity, type Place, type Post } from '../lib/product';
import { groupPostsByLocation, type PostLocation } from '../lib/post-locations';
import { formatCount } from '../lib/presentation';

export type MapHandle = {
  zoom: (amount:number)=>void; reset:()=>void; flat:(value:boolean)=>void;
  locate:()=>void; center:()=>Place; retry:()=>void;
};
export type MapLoadState = 'loading' | 'ready' | 'failed';
type Props={places:Place[];posts:Post[];selected:Place|null;night:boolean;cloud:number;onSelect:(place:Place)=>void;onPost:(post:Post)=>void;onGroup:(location:PostLocation)=>void;onError:(message:string)=>void;onStateChange:(state:MapLoadState)=>void};

function facade(night:boolean) {
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const window=x%16>=5 && x%16<10 && y%16>=5 && y%16<11;
    const lit=(Math.floor(x/16)+Math.floor(y/16)*3)%4!==0;
    const color=night ? (window && lit?[230,187,105]:[28,43,51]) : (window?[120,150,146]:[200,206,192]);
    const offset=(y*size+x)*4; data[offset]=color[0];data[offset+1]=color[1];data[offset+2]=color[2];data[offset+3]=255;
  }
  return {width:size,height:size,data};
}

function colorMap(map:LibreMap,night:boolean,cloud:number){
  if(!map.getStyle()?.layers)return;
  const ground=night?'#182e32':'#d7ddcc', water=night?'#174954':'#619da7', road=night?'#737263':'#fff5df';
  for(const layer of map.getStyle().layers??[]){
    const id=layer.id;
    if(id.startsWith('city-'))continue;
    try {
      if(layer.type==='background')map.setPaintProperty(id,'background-color',ground);
      if(layer.type==='fill'){
        if(/building/i.test(id)){map.setLayoutProperty(id,'visibility','none');continue;}
        const color=/water/.test(id)?water:/park|wood|forest|grass/.test(id)?(night?'#2c5540':'#88ae81'):/sand/.test(id)?(night?'#343c32':'#ddd4ba'):/residential|industrial|commercial/.test(id)?(night?'#22383a':'#cfd6c4'):ground;
        map.setPaintProperty(id,'fill-color',color);
      }
      if(layer.type==='line'){
        if(/water/.test(id))map.setPaintProperty(id,'line-color',water);
        else if(/road|highway|street|bridge|tunnel|path|railway/.test(id))map.setPaintProperty(id,'line-color',/casing|outline/.test(id)?(night?'#3c4c45':'#b5c0ad'):/motorway|primary|trunk/.test(id)?(night?'#ba995f':'#e9c17e'):road);
        else if(/boundary/.test(id))map.setPaintProperty(id,'line-color',night?'#40514c':'#b4bcac');
      }
      if(layer.type==='symbol'){
        if(/poi|housenumber/.test(id))map.setLayoutProperty(id,'visibility','none');
        map.setPaintProperty(id,'text-color',night?'#d3ded2':'#354e49');
        map.setPaintProperty(id,'text-halo-color',night?'#182e32':'#e6e9dc');
        map.setPaintProperty(id,'text-halo-width',1.2);
      }
    }catch{ /* Some base-style layers have no applicable paint property. */ }
  }
  if(map.hasImage('city-facade'))map.updateImage('city-facade',facade(night));
  if(map.getLayer('city-roofs'))map.setPaintProperty('city-roofs','fill-extrusion-color',night?'#3b5154':'#eee4cf');
  map.setLight({anchor:'viewport',color:night?'#b3c5d3':'#fff3d5',intensity:night?.35:Math.max(.22,.55-cloud/250),position:[1.2,210,50]});
  map.setSky({'sky-color':night?'#102333':'#b4c8cb','horizon-color':night?'#273c46':'#e1e4d6','fog-color':night?'#1d3540':'#ccd5cc','sky-horizon-blend':.8,'horizon-fog-blend':.6,'fog-ground-blend':.03+cloud/2500});
}

const CityMap=forwardRef<MapHandle,Props>(function CityMap({places,posts,selected,night,cloud,onSelect,onPost,onGroup,onError,onStateChange},ref){
  const container=useRef<HTMLDivElement>(null), mapRef=useRef<LibreMap|null>(null);
  const markers=useRef<Marker[]>([]),selectionMarker=useRef<Marker|null>(null);
  const latest=useRef({places,onSelect,onPost,onGroup,onError,onStateChange,night,cloud});
  latest.current={places,onSelect,onPost,onGroup,onError,onStateChange,night,cloud};
  const [attempt,setAttempt]=useState(0),[ready,setReady]=useState(0);
  useImperativeHandle(ref,()=>({
    zoom:(amount)=>mapRef.current?.zoomTo(mapRef.current.getZoom()+amount,{duration:300}),
    reset:()=>mapRef.current?.flyTo({center:CITY_CENTER,zoom:15.65,pitch:58,bearing:-24,duration:1000,essential:false}),
    flat:value=>mapRef.current?.easeTo({pitch:value?0:60,bearing:value?0:-24,duration:700,essential:false}),
    retry:()=>setAttempt(value=>value+1),
    center:()=>{const c=mapRef.current?.getCenter();return {name:'Dropped pin',lng:c?.lng??CITY_CENTER[0],lat:c?.lat??CITY_CENTER[1]};},
    locate:()=>{
      if(!navigator.geolocation){latest.current.onError('Location is unavailable in this browser. Search for a place instead.');return;}
      navigator.geolocation.getCurrentPosition(position=>{
        const {longitude:lng,latitude:lat}=position.coords;
        if(!inCity(lng,lat)){latest.current.onError('Your location is outside the Coimbatore area.');return;}
        mapRef.current?.flyTo({center:[lng,lat],zoom:16});
        latest.current.onSelect({name:'Selected place',lng,lat});
      },()=>latest.current.onError('Location is unavailable. Search for a place instead.'),{enableHighAccuracy:false,timeout:10000,maximumAge:60000});
    },
  }),[]);

  useEffect(()=>{
    let disposed=false; let observer:ResizeObserver|undefined,attributionObserver:ResizeObserver|undefined,loadTimer:ReturnType<typeof setTimeout>|undefined;
    const controller=new AbortController();
    latest.current.onStateChange('loading');
    import('maplibre-gl').then(async libre=>{
      if(disposed||!container.current)return;
      libre.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      const headers=new Headers();
      if(import.meta.env.DEV){const fixture=new URLSearchParams(window.location.search).get('data');if(fixture)headers.set('X-UI-Fixture',fixture);}
      const response=await fetch('/api/map?v=2',{headers,signal:controller.signal,...import.meta.env.DEV&&headers.has('X-UI-Fixture')?{cache:'no-store' as const}:{}});
      if(!response.ok)throw new Error('The city map could not load.');
      const style=await response.json() as StyleSpecification;
      style.layers=style.layers.filter(layer=>!('source' in layer&&layer.source==='ne2_shaded')&&!(layer.type==='symbol'&&/poi|housenumber/i.test(layer.id))&&!(layer.type==='fill'&&/building/i.test(layer.id)));
      delete style.sources.ne2_shaded;
      if(disposed)return;
      const map=new libre.Map({container:container.current,style,center:CITY_CENTER,zoom:15.65,pitch:58,bearing:-24,maxBounds:CITY_BOUNDS,minZoom:11,maxZoom:19,maxPitch:75,attributionControl:false,canvasContextAttributes:{antialias:true},fadeDuration:150});
      mapRef.current=map;
      map.addControl(new libre.AttributionControl({compact:false,customAttribution:'Building heights may be estimated'}),'bottom-right');
      const attribution=map.getContainer().querySelector<HTMLElement>('.maplibregl-ctrl-bottom-right');
      const app=container.current?.closest<HTMLElement>('.city-app');
      if(attribution&&app){
        const measure=()=>app.style.setProperty('--map-attribution-height',Math.ceil(attribution.getBoundingClientRect().height)+'px');
        attributionObserver=new ResizeObserver(measure);attributionObserver.observe(attribution);measure();
      }
      let loaded=false;
      loadTimer=setTimeout(()=>{if(!disposed&&!loaded)latest.current.onStateChange('failed');},20000);
      map.on('load',()=>{
        if(disposed)return;
        loaded=true;clearTimeout(loadTimer);
        map.addImage('city-facade',facade(latest.current.night));
        const source=style.sources.openmaptiles?'openmaptiles':Object.keys(style.sources).find(id=>style.sources[id].type==='vector');
        const height:unknown=['case',['>', ['coalesce',['get','render_height'],0],0],['get','render_height'],9];
        if(source){
          const before=map.getStyle().layers?.find(layer=>layer.type==='symbol')?.id;
          map.addLayer({id:'city-buildings',type:'fill-extrusion',source,'source-layer':'building',minzoom:13,paint:{'fill-extrusion-height':height as never,'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-pattern':'city-facade','fill-extrusion-opacity':1,'fill-extrusion-vertical-gradient':true}},before);
          map.addLayer({id:'city-roofs',type:'fill-extrusion',source,'source-layer':'building',minzoom:13,paint:{'fill-extrusion-height':['+',height,.15] as never,'fill-extrusion-base':['-',height,.1] as never,'fill-extrusion-color':'#e9e5d6','fill-extrusion-opacity':1}},before);
        }
        colorMap(map,latest.current.night,latest.current.cloud);
        setReady(value=>value+1);
        latest.current.onStateChange('ready');
      });
      map.on('error',()=>{if(!disposed&&!loaded)latest.current.onError('Some map data could not load. Check your connection.');});
      map.on('click',event=>{
        if(!inCity(event.lngLat.lng,event.lngLat.lat))return;
        const feature=map.queryRenderedFeatures(event.point).find(f=>f.properties?.['name:en']||f.properties?.name);
        const nearest=latest.current.places.map(place=>({place,d:Math.hypot((place.lng-event.lngLat.lng)*.98,place.lat-event.lngLat.lat)})).sort((a,b)=>a.d-b.d)[0];
        const name=feature?.properties?.['name:en']??feature?.properties?.name;
        const place=nearest?.d<.0012?nearest.place:{name:typeof name==='string'?name:'Dropped pin',lng:event.lngLat.lng,lat:event.lngLat.lat};
        latest.current.onSelect(place);
      });
      observer=new ResizeObserver(()=>map.resize());observer.observe(container.current);
    }).catch(()=>{if(!disposed)latest.current.onStateChange('failed');});
    return ()=>{disposed=true;controller.abort();clearTimeout(loadTimer);observer?.disconnect();attributionObserver?.disconnect();markers.current.forEach(m=>m.remove());selectionMarker.current?.remove();mapRef.current?.remove();mapRef.current=null;};
  },[attempt]);

  useEffect(()=>{
    const map=mapRef.current;if(!map)return;
    const recolor=()=>colorMap(map,night,cloud);
    if(map.isStyleLoaded())recolor();else map.once('load',recolor);
  },[night,cloud]);

  useEffect(()=>{
    let disposed=false;
    import('maplibre-gl').then(libre=>{
      const map=mapRef.current;if(!map||disposed)return;
      markers.current.forEach(marker=>marker.remove());markers.current=[];
      for(const group of groupPostsByLocation(posts)){
        const post=group.posts[0],multiple=group.posts.length>1;
        const kind=group.posts.every(p=>p.kind==='event')?'event':group.posts.every(p=>p.kind==='note')?'note':'mixed';
        const label=multiple?`${formatCount(group.posts.length)} posts at ${group.place}`:`${post.kind==='event'?'Event':'Note'} at ${post.place}`;
        const element=document.createElement('button');element.className=`post-pin ${kind}${multiple?' post-pin-group':''}`;
        element.type='button';element.setAttribute('aria-label',label);element.title=label;
        const symbol=document.createElement('span');symbol.className='pin-symbol';symbol.setAttribute('aria-hidden','true');
        const paths=kind==='event'?'<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/>':kind==='mixed'?'<path d="M5 4h10l4 4v12H5zM15 4v5h4M8 13h8M8 16h5"/>':'<path d="M5 3h10l4 4v14H5zM15 3v5h4M8 12h8M8 16h6"/>';
        symbol.innerHTML='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+paths+'</svg>';
        if(multiple){const count=document.createElement('span');count.textContent=formatCount(group.posts.length);symbol.appendChild(count);}
        element.appendChild(symbol);
        element.addEventListener('click',event=>{event.stopPropagation();if(multiple)latest.current.onGroup(group);else latest.current.onPost(post);});
        markers.current.push(new libre.Marker({element,anchor:'bottom'}).setLngLat([group.lng,group.lat]).addTo(map));
      }
    });
    return ()=>{disposed=true;};
  },[posts,attempt,ready]);

  useEffect(()=>{
    if(!selected){selectionMarker.current?.remove();mapRef.current?.setPadding({top:0,bottom:0,left:0,right:0});return;}
    let disposed=false,selectionObserver:ResizeObserver|undefined,removeResize:(()=>void)|undefined;
    import('maplibre-gl').then(libre=>{
      const map=mapRef.current;if(!map||disposed)return;
      selectionMarker.current?.remove();const element=document.createElement('div');element.className='selected-pin';
      element.setAttribute('aria-hidden','true');selectionMarker.current=new libre.Marker({element,anchor:'bottom'}).setLngLat([selected.lng,selected.lat]).addTo(map);
      const frame=()=>{
        if(disposed)return;
        const mobile=window.innerWidth<700,stage=map.getContainer().getBoundingClientRect();
        const sheet=document.getElementById('post-panel')?.getBoundingClientRect();
        const header=document.querySelector('.city-header')?.getBoundingClientRect();
        const padding={top:Math.min((header?.bottom??80)+12,stage.height*.25),bottom:mobile?Math.min(Math.max(0,stage.height-(sheet?.top??stage.height)+16),stage.height*.45):24,left:mobile?12:Math.min((sheet?.right??0)+24,stage.width*.45),right:mobile?66:90};
        map.easeTo({center:[selected.lng,selected.lat],padding,zoom:Math.max(map.getZoom(),16),duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:650,essential:false});
      };
      frame();
      const sheet=document.getElementById('post-panel');
      if(sheet){selectionObserver=new ResizeObserver(frame);selectionObserver.observe(sheet);}
      window.addEventListener('resize',frame);removeResize=()=>window.removeEventListener('resize',frame);
    });
    return()=>{disposed=true;selectionObserver?.disconnect();removeResize?.();};
  },[selected,attempt,ready]);

  return <div className="map-stage" role="region" aria-label="Interactive 3D map of Coimbatore"><div className="map-canvas" ref={container}/></div>;
});
export default CityMap;
