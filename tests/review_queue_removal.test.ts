import { describe, it, expect } from "vitest";
import { ledgerService } from "../src/services/ledgerService";

describe("Review Queue Clean Removal", () => {
  it("ledgerService has no review queue methods or dependencies", () => {
    expect((ledgerService as any).getReviewQueueTransactions).toBeUndefined();
    expect((ledgerService as any).getReviewQueueCount).toBeUndefined();
  });

  it("verify that Sidebar source code contains no review queue navigation items or labels", async () => {
    const sidebarSource = await import("../src/components/layout/Sidebar?raw");
    expect(sidebarSource.default).not.toContain("Review Queue");
    expect(sidebarSource.default).not.toContain("review-queue");
    expect(sidebarSource.default).not.toContain("ReviewQueue");
  });

  it("verify that MobileNav source code contains no review queue or closings navigation", async () => {
    const mobileNavSource = await import("../src/components/layout/MobileNav?raw");
    expect(mobileNavSource.default).not.toContain("Review Queue");
    expect(mobileNavSource.default).not.toContain("review-queue");
  });

  it("verify that ConfirmationModal source code has no skip to review action", async () => {
    const modalSource = await import("../src/components/chat/ConfirmationModal?raw");
    expect(modalSource.default).not.toContain("onSkipToReview");
    expect(modalSource.default).not.toContain("Save for review");
    expect(modalSource.default).not.toContain("review queue");
  });

  it("verify that TodayStrip source code has no review queue badge or button", async () => {
    const stripSource = await import("../src/components/chat/TodayStrip?raw");
    expect(stripSource.default).not.toContain("reviewCount");
    expect(stripSource.default).not.toContain("onOpenReviewQueue");
    expect(stripSource.default).not.toContain("needs review");
  });
});
