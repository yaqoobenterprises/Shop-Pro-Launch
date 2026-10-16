import { useEffect, useState } from "react";
import type { EntryMode } from "../../services/userPreferencesService";

export type EntryInputMode = "chat" | "standard";

export function useEntryInputMode(entryMode: EntryMode, newEntryRequestId: number) {
  const [activeEntryInput, setActiveEntryInput] = useState<EntryInputMode>(
    entryMode === "standard" ? "standard" : "chat",
  );

  useEffect(() => {
    setActiveEntryInput(entryMode === "standard" ? "standard" : "chat");
  }, [entryMode]);

  useEffect(() => {
    if (newEntryRequestId > 0) {
      setActiveEntryInput(entryMode === "chat" ? "chat" : "standard");
    }
  }, [entryMode, newEntryRequestId]);

  return { activeEntryInput, setActiveEntryInput };
}
