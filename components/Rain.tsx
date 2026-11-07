'use client';
import { useEffect, useRef } from 'react';
export default function Rain({active}:{active:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    if(!active||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const element=canvas.current!,context=element.getContext('2d');if(!context)return;
    const resize=()=>{element.width=window.innerWidth;element.height=window.innerHeight;};resize();
    window.addEventListener('resize',resize);
    const drops=Array.from({length:65},()=>({x:Math.random(),y:Math.random(),speed:.15+Math.random()*.15}));
    let frame=0,last=performance.now();
    const draw=(time:number)=>{const elapsed=Math.min((time-last)/1000,.05);last=time;context.clearRect(0,0,element.width,element.height);context.strokeStyle='rgba(193,215,221,.38)';context.lineWidth=1;
      for(const drop of drops){drop.y=(drop.y+elapsed*drop.speed)%1;const x=drop.x*element.width,y=drop.y*element.height;context.beginPath();context.moveTo(x,y);context.lineTo(x-3,y+14);context.stroke();}frame=requestAnimationFrame(draw);};
    frame=requestAnimationFrame(draw);return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',resize);context.clearRect(0,0,element.width,element.height);};
  },[active]);
  return active?<canvas ref={canvas} className="weather-rain" aria-hidden="true"/>:null;
}
