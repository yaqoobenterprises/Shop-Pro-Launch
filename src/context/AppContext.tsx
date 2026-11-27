import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useAuth } from "./AuthContext";
import { EntryMode, getUserPreferences } from "../services/userPreferencesService";
import { isFeatureEnabled } from "../config/features";
import { readWorkspaceView, workspacePath, type WorkspaceView } from "../lib/workspaceNavigation";

export type AppView = WorkspaceView;

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  message?: string;
}

interface AppContextType {
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  entryMode: EntryMode;
  setEntryMode: (mode: EntryMode) => void;
  dataVersion: number;
  refreshData: () => void;
  toasts: ToastMessage[];
  showToast: (
    type: ToastMessage["type"],
    title: string,
    message?: string,
  ) => void;
  removeToast: (id: string) => void;
  isQuickExpenseOpen: boolean;
  setIsQuickExpenseOpen: (open: boolean) => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
  isShortcutsHelpOpen: boolean;
  setIsShortcutsHelpOpen: (open: boolean) => void;
  newEntryRequestId: number;
  startNewEntry: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();
  const entryModesEnabled = isFeatureEnabled("entryModes");
  const [currentView, setView] = useState<AppView>(() => readWorkspaceView(window.location.pathname) ?? "dashboard");
  const setCurrentView = useCallback((view: AppView) => {
    setView(view);
    // Never overwrite OAuth callbacks, recovery tokens or unrelated routes.
    const { pathname, search, hash } = window.location;
    if (!search && !hash && (pathname === "/" || readWorkspaceView(pathname))) {
      const target = workspacePath(view);
      if (pathname !== target) window.history.pushState(null, "", target);
    }
  }, []);
  useEffect(() => {
    const restoreView = () => {
      const view = readWorkspaceView(window.location.pathname);
      if (view || window.location.pathname === "/") {
        setView(view ?? "dashboard");
        setIsCommandPaletteOpen(false);
        setIsShortcutsHelpOpen(false);
        setIsQuickExpenseOpen(false);
      }
    };
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, []);
  const [entryMode, setEntryMode] = useState<EntryMode>("chat");
  const [dataVersion, setDataVersion] = useState<number>(1);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isQuickExpenseOpen, setIsQuickExpenseOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] =
    useState<boolean>(false);
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] =
    useState<boolean>(false);
  const [newEntryRequestId, setNewEntryRequestId] = useState(0);

  useEffect(() => {
    let active = true;
    if (!entryModesEnabled || !user?.id) {
      setEntryMode("chat");
      return () => {
        active = false;
      };
    }
    void getUserPreferences(user.id).then((preferences) => {
      if (active) setEntryMode(preferences.entry_mode);
    });
    return () => {
      active = false;
    };
  }, [entryModesEnabled, user?.id]);

  const refreshData = useCallback(() => {
    setDataVersion((v) => v + 1);
  }, []);

  const showToast = useCallback(
    (type: ToastMessage["type"], title: string, message?: string) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, type, title, message }]);

      // Auto dismiss after 4 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const startNewEntry = useCallback(() => {
    setCurrentView("chat");
    setNewEntryRequestId((requestId) => requestId + 1);
  }, [setCurrentView]);

  useEffect(() => {
    if (currentView !== "chat") setNewEntryRequestId(0);
  }, [currentView]);

  // Global Keyboard Shortcuts (Ctrl+K, Ctrl+N, Ctrl+Shift+E, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || !user) return;
      if (e.key !== "Escape" && document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      // Ctrl+K -> Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Ctrl+N moves focus to the currently selected entry method.
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "n"
      ) {
        e.preventDefault();
        startNewEntry();
        return;
      }

      // Ctrl+Shift+E -> New Quick Expense
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "e"
      ) {
        e.preventDefault();
        setIsQuickExpenseOpen(true);
        return;
      }

      // Escape -> close dialogs
      if (e.key === "Escape") {
        if (isCommandPaletteOpen) setIsCommandPaletteOpen(false);
        if (isQuickExpenseOpen) setIsQuickExpenseOpen(false);
        if (isShortcutsHelpOpen) setIsShortcutsHelpOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isCommandPaletteOpen,
    isQuickExpenseOpen,
    isShortcutsHelpOpen,
    startNewEntry,
    user,
  ]);

  return (
    <AppContext.Provider
      value={{
        currentView,
        setCurrentView,
        entryMode,
        setEntryMode,
        dataVersion,
        refreshData,
        toasts,
        showToast,
        removeToast,
        isQuickExpenseOpen,
        setIsQuickExpenseOpen,
        isCommandPaletteOpen,
        setIsCommandPaletteOpen,
        isShortcutsHelpOpen,
        setIsShortcutsHelpOpen,
        newEntryRequestId,
        startNewEntry,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
