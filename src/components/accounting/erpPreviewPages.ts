export type ErpReviewPage =
  | "overview" | "customers" | "sales" | "receivables" | "cash" | "receipts"
  | "chart" | "journal" | "ledger" | "trial" | "fiscal"
  | "purchases" | "inventory" | "payroll" | "ai";

export const erpReviewGroups:ReadonlyArray<{
  label:string;pages:ReadonlyArray<{id:ErpReviewPage;label:string;implemented:boolean}>;
}>=[
  {label:"WORKSPACE",pages:[
    {id:"overview",label:"Business Overview",implemented:true},
    {id:"customers",label:"Customers",implemented:true},
    {id:"sales",label:"Sales Invoices",implemented:true},
    {id:"receivables",label:"Receivables",implemented:true},
    {id:"cash",label:"Cash Collections",implemented:true},
    {id:"receipts",label:"Customer Receipts",implemented:true},
  ]},
  {label:"ACCOUNTING",pages:[
    {id:"chart",label:"Chart of Accounts",implemented:true},
    {id:"journal",label:"Journal Entry",implemented:true},
    {id:"ledger",label:"General Ledger",implemented:true},
    {id:"trial",label:"Trial Balance",implemented:true},
    {id:"fiscal",label:"Fiscal Periods",implemented:true},
  ]},
  {label:"ROADMAP",pages:[
    {id:"purchases",label:"Purchases & Payables",implemented:false},
    {id:"inventory",label:"Inventory & POS",implemented:false},
    {id:"payroll",label:"HR & Payroll",implemented:false},
    {id:"ai",label:"AQVORA AI Copilot",implemented:false},
  ]},
];
