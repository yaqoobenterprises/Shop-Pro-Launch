import {beforeEach,describe,expect,it,vi} from "vitest";
import {
  clearPendingManualJournal,readPendingManualJournal,reserveManualJournal,
  validateManualJournalLines,
} from "../src/accounting/pendingManualJournal";

const ORG="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER="11111111-1111-4111-8111-111111111111";
const CASH="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CAPITAL="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const INTENT="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const date="2026-11-20";
const lines=[
  {account_id:CASH,debit_minor:"10000",credit_minor:"0"},
  {account_id:CAPITAL,debit_minor:"0",credit_minor:"10000"},
];
beforeEach(()=>{
  sessionStorage.clear();
  vi.stubGlobal("crypto",{randomUUID:()=>INTENT});
});
describe("AQVORA original manual journal intent persistence",()=>{
  it("reserves exact financial payload before posting, never silently rekeys",()=>{
    const reserved=reserveManualJournal(ORG,USER,"PKR",date,lines);
    expect(reserved.request.intent_key).toBe(INTENT);
    expect(readPendingManualJournal(ORG,USER)).toEqual(reserved);
    expect(reserved.request.lines).toEqual(lines);
    expect(validateManualJournalLines(lines)).toBe("10000");
    lines[0].account_id=CASH;
    expect(()=>reserveManualJournal(ORG,USER,"PKR",date,lines))
      .toThrow(/Resolve the original/);
    const altered={...reserved,request:{...reserved.request,intent_key:ORG}};
    expect(()=>clearPendingManualJournal(altered)).toThrow(/intent changed/);
    expect(readPendingManualJournal(ORG,USER)).toEqual(reserved);
    clearPendingManualJournal(reserved);
    expect(readPendingManualJournal(ORG,USER)).toBeNull();
  });
  it("keeps an original uncertain financial intent locked after malformed persistence",()=>{
    reserveManualJournal(ORG,USER,"PKR",date,lines);
    const key=sessionStorage.key(0);
    expect(key).toContain("pending-manual-journal:");
    sessionStorage.setItem(key!,"{corrupt");
    expect(()=>readPendingManualJournal(ORG,USER)).toThrow(/corrupt/);
    expect(()=>reserveManualJournal(ORG,USER,"PKR",date,lines)).toThrow(/corrupt/);
    sessionStorage.setItem(key!,JSON.stringify({
      organizationId:ORG,userId:USER,currency:"PKR",
      request:{organization_id:ORG,intent_key:INTENT,
        business_date:date,lines:[{...lines[0]}, {...lines[1],credit_minor:"9999"}]},
    }));
    expect(()=>readPendingManualJournal(ORG,USER)).toThrow(/invalid/);
  });
  it("rejects imbalance, guessed decimals, negative, oversized or unsafe line shapes",()=>{
    const bad=[
      [{...lines[0],debit_minor:"10001"},lines[1]],
      [{...lines[0],debit_minor:"100.00"},lines[1]],
      [{...lines[0],debit_minor:"-1"},lines[1]],
      [{...lines[0],debit_minor:"01"},lines[1]],
      [{...lines[0],debit_minor:"9223372036854775808"},
        {...lines[1],credit_minor:"9223372036854775808"}],
      [{...lines[0],credit_minor:"1"},lines[1]],
      [{...lines[0],party_id:"fake"},lines[1]],
      [lines[0]],
    ];
    for(const input of bad){
      expect(()=>validateManualJournalLines(input)).toThrow();
    }
    expect(()=>reserveManualJournal(ORG,USER,"USD","2026-11-31",lines))
      .toThrow(/Invalid original journal/);
    expect(()=>reserveManualJournal(ORG,USER,"PKR",date,[
      {...lines[0],account_id:USER},lines[1],
    ])).not.toThrow();
  });
  it("separates company and actor intents without leaking one to another",()=>{
    const other="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const a=reserveManualJournal(ORG,USER,"PKR",date,lines);
    expect(readPendingManualJournal(ORG,other)).toBeNull();
    expect(readPendingManualJournal(other,USER)).toBeNull();
    const b=reserveManualJournal(other,USER,"PKR",date,[
      {...lines[0],account_id:other},lines[1],
    ]);
    expect(b.organizationId).toBe(other);
    clearPendingManualJournal(a);
    expect(readPendingManualJournal(other,USER)).toEqual(b);
  });
});
