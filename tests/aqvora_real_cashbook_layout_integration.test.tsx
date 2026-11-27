import React from "react";
import {describe,expect,it,vi} from "vitest";
import {fireEvent,render,screen} from "@testing-library/react";
import {ChatFeed} from "../src/components/chat/ChatFeed";
import type {Transaction} from "../src/types/ledger";

vi.mock("../src/i18n",()=>({
  useI18n:()=>({t:(value:string)=>value}),
}));
vi.mock("../src/components/common/TransactionDetailModal",()=>({
  TransactionDetailModal:()=>null,
}));

const action=vi.fn();
const emptyProps={
  drafts:[],accounts:[],canManageTransactions:false,
  onEdit:action,onVoid:action,onRestore:action,
  onAssignDraft:async()=>{},
};

describe("AQVORA real Cashbook Poital.finish integration",()=>{
  it("keeps recorded entries visible within a compact accessible activity card",()=>{
    const transaction={
      id:"cashbook-integration-test",category_name:"Sale",type:"income",
      status:"active",amount_paisa:1850000,
    } as Transaction;
    render(<ChatFeed {...emptyProps} transactions={[transaction]}/>);
    expect(screen.getByRole("heading",{name:"Today's activity"})).toBeTruthy();
    expect(screen.getByLabelText("1 recorded entry")).toBeTruthy();
    expect(screen.getByLabelText("Today's cashbook activity")).toBeTruthy();
    expect(screen.getByText("Sale")).toBeTruthy();
  });
  it("keeps empty-day cashbook and real entry action usable",()=>{
    const startEntry=vi.fn();
    render(<ChatFeed {...emptyProps} transactions={[]} onStartEntry={startEntry}/>);
    expect(screen.getByRole("heading",{name:"Today's activity"})).toBeTruthy();
    expect(screen.getByRole("status",{name:"No cashbook entries today"})).toBeTruthy();
    expect(screen.getByText("No entries today")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:/Record an entry/}));
    expect(startEntry).toHaveBeenCalledOnce();
  });
  it("does not present entry CTA when no input can accept a transaction",()=>{
    render(<ChatFeed {...emptyProps} transactions={[]}/>);
    expect(screen.queryByRole("button",{name:/Record an entry/})).toBeNull();
  });
  it("does not claim an empty day before loading or after a failed read", () => {
    const {rerender}=render(<ChatFeed {...emptyProps} transactions={[]} loading/>);
    expect(screen.getByText("Loading activity…")).toBeTruthy();
    expect(screen.queryByText("No entries today")).toBeNull();
    rerender(<ChatFeed {...emptyProps} transactions={[]} unavailable/>);
    expect(screen.getByText(/Activity unavailable/)).toBeTruthy();
    expect(screen.queryByText("No entries today")).toBeNull();
  });

});
