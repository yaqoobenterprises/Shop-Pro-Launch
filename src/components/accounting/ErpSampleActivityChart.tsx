import {useState} from "react";
import {samplePKR} from "./erpSampleScenario";
import {sampleActivity,type SampleActivityDay} from "./erpSampleActivity";

const LEFT=35,RIGHT=695,TOP=42,BOTTOM=237;
const YHEIGHT=BOTTOM-TOP;
const max=sampleActivity.reduce((largest,p)=>{
  const dayMax=p.invoicedMinor>p.collectedMinor?p.invoicedMinor:p.collectedMinor;
  return dayMax>largest?dayMax:largest;
},0n);
function xy(day:SampleActivityDay,index:number,field:"invoicedMinor"|"collectedMinor"):string{
  const x=LEFT+(RIGHT-LEFT)*index/(sampleActivity.length-1);
  // Only an integer 0..YHEIGHT pixel ratio is converted to Number, never money.
  const pixels=max===0n?0n:(day[field]*BigInt(YHEIGHT))/max;
  const y=BOTTOM-Number(pixels);
  return `${x.toFixed(2)},${y}`;
}
function line(field:"invoicedMinor"|"collectedMinor"):string{
  return sampleActivity.map((day,i)=>`${i===0?"M":"L"} ${xy(day,i,field)}`).join(" ");
}
function area(field:"invoicedMinor"|"collectedMinor"):string{
  return `${line(field)} L ${RIGHT},${BOTTOM} L ${LEFT},${BOTTOM} Z`;
}
const days=sampleActivity.map(p=>({
  ...p,
  label:p.date.slice(8,10)+" Nov",
}));

export function ErpSampleActivityChart(){
  const [day,setDay]=useState<string>(days.findLast(p=>p.collectedMinor>0n)?.date??
    days.at(-1)?.date??"2026-11-21");
  const selected=days.find(p=>p.date===day)??days[days.length-1];
  return <>
    <svg viewBox="0 0 720 260" preserveAspectRatio="xMidYMid meet"
      role="img" aria-label="Seven-day synthetic activity: 15,000 invoiced on 18 November, 8,000 invoiced on 19 November and 6,000 collected on 20 November">
      <defs>
        <linearGradient id="aq-invoice-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9587e2" stopOpacity=".17"/>
          <stop offset="1" stopColor="#9587e2" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="aq-collected-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#55c7b3" stopOpacity=".15"/>
          <stop offset="1" stopColor="#55c7b3" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[0,1,2,3,4].map(i=><line key={i} x1={LEFT} x2={RIGHT}
        y1={TOP+(YHEIGHT*i)/4} y2={TOP+(YHEIGHT*i)/4}
        stroke="#e7e5ed" strokeDasharray="5 6"/>)}
      <path d={area("invoicedMinor")} fill="url(#aq-invoice-gradient)"/>
      <path d={area("collectedMinor")} fill="url(#aq-collected-gradient)"/>
      <path d={line("invoicedMinor")} fill="none" stroke="#9587e2"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d={line("collectedMinor")} fill="none" stroke="#55c7b3"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      {days.map((point,i)=>(
        (["invoicedMinor","collectedMinor"] as const).map(field=>{
          if(point[field]===0n)return null;
          const [cx,cy]=xy(point,i,field).split(",").map(Number);
          return <circle key={field+point.date} cx={cx} cy={cy} r="4.2"
            stroke="#fff" strokeWidth="2"
            fill={field==="invoicedMinor"?"#9587e2":"#55c7b3"}/>;
        })
      ))}
    </svg>
    <div className="aq-erp-axis" aria-hidden="true">
      {days.map(point=><span key={point.date}>{point.label}</span>)}
    </div>
    <div className="aq-erp-chart-inspection">
      <label htmlFor="aq-erp-inspect-day">Inspect sample day
        <select id="aq-erp-inspect-day" value={day}
          onChange={e=>setDay(e.target.value)}>
          {days.map(point=><option key={point.date} value={point.date}>
            {point.label}</option>)}
        </select>
      </label>
      <div role="status" aria-live="polite" className="aq-erp-day-figures">
        <span>Invoiced <strong>{samplePKR(selected.invoicedMinor)}</strong></span>
        <span>Collected <strong>{samplePKR(selected.collectedMinor)}</strong></span>
      </div>
    </div>
    <table className="sr-only">
      <caption>Exact illustrative daily invoicing and controlled cash, not live company data</caption>
      <thead><tr><th>Date</th><th>Invoiced</th><th>Collected</th></tr></thead>
      <tbody>{days.map(point=><tr key={point.date}>
        <td>{point.date}</td><td>{samplePKR(point.invoicedMinor)}</td>
        <td>{samplePKR(point.collectedMinor)}</td>
      </tr>)}</tbody>
    </table>
  </>;
}
