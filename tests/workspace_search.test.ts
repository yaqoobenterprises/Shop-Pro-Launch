import {describe,it,expect} from "vitest";
import {resolveWorkspaceSearch} from "../src/lib/workspaceSearch";
describe("inline workspace search",()=>{
 it("navigates exact screen names without a popup",()=>{expect(resolveWorkspaceSearch(" Reports ")).toEqual({view:"reports",query:""});expect(resolveWorkspaceSearch("LedgerMate AI")).toEqual({view:"ai",query:""});});
 it("routes other searches to the transaction filter",()=>{expect(resolveWorkspaceSearch("office supplies")).toEqual({view:"sales",query:"office supplies"});expect(resolveWorkspaceSearch(" ")).toBeNull();expect(resolveWorkspaceSearch("constructor")).toEqual({view:"sales",query:"constructor"});});
});
