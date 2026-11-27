import React from "react";
import {describe,it,expect} from "vitest";
import {render,screen,fireEvent} from "@testing-library/react";
import {FinancialDonut,financialSlices} from "../src/components/common/FinancialDonut";
describe("financial donut",()=>{
 it("allocates positive recorded amounts and excludes nonpositive balances",()=>{const x=financialSlices([{key:"a",label:"Bank",amount:7500},{key:"b",label:"Cash",amount:2500},{key:"c",label:"Debt",amount:-50}]);expect(x.total).toBe(10000);expect(x.slices.map(s=>s.share)).toEqual([75,25]);});
 it("preserves exact value and supports keyboard inspection",()=>{render(<FinancialDonut label="Allocation" items={[{key:"a",label:"Bank",amount:125050},{key:"b",label:"Cash",amount:500}]}/>);const bank=screen.getByRole("button",{name:/Bank/});fireEvent.focus(bank);expect(screen.getAllByText("Rs 1,250.50").length).toBeGreaterThan(1);});
 it("keeps a selected legend item pinned and clears it on Escape",()=>{render(<FinancialDonut label="Allocation" items={[{key:"a",label:"Cash",amount:100},{key:"b",label:"Bank",amount:300}]}/>);const button=screen.getByRole("button",{name:/Cash/});fireEvent.click(button);expect(button).toHaveAttribute("aria-pressed","true");fireEvent.keyDown(button,{key:"Escape"});expect(button).toHaveAttribute("aria-pressed","false");});
 it("does not invent a total beyond safe minor-unit precision",()=>{expect(financialSlices([{key:"a",label:"A",amount:Number.MAX_SAFE_INTEGER},{key:"b",label:"B",amount:1}]).total).toBeNull();});
});
