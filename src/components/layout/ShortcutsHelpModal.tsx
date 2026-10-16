import React from "react";
import { Modal } from "../common/Modal";
import { useApp } from "../../context/AppContext";
import { useI18n } from "../../i18n";

export const ShortcutsHelpModal: React.FC = () => {
  const { isShortcutsHelpOpen, setIsShortcutsHelpOpen } = useApp();
  const { t } = useI18n();

  const shortcuts = [
    { key: "Ctrl + K", desc: t("shortcuts.palette") },
    { key: "Ctrl + N", desc: t("shortcuts.newEntry") },
    { key: "Ctrl + Shift + E", desc: t("shortcuts.quickExpense") },
    { key: "Escape", desc: t("shortcuts.closeDialog") },
  ];

  return (
    <Modal
      isOpen={isShortcutsHelpOpen}
      onClose={() => setIsShortcutsHelpOpen(false)}
      title={t("shortcuts.title")}
      description={t("shortcuts.description")}
      maxWidth="md"
    >
      <div className="space-y-2 py-2">
        {shortcuts.map((s) => (
          <div
            key={s.key}
            className="flex items-center justify-between rounded-xl border border-border-standard bg-surface-container-low p-3"
          >
            <span className="text-xs font-medium text-on-surface">{s.desc}</span>
            <kbd className="rounded-md border border-border-standard bg-surface-bright px-2 py-1 font-mono text-xs font-semibold text-primary shadow-xs">
              {s.key}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
};
