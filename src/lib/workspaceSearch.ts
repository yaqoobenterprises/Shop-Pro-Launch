import type { AppView } from "../context/AppContext";
const routes: Record<string,AppView> = {
  overview:"dashboard", dashboard:"dashboard", cashbook:"chat", ledger:"chat",
  transactions:"sales", entries:"sales", accounts:"accounts", reports:"reports",
  ledgermate:"ai", "ledgermate ai":"ai", ai:"ai", settings:"settings",
};
export function resolveWorkspaceSearch(value:string): {view:AppView;query:string} | null {
  const query=value.trim();
  if(!query)return null;
  const view=Object.hasOwn(routes,query.toLowerCase()) ? routes[query.toLowerCase()] : undefined;
  return view ? {view,query:""} : {view:"sales",query};
}
export const WORKSPACE_TRANSACTION_SEARCH = "shop-plus:transaction-search";
