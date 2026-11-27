import React,{useEffect,useId,useMemo,useRef,useState} from "react";
import {formatRecordedPaisa as money} from "../../lib/money";
import type {ReportTrendBucket} from "../../lib/reportAnalytics";
type Mode="area"|"bars"|"result";
const seriesFor=(mode:Mode)=>mode==="result"?[{key:"net_profit_paisa",label:"Result",color:"var(--chart-lavender)"}] as const:[{key:"income_paisa",label:"Income",color:"var(--chart-teal)"},{key:"expense_paisa",label:"Expenses",color:"var(--danger)"}] as const;
const compact=(n:number)=>new Intl.NumberFormat("en",{notation:"compact",maximumFractionDigits:1}).format(n/100);
export function chartIndex(x:number,left:number,width:number,count:number,centered=false){
 if(count<2)return 0;
 const fraction=(x-left)/Math.max(width,1);
 return Math.max(0,Math.min(count-1,centered?Math.floor(fraction*count):Math.round(fraction*(count-1))));
}
export function FinancialTrend({rows,mode="area",label}:{rows:ReportTrendBucket[];mode?:Mode;label:string}){
 const id=useId(),container=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null);
 const [width,setWidth]=useState(640),[hover,setHover]=useState<string|null>(null),[pinned,setPinned]=useState<string|null>(null);
 useEffect(()=>{const node=container.current;if(!node||typeof ResizeObserver==="undefined")return;const observer=new ResizeObserver(([entry])=>setWidth(Math.max(220,Math.round(entry.contentRect.width))));observer.observe(node);return()=>observer.disconnect();},[]);
 const series=seriesFor(mode), height=width<380?190:230,left=width<380?42:54,right=12,top=12,bottom=32,plotW=width-left-right,plotH=height-top-bottom;
 const domain=useMemo(()=>{const values=rows.flatMap(row=>seriesFor(mode).map(s=>row[s.key]));return {low:Math.min(0,...values),high:Math.max(0,...values)};},[rows,mode]);
 const {low,high}=domain,span=Math.max(1,high-low);
 const y=(v:number)=>top+(high-v)/span*plotH;
 const x=(i:number)=>left+(rows.length===1?.5:mode==="bars"?(i+.5)/rows.length:i/(rows.length-1))*plotW;
 const activeIndex=rows.findIndex(row=>row.key===(hover??pinned)),selected=rows[activeIndex];
 const pointAt=(clientX:number)=>{const rect=svg.current?.getBoundingClientRect();return rect?chartIndex((clientX-rect.left)*width/Math.max(1,rect.width),left,plotW,rows.length,mode==="bars"):0;};
 const move=(event:React.PointerEvent<SVGSVGElement>)=>{if(event.pointerType!=="touch")setHover(rows[pointAt(event.clientX)]?.key??null);};
 const select=(index:number)=>{const key=rows[index]?.key;setPinned(old=>old===key?null:key??null);};
 const keyDown=(event:React.KeyboardEvent)=>{const i=activeIndex<0?0:activeIndex;let next:number|undefined;switch(event.key){case "ArrowLeft":next=Math.max(0,i-1);break;case "ArrowRight":next=Math.min(rows.length-1,i+1);break;case "Home":next=0;break;case "End":next=rows.length-1;break;case "Escape":setHover(null);setPinned(null);return;default:return;}event.preventDefault();setHover(null);setPinned(rows[next]?.key??null);};
 if(!rows.length)return <p className="finance-chart-empty">No activity</p>;
 const zero=y(0),labelCount=Math.max(2,Math.floor(plotW/72)),step=Math.max(1,Math.ceil((rows.length-1)/labelCount));
 const ticks=high===low?[0]:Array.from(new Set([low,(low+high)/2,high,0])).sort((a,b)=>b-a).filter((v,i,a)=>i===0||Math.abs(y(v)-y(a[i-1]))>=17||v===0);
 const barW=Math.max(1,Math.min(24,plotW/rows.length/2.8));
 return <div className="finance-trend" ref={container} data-mode={mode}>
  <div className="finance-trend__summary" aria-live="off">
    <span className="finance-trend__period">{selected?.title??"Selected period"}</span>
    {series.map(s=><span key={s.key} className="finance-trend__metric"><i style={{background:s.color}}/>{s.label}<strong>{selected?money(selected[s.key]):"—"}</strong></span>)}
  </div>
  <svg ref={svg} className="finance-trend__svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} onPointerMove={move} onPointerLeave={()=>setHover(null)} onClick={e=>select(pointAt(e.clientX))}>
   <defs>{series.map(s=><linearGradient key={s.key} id={id+s.key} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity=".23"/><stop offset="100%" stopColor={s.color} stopOpacity=".025"/></linearGradient>)}</defs>
   {ticks.map(v=><g key={v}><line x1={left} x2={width-right} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" strokeDasharray={v===0?undefined:"3 5"}/><text x={left-7} y={y(v)+4} fontSize="10" textAnchor="end" fill="var(--muted)">{compact(v)}</text></g>)}
   {selected&&<rect x={Math.max(left,x(activeIndex)-Math.min(24,plotW/rows.length/2))} y={top} width={Math.min(48,plotW/rows.length)} height={plotH} fill="var(--tint)" opacity=".7" rx="5"/>}
   {series.map((s,si)=>{const path=rows.map((row,i)=>`${i?"L":"M"} ${x(i)} ${y(row[s.key])}`).join(" ");return <g key={s.key} className="finance-trend__series">
    {mode==="bars"?rows.map((row,i)=><rect key={row.key} x={x(i)+(si===0?-barW-1:1)} y={Math.min(zero,y(row[s.key]))} width={barW} height={Math.abs(zero-y(row[s.key]))} rx={Math.min(4,barW/3)} fill={s.color} opacity={selected&&i!==activeIndex?.48:1}><title>{s.label}: {money(row[s.key])}</title></rect>):<>
      <path d={`${path} L ${x(rows.length-1)} ${zero} L ${x(0)} ${zero} Z`} fill={`url(#${id+s.key})`}/>
      <path d={path} fill="none" stroke={s.color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round"/>
      {rows.map((row,i)=><circle key={row.key} cx={x(i)} cy={y(row[s.key])} r={i===activeIndex?5:rows.length<12?2.5:1.5} fill={s.color} stroke={i===activeIndex?"var(--surface-card)":"none"} strokeWidth="2"><title>{s.label}: {money(row[s.key])}</title></circle>)}
    </>}
   </g>;})}
   {selected&&<line x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={height-bottom} stroke="var(--muted)" opacity=".6" strokeDasharray="3 4" pointerEvents="none"/>}
   {rows.map((row,i)=>i===0||i===rows.length-1||(i%step===0&&rows.length-1-i>=step*.65)?<text key={row.key} x={x(i)} y={height-9} textAnchor={i===0?"start":i===rows.length-1?"end":"middle"} fill="var(--muted)" fontSize="10">{row.label}</text>:null)}
  </svg>
  <div className="finance-trend__navigation"><button type="button" aria-label="Inspect chart values" onFocus={()=>{if(!selected)setPinned(rows[0].key);}} onKeyDown={keyDown} onClick={()=>select(activeIndex<0?0:activeIndex)}>Inspect</button><button type="button" aria-label="Previous chart period" disabled={activeIndex===0} onClick={()=>{setHover(null);setPinned(rows[Math.max(0,activeIndex-1)].key);}}>‹</button><button type="button" aria-label="Next chart period" disabled={activeIndex===rows.length-1} onClick={()=>{setHover(null);setPinned(rows[Math.min(rows.length-1,activeIndex+1)].key);}}>›</button>{pinned&&<button type="button" aria-label="Clear chart selection" onClick={()=>{setHover(null);setPinned(null);}}>×</button>}<span className="sr-only" aria-live="polite">{pinned&&selected?selected.title+" "+series.map(s=>s.label+" "+money(selected[s.key])).join(", "):""}</span></div>
  <table className="sr-only" aria-label={label+" exact values"}><thead><tr><th scope="col">Period</th>{series.map(s=><th scope="col" key={s.key}>{s.label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.key}><th scope="row">{row.title}</th>{series.map(s=><td key={s.key}>{money(row[s.key])}</td>)}</tr>)}</tbody></table>
 </div>;
}
