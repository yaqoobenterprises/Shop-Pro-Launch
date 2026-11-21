/** Pure, exact-money visual-review series. Illustrative fixtures ONLY.
 * Never mistake this local example for an authorized V2 company report.
 */
import {sampleInvoices,sampleReceipt} from "./erpSampleScenario";

export interface SampleActivityInvoice {
  id:string;date:string;faceMinor:string;receivedMinor:string;
}
export interface SampleActivityReceipt {
  invoiceId:string;date:string;amountMinor:string;
}
export interface SampleActivityDay {
  date:string;invoicedMinor:bigint;collectedMinor:bigint;
}
const MAX_MINOR=(1n<<63n)-1n;
const DAY_MS=86_400_000;
function exactMinor(value:string):bigint{
  if(!/^(0|[1-9][0-9]*)$/.test(value))throw new Error("Invalid sample source minor units.");
  const amount=BigInt(value);
  if(amount>MAX_MINOR)throw new Error("Sample source exceeds financial BIGINT bounds.");
  return amount;
}
function dayNumber(date:string):number{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error("Invalid sample date.");
  const ms=Date.parse(date+"T00:00:00.000Z");
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==date){
    throw new Error("Invalid calendar date in sample activity.");
  }
  return ms;
}
function add(a:bigint,b:bigint):bigint{
  const total=a+b;
  if(total>MAX_MINOR)throw new Error("Synthetic analytics aggregate exceeds BIGINT.");
  return total;
}
/** Enforce one-source arithmetic before plotting. No invented between-day revenue. */
export function buildSampleActivity(
  invoices:readonly SampleActivityInvoice[],
  receipts:readonly SampleActivityReceipt[],
  asOfDate:string,days=7,
):SampleActivityDay[]{
  const end=dayNumber(asOfDate);
  if(!Number.isSafeInteger(days)||days<2||days>31){
    throw new Error("Sample activity window must be 2–31 days.");
  }
  const result:SampleActivityDay[]=Array.from({length:days},(_,i)=>({
    date:new Date(end-(days-i-1)*DAY_MS).toISOString().slice(0,10),
    invoicedMinor:0n,collectedMinor:0n,
  }));
  const byDate=new Map(result.map(point=>[point.date,point]));
  const billed=new Map<string,{face:bigint;received:bigint}>();
  for(const invoice of invoices){
    if(!invoice.id.trim()||billed.has(invoice.id))throw new Error("Duplicate sample invoice.");
    const date=dayNumber(invoice.date);
    const face=exactMinor(invoice.faceMinor),received=exactMinor(invoice.receivedMinor);
    if(received>face)throw new Error("Sample invoice is overallocated.");
    if(date>end)throw new Error("Future sample invoice source.");
    billed.set(invoice.id,{face,received});
    const point=byDate.get(invoice.date);
    if(point)point.invoicedMinor=add(point.invoicedMinor,face);
  }
  const settled=new Map<string,bigint>();
  for(const receipt of receipts){
    const date=dayNumber(receipt.date);
    const original=billed.get(receipt.invoiceId);
    if(!original||date>end)throw new Error("Unmatched or future sample cash receipt.");
    const collected=exactMinor(receipt.amountMinor);
    settled.set(receipt.invoiceId,add(settled.get(receipt.invoiceId)??0n,collected));
    const point=byDate.get(receipt.date);
    if(point)point.collectedMinor=add(point.collectedMinor,collected);
  }
  for(const [id,source] of billed){
    if((settled.get(id)??0n)!==source.received){
      throw new Error("Sample invoice allocated amount differs from cash evidence.");
    }
  }
  return result;
}
export const sampleActivity=buildSampleActivity(
  sampleInvoices,[sampleReceipt],"2026-11-21",
);
export function percentCollected(collected:bigint,invoiced:bigint):number{
  if(invoiced<0n||collected<0n||collected>invoiced){
    throw new Error("Invalid synthetic invoice settlement ratio.");
  }
  if(invoiced===0n)return 0;
  return Number((collected*1000n+invoiced/2n)/invoiced)/10;
}
