import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import handler from "../api/ai-chat.js";

const require=createRequire(import.meta.url);
const origin="https://shop-plus-local.test";
const root=resolve("dist");
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".svg":"image/svg+xml",".woff2":"font/woff2",".json":"application/json",".webp":"image/webp",".ico":"image/x-icon"};
const greeting="Synthetic integration response.";
export async function runAuthenticatedBrowser({api,key,owner,foreign}) {
  assert.equal(process.env.SHOP_PLUS_LOCAL_TEST,"1");
  assert.equal(new URL(api).origin,"http://127.0.0.1:54321");
  const {chromium}=require(process.env.RUNNER_TEMP+"/shop-plus-integration-browser/node_modules/playwright");
  const browser=await chromium.launch();
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:"block",acceptDownloads:true});
  const page=await context.newPage();
  page.setDefaultTimeout(20000);
  const errors=[];
  page.on("pageerror",error=>errors.push(error.name));
  let providerPosts=0;
  const originalFetch=globalThis.fetch;
  process.env.SUPABASE_URL=api;
  process.env.SUPABASE_ANON_KEY=key;
  process.env.GROQ_API_KEY="synthetic-provider-only";
  process.env.GROQ_MODEL="openai/gpt-oss-20b";
  globalThis.fetch=async(input,init)=>{
    const url=new URL(typeof input==="string"||input instanceof URL?input:input.url);
    if(url.origin===api)return originalFetch(input,init);
    if(url.origin==="https://api.groq.com"){
      if(url.pathname.endsWith("/models"))return Response.json({data:[{id:"openai/gpt-oss-20b",active:true}]});
      if(url.pathname.endsWith("/chat/completions")){
        providerPosts++;
        const payload=JSON.parse(init.body);
        assert.equal(payload.messages.at(-1).content,"Hello");
        assert.ok(payload.messages[1].content.includes("No financial data requested"));
        return new Response('data: '+JSON.stringify({choices:[{delta:{content:greeting}}]})+'\n\ndata: [DONE]\n\n',{headers:{"Content-Type":"text/event-stream"}});
      }
    }
    throw new Error("Outbound request prohibited in isolated integration");
  };
  try {
    await context.route("**/*",async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==origin)return route.abort();
      if(/^\/(auth|rest|storage)\/v1\//.test(url.pathname)){
        const response=await route.fetch({url:api+url.pathname+url.search,maxRedirects:0});
        return route.fulfill({response});
      }
      if(url.pathname==="/api/ai-chat"){
        let body="";const headers={};
        const response={statusCode:200,headersSent:false,setHeader(name,value){headers[name]=String(value)},write(value){this.headersSent=true;body+=value},end(value=""){this.headersSent=true;body+=value}};
        await handler({method:request.method(),headers:await request.allHeaders(),body:request.postDataJSON()||{}},response);
        return route.fulfill({status:response.statusCode,headers,body});
      }
      const candidate=resolve(root,"."+decodeURIComponent(url.pathname));
      if(!candidate.startsWith(root+sep)&&candidate!==root)return route.abort();
      const file=existsSync(candidate)&&statSync(candidate).isFile()?candidate:request.isNavigationRequest()?resolve(root,"index.html"):null;
      if(!file)return route.fulfill({status:404,body:"Not found"});
      return route.fulfill({status:200,contentType:mime[extname(file)]||"application/octet-stream",body:readFileSync(file)});
    });
    const login=async user=>{
      await page.goto(origin+"/");
      await page.getByRole("button",{name:"Sign in",exact:true}).filter({visible:true}).first().click();
      await page.locator("#aq-email").fill(user.email);
      await page.locator("#aq-password").fill(user.password);
      await page.locator('form button[type="submit"]').click();
      await page.getByRole("heading",{name:"Business overview"}).waitFor();
    };
    const navigate=async(name)=>{await page.locator("#primary-navigation").getByRole("button",{name,exact:true}).click();};
    await login(owner);
    const icons=await page.evaluate(async()=>{
      const results=[];
      for(const size of [192,512]){const image=new Image();image.src="/assets/icon-"+size+".png";await image.decode();results.push([image.naturalWidth,image.naturalHeight]);}
      return results;
    });
    assert.deepEqual(icons,[[192,192],[512,512]]);
    await page.getByRole("button",{name:"Load comparison & activity"}).click();
    await page.getByRole("region",{name:"Period comparison values"}).waitFor();
    await navigate("Transactions");
    await page.getByRole("heading",{name:"Transactions",exact:true}).waitFor();
    await page.getByLabel("Minimum amount").fill("100");
    await page.getByLabel("Maximum amount").fill("101");
    await page.getByText("Pre-upgrade receipt",{exact:true}).first().waitFor();
    await page.getByRole("button",{name:"Export filtered CSV"}).waitFor();
    const downloadPromise=page.waitForEvent("download");
    await page.getByRole("button",{name:"Export filtered CSV"}).click();
    const downloaded=await downloadPromise;
    const contents=readFileSync(await downloaded.path(),"utf8");
    assert.ok(contents.includes("100.50")&&contents.includes("Pre-upgrade receipt"));
    assert.ok(!contents.includes("Concurrent draft"));
    await navigate("Accounts");
    await page.getByRole("button",{name:"Show history"}).click();
    await page.getByRole("region",{name:"Posted account movements"}).waitFor();
    await navigate("LedgerMate AI");
    await page.getByText("AI available",{exact:true}).waitFor();
    await page.getByRole("textbox",{name:"Message LedgerMate AI"}).fill("Hello");
    await page.getByRole("button",{name:"Send message"}).click();
    await page.getByText(greeting,{exact:true}).waitFor();
    await page.getByRole("button",{name:"Ask question again"}).waitFor();
    assert.equal(providerPosts,1);
    await page.getByRole("button",{name:"Open account menu"}).click();
    await page.getByRole("button",{name:"Sign Out",exact:true}).click();
    await page.getByRole("button",{name:"Sign in",exact:true}).filter({visible:true}).first().waitFor();
    await login(foreign);
    await navigate("Transactions");
    await page.getByText("No transactions found",{exact:true}).waitFor();
    assert.equal(await page.getByText("Pre-upgrade receipt",{exact:true}).count(),0);
    assert.deepEqual(errors,[]);
  } finally {
    globalThis.fetch=originalFetch;
    await browser.close();
  }
}
