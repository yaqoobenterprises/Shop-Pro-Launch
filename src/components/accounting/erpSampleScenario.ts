/** Transparent synthetic example for visual review. NO real company or cloud data. */
export const DEMO_SCALE=100n;
export const sampleCustomers=[
  {id:"customer-1",code:"CUS-001",name:"North Star Trading",status:"Active"},
  {id:"customer-2",code:"CUS-002",name:"Apex Services",status:"Active"},
  {id:"customer-3",code:"CUS-003",name:"Mariam Textiles",status:"Active"},
] as const;

export const sampleInvoices=[
  {id:"INV-S001",customerId:"customer-1",customer:"North Star Trading",
   date:"2026-11-18",description:"Consulting services",
   faceMinor:"1500000",receivedMinor:"600000",journalId:"JV-S001"},
  {id:"INV-S002",customerId:"customer-2",customer:"Apex Services",
   date:"2026-11-19",description:"Annual maintenance",
   faceMinor:"800000",receivedMinor:"0",journalId:"JV-S003"},
] as const;

export const sampleReceipt={
  id:"RC-S001",invoiceId:"INV-S001",customerId:"customer-1",
  date:"2026-11-20",amountMinor:"600000",journalId:"JV-S002",
  evidence:"Manual cash count · independently attested · NOT bank verified",
  status:"posted (sample only)",
} as const;

export const demoTotals={
  revenueMinor:sampleInvoices.reduce((s,i)=>s+BigInt(i.faceMinor),0n),
  collectedMinor:sampleInvoices.reduce((s,i)=>s+BigInt(i.receivedMinor),0n),
  outstandingMinor:sampleInvoices.reduce((s,i)=>s+BigInt(i.faceMinor)-BigInt(i.receivedMinor),0n),
  invoiceCount:sampleInvoices.length,
} as const;

export function samplePKR(minor:string|bigint):string{
  const amount=typeof minor==="bigint"?minor:BigInt(minor);
  const negative=amount<0n?"-":"";
  const absolute=amount<0n?-amount:amount;
  const major=(absolute/DEMO_SCALE).toLocaleString("en-US");
  const fraction=(absolute%DEMO_SCALE).toString().padStart(2,"0");
  return `${negative}Rs ${major}.${fraction}`;
}
