import React,{useState} from "react";
import {formatRecordedPaisa} from "../../lib/money";
export const DONUT_COLORS=["var(--chart-lavender)","var(--chart-teal)","var(--chart-pink)","#8191bd","#8c719c","#78918c"];
type Slice={key:string;label:string;amount:number};
export function financialSlices(items:readonly Slice[]) {
 if(items.some(item=>!Number.isSafeInteger(item.amount)))return {total:null,slices:[]};
 const valid=items.filter(item=>item.amount>0);
 const total=valid.reduce((sum,item)=>sum+BigInt(item.amount),0n);
 if(total>BigInt(Number.MAX_SAFE_INTEGER)) return {total:null,slices:[]};
 let offset=0;
 const slices=valid.map((item,index)=>{const share=Number(item.amount)/Number(total)*100;const result={...item,share,offset,color:DONUT_COLORS[index%DONUT_COLORS.length]};offset+=share;return result;});
 return {total:Number(total),slices};
}
export function FinancialDonut({items,label,centerLabel="Total",legendLabel}:{items:readonly Slice[];label:string;centerLabel?:string;legendLabel?:string}){
 const {total,slices}=financialSlices(items);
 const [hover,setHover]=useState<string|null>(null),[focus,setFocus]=useState<string|null>(null),[pinned,setPinned]=useState<string|null>(null);
 const selected=slices.find(item=>item.key===(hover??focus??pinned));
 const toggle=(key:string)=>{setPinned(old=>old===key?null:key);};
 if(total===null)return <p role="status">Chart unavailable</p>;
 return <div className="finance-donut" aria-label={label}>
  <div className="finance-donut__graphic">
   <svg viewBox="0 0 160 160" role="img" aria-label={label}>
    <circle cx="80" cy="80" r="64" fill="none" stroke="var(--track)" strokeWidth="18"/>
    {slices.map(item=><circle className="finance-donut__segment" key={item.key} cx="80" cy="80" r="64" fill="none" stroke={item.color} strokeWidth={selected?.key===item.key?23:18} pathLength="100" strokeDasharray={`${item.share} ${Math.max(0,100-item.share)}`} strokeDashoffset={-item.offset} transform="rotate(-90 80 80)" opacity={selected&&selected.key!==item.key?.45:1} onPointerEnter={e=>{if(e.pointerType!=="touch")setHover(item.key);}} onPointerLeave={()=>setHover(null)} onClick={()=>toggle(item.key)}><title>{item.label}: {formatRecordedPaisa(item.amount)}</title></circle>)}
   </svg>
   <div className="finance-donut__center" aria-live={hover?"off":"polite"}><span>{selected?selected.label:centerLabel}</span><strong>{formatRecordedPaisa(selected?.amount??total)}</strong>{selected&&<small>{selected.share.toFixed(1)}%</small>}</div>
  </div>
  <ul className="finance-donut__legend" aria-label={legendLabel??label+" values"}>{slices.map(item=><li key={item.key}><button type="button" aria-pressed={pinned===item.key} onFocus={()=>setFocus(item.key)} onBlur={()=>setFocus(null)} onPointerEnter={e=>{if(e.pointerType!=="touch")setHover(item.key);}} onPointerLeave={()=>setHover(null)} onClick={()=>toggle(item.key)} onKeyDown={e=>{if(e.key==="Escape"){setHover(null);setFocus(null);setPinned(null);}}}><i style={{background:item.color}}/><span>{item.label}</span><strong>{formatRecordedPaisa(item.amount)}</strong><small>{item.share.toFixed(1)}%</small></button></li>)}</ul>
 </div>;
}
