import {createHmac,randomBytes,randomUUID} from "node:crypto";
import {createClient,type SupabaseClient} from "@supabase/supabase-js";
export type LocalIdentity={id:string;client:SupabaseClient;token:string;lowToken:string};
export const localAuthOptions={auth:{autoRefreshToken:false,persistSession:false}};
function totp(secret:string){let bits=0,value=0;const bytes:number[]=[];
  for(const c of secret.toUpperCase().replace(/=+$/,"")){const digit="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c);
    if(digit<0)throw new Error("Invalid Auth TOTP secret");value=(value<<5)|digit;bits+=5;
    if(bits>=8){bytes.push((value>>>(bits-=8))&255);value&=(1<<bits)-1;}}
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac("sha1",Buffer.from(bytes)).update(counter).digest();const offset=digest[digest.length-1]&15;
  return ((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,"0");
}
export async function localIdentity(api:string,anon:string,admin:SupabaseClient):Promise<LocalIdentity>{
  if(!["127.0.0.1","localhost"].includes(new URL(api).hostname))throw new Error("Local Auth only");
  const email=`receipt-${randomUUID()}@example.test`;const password=randomBytes(24).toString("hex");
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});if(created.error)throw created.error;
  const client=createClient(api,anon,localAuthOptions);const signed=await client.auth.signInWithPassword({email,password});
  if(signed.error||!signed.data.session)throw signed.error??new Error("Auth session missing");
  const lowToken=signed.data.session.access_token;const factor=await client.auth.mfa.enroll({factorType:"totp"});
  if(factor.error)throw factor.error;
  const verified=await client.auth.mfa.challengeAndVerify({factorId:factor.data.id,code:totp(factor.data.totp.secret)});
  if(verified.error)throw verified.error;const session=await client.auth.getSession();const token=session.data.session!.access_token;
  if(JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString()).aal!=="aal2")throw new Error("MFA JWT missing AAL2");
  return {id:created.data.user!.id,client,token,lowToken};
}
