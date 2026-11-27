import React from "react";
import {describe,it,expect} from "vitest";
import {render,screen,fireEvent,within} from "@testing-library/react";
import {FinancialTrend,chartIndex} from "../src/components/common/FinancialTrend";
const rows=[{key:"a",label:"A",title:"Day A",income_paisa:125050,expense_paisa:500,net_profit_paisa:124550,transaction_count:2},{key:"b",label:"B",title:"Day B",income_paisa:0,expense_paisa:1200,net_profit_paisa:-1200,transaction_count:1}];
describe("interactive financial trend",()=>{
 it("clamps nearest point at chart edges",()=>{expect(chartIndex(-10,40,200,3)).toBe(0);expect(chartIndex(240,40,200,3)).toBe(2);expect(chartIndex(140,40,200,3)).toBe(1);expect(chartIndex(239,40,200,3,true)).toBe(2);});
 it("supports keyboard inspection, exact values and clearing",()=>{const {container}=render(<FinancialTrend rows={rows} mode="bars" label="Flow"/>);const inspect=screen.getByRole("button",{name:"Inspect chart values"});fireEvent.focus(inspect);fireEvent.keyDown(inspect,{key:"End"});expect(container.querySelector(".finance-trend__summary")).toHaveTextContent("Day B");expect(container.querySelector(".finance-trend__summary")).toHaveTextContent("Rs 12");fireEvent.keyDown(inspect,{key:"Escape"});expect(screen.queryByRole("button",{name:"Clear chart selection"})).toBeNull();expect(within(screen.getByRole("table",{name:"Flow exact values"})).getByText("Rs 1,250.50")).toBeTruthy();});
 it("renders negative results without fabricating amounts",()=>{const {container}=render(<FinancialTrend rows={rows} mode="result" label="Result"/>);fireEvent.click(screen.getByRole("button",{name:"Next chart period"}));fireEvent.click(screen.getByRole("button",{name:"Next chart period"}));expect(container.querySelector(".finance-trend__summary")).toHaveTextContent("Rs -12");});
});
