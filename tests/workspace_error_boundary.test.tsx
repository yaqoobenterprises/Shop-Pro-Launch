import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WorkspaceErrorBoundary } from "../src/components/common/WorkspaceErrorBoundary";

describe("workspace error recovery",()=>{
  it("shows a safe error instead of financial totals and permits navigation",()=>{
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    const navigate=vi.fn();
    const Broken=()=>{throw new Error("sensitive source detail");};
    try {
      render(<WorkspaceErrorBoundary onOverview={navigate}><Broken/></WorkspaceErrorBoundary>);
      expect(screen.getByRole("alert")).toHaveTextContent("No financial result is available");
      expect(screen.queryByText(/sensitive source detail/)).toBeNull();
      fireEvent.click(screen.getByRole("button",{name:"Go to Overview"}));
      expect(navigate).toHaveBeenCalledOnce();
    } finally {log.mockRestore();}
  });
});
