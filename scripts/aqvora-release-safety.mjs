/** Release-preflight build gate. Never ship sample-first or V2 staging
 * permissions into the existing public Shop Pro channel by accident.
 * This is a build safety belt, not a substitute for server-side RLS or MFA.
 */
export function forbiddenAQVORAReleaseFlags(environment){
  return Object.entries(environment).filter(([key,value])=>
    value==="true"&&(
      key==="VITE_AQVORA_PREVIEW_DEFAULT"||
      key==="VITE_ENABLE_COMPANY_SETUP_WIZARD"||
      key.startsWith("VITE_ENABLE_AQVORA_")
    ),
  ).map(([key])=>key).sort();
}
export function assertAQVORAReleaseSafety(environment,target){
  if(target!=="production")return;
  const unsafe=forbiddenAQVORAReleaseFlags(environment);
  if(unsafe.length>0){
    throw new Error(
      "AQVORA production build blocked: preview/staging features are enabled: "+
      unsafe.join(", ")+". Keep financial writers and sample-first OFF. "+
      "Use a separate, founder-approved synthetic staging release.",
    );
  }
}
