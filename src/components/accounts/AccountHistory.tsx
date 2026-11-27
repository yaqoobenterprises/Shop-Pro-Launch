import React,{useEffect,useState} from "react";
import { accountHistoryService } from "../../services/accountHistoryService";
import { formatRecordedPaisa } from "../../lib/money";
import { Select } from "../common/Select";
import type { AccountLedgerEntry,LedgerAccount } from "../../types/ledger";

export function AccountHistory() {
  const [open,setOpen]=useState(false),[accounts,setAccounts]=useState<Pick<LedgerAccount,"id"|"name"|"is_active">[]>([]);
  const [account,setAccount]=useState(""),[page,setPage]=useState(0),[count,setCount]=useState(0);
  const [rows,setRows]=useState<AccountLedgerEntry[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    if(!open)return;
    let cancelled=false; setLoading(true);setError("");setRows([]);setCount(0);
    (async()=>{
      try {
        const choices=await accountHistoryService.accounts();
        if(cancelled)return;
        setAccounts(choices);
        const selected=choices.find(item=>item.id===account)?.id || choices[0]?.id || "";
        if(selected!==account){setAccount(selected);setPage(0);return;}
        if(!selected)return;
        const result=await accountHistoryService.entries(selected,page);
        if(cancelled)return;
        setRows(result.rows);setCount(result.count);
      }catch{if(!cancelled)setError("Posted account history is unavailable. Reconnect and retry.");}
      finally{if(!cancelled)setLoading(false);}
    })();
    return()=>{cancelled=true;};
  },[open,account,page,refresh]);
  return <section className="panel mt-4" aria-label="Account posting history">
    <div className="panel-heading"><h2>Account posting history</h2><button type="button" className="button button-secondary" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?"Hide history":"Show history"}</button></div>
    {open && <>
      <p className="account-scope-note">Posted ledger movements only, including transfer legs, reversals and opening balances. Pending operations are excluded. Balances after posting are historical, not current balances.</p>
      <Select aria-label="History account" value={account} onChange={e=>{setAccount(e.target.value);setPage(0);}}><option value="">Select account</option>{accounts.map(item=><option key={item.id} value={item.id}>{item.name}{!item.is_active?" (Inactive)":""}</option>)}</Select>
      <button className="button button-secondary" type="button" disabled={loading} onClick={()=>setRefresh(n=>n+1)}>Refresh history</button>
      {error?<p role="alert">{error}</p>:loading?<p role="status">Loading postings…</p>:rows.length===0?<p className="account-scope-note">No posted movements found for this account.</p>:<div role="region" aria-label="Posted account movements" tabIndex={0} className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Business date","Posting","Movement","Balance after","Reference"].map(label=><th key={label} scope="col" className="p-2 text-start">{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-t border-border-standard"><td className="p-2 whitespace-nowrap">{row.business_date}</td><td className="p-2">{row.entry_type.replaceAll("_"," ")}</td><td className="p-2 num text-end">{formatRecordedPaisa(row.amount_paisa)}</td><td className="p-2 num text-end">{formatRecordedPaisa(row.balance_after_paisa)}</td><td className="p-2 break-all text-xs">{row.transfer_id || row.transaction_id || row.id}</td></tr>)}</tbody></table></div>}
      <div className="flex flex-wrap items-center gap-2 mt-3"><span role="status" className="text-sm">{loading?"Loading…":error?"Unavailable":`${count} posted movements`}</span><button type="button" className="button button-secondary" disabled={loading||page===0} onClick={()=>setPage(p=>p-1)}>Previous</button><button type="button" className="button button-secondary" disabled={loading||(page+1)*25>=count} onClick={()=>setPage(p=>p+1)}>Next</button></div>
    </>}
  </section>;
}
