import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {describe,expect,it,vi} from "vitest";

type Handler=(event:Record<string,unknown>)=>void;
function workerHarness(){
  const handlers=new Map<string,Handler>();
  const response=(body:string)=>({
    ok:true,type:"basic",headers:{get:()=>null},
    text:async()=>body,clone(){return this;},
  });
  const cache={
    addAll:vi.fn(async()=>{}),
    add:vi.fn(async()=>{}),
    match:vi.fn(async(path:unknown)=>path==="/index.html"?
      response('<script src="/assets/app-123.js"></script><link href="/assets/app-123.css">'):
      undefined),
    put:vi.fn(async()=>{}),
  };
  const storage={
    open:vi.fn(async()=>cache),
    keys:vi.fn(async()=>[
      "aqvora-pwa-v1","aqvora-shell-v1","aqvora-shell-v2","unrelated-cache",
    ]),
    delete:vi.fn(async()=>true),
    match:vi.fn(async()=>response("cached offline app shell")),
  };
  const fetcher=vi.fn(async()=>response("public asset"));
  const self={
    location:{origin:"https://aqvora.example"},
    addEventListener:(event:string,handler:Handler)=>handlers.set(event,handler),
    skipWaiting:vi.fn(),clients:{claim:vi.fn()},
  };
  const source=readFileSync(new URL("../public/sw.js",import.meta.url),"utf8");
  runInNewContext(source,{
    self,caches:storage,fetch:fetcher,URL,Promise,Set,
    Response:{error:()=>({ok:false,error:true})},
  });
  const invoke=(kind:string,event:Record<string,unknown>)=>{
    const handler=handlers.get(kind);
    if(!handler)throw new Error("Missing service worker event: "+kind);
    handler(event);
  };
  const intercept=(url:string,method="GET",mode="cors")=>{
    let result:Promise<unknown>|undefined;
    invoke("fetch",{
      request:{url,method,mode},
      respondWith:(p:Promise<unknown>)=>{result=p;},
    });
    return result;
  };
  return {cache,storage,fetcher,self,invoke,intercept};
}

describe("AQVORA installed-PWA release update safety",()=>{
  it("does not cache financial/API/Auth responses, foreign origins or token URLs",()=>{
    const w=workerHarness();
    for(const path of ["/api/finance","/rest/v1/journals","/auth/v1/user",
      "/functions/v1/post-journal","/reports/ledger.json","/customer-records"]){
      expect(w.intercept("https://aqvora.example"+path)).toBeUndefined();
    }
    expect(w.intercept("https://other.example/assets/app.js")).toBeUndefined();
    expect(w.intercept("https://aqvora.example/assets/app.js?jwt=token")).toBeUndefined();
    expect(w.intercept("https://aqvora.example/api/data","POST")).toBeUndefined();
    expect(w.storage.open).not.toHaveBeenCalled();
  });
  it("intercepts only public static assets and caches their successful response",async()=>{
    const w=workerHarness();
    const result=w.intercept("https://aqvora.example/assets/app-123.js");
    expect(result).toBeDefined();
    await result;
    expect(w.fetcher).toHaveBeenCalledOnce();
    expect(w.cache.put).toHaveBeenCalledOnce();
    expect(w.storage.open).toHaveBeenCalledWith("aqvora-shell-v2");
  });
  it("prepares public shell and compiled entrypoints without forcing a tab reload",async()=>{
    const w=workerHarness();
    let task:Promise<unknown>|undefined;
    w.invoke("install",{waitUntil:(p:Promise<unknown>)=>{task=p;}});
    await task;
    expect(w.cache.addAll).toHaveBeenCalledWith([
      "/index.html","/manifest.json","/assets/logo.svg",
      "/assets/icon-192.png","/assets/icon-512.png",
    ]);
    expect(w.cache.add).toHaveBeenCalledWith("/assets/app-123.js");
    expect(w.cache.add).toHaveBeenCalledWith("/assets/app-123.css");
    expect(w.self.skipWaiting).not.toHaveBeenCalled();
  });
  it("deletes ONLY AQVORA-owned old caches, preserving other app data caches",async()=>{
    const w=workerHarness();
    let task:Promise<unknown>|undefined;
    w.invoke("activate",{waitUntil:(p:Promise<unknown>)=>{task=p;}});
    await task;
    expect(w.storage.delete).toHaveBeenCalledTimes(2);
    expect(w.storage.delete).toHaveBeenCalledWith("aqvora-pwa-v1");
    expect(w.storage.delete).toHaveBeenCalledWith("aqvora-shell-v1");
    expect(w.storage.delete).not.toHaveBeenCalledWith("unrelated-cache");
    expect(w.self.clients.claim).not.toHaveBeenCalled();
  });
  it("uses network-first navigation with a static-only offline fallback",async()=>{
    const w=workerHarness();
    w.fetcher.mockRejectedValueOnce(new Error("offline"));
    const result=w.intercept("https://aqvora.example/reports","GET","navigate");
    expect(result).toBeDefined();
    const res=await result as {text:()=>Promise<string>};
    expect(await res.text()).toBe("cached offline app shell");
    expect(w.storage.match).toHaveBeenCalledWith("/index.html");
    expect(w.cache.put).not.toHaveBeenCalled();
  });
});
