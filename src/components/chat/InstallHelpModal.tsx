import { Modal } from "../common/Modal";
import React from "react";
import { Smartphone, Monitor, Apple, AlertTriangle } from "lucide-react";
import { useI18n } from "../../i18n";

interface InstallHelpModalProps {
  onClose: () => void;
}

export const InstallHelpModal: React.FC<InstallHelpModalProps> = ({
  onClose,
}) => {
  const { t } = useI18n();
  return (
    <Modal isOpen onClose={onClose} title={t("install.title")} maxWidth="md">
        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm text-on-surface">
          <p className="text-secondary text-xs leading-relaxed">
            {t("install.description")}
          </p>

          {/* Android Guide */}
          <div className="p-3.5 rounded-xl border border-border-standard bg-surface-container-low space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-on-surface">
              <Smartphone className="w-4 h-4 text-success" />
              <span>{t("install.android")}</span>
            </div>
            <ol className="list-decimal list-inside text-xs text-secondary space-y-1 pl-1">
              <li>{t("install.androidMenu")}</li>
              <li>
                {t("install.installApp")} {t("install.or")}{" "}
                {t("install.addHome")}.
              </li>
              <li>{t("install.confirm")}</li>
            </ol>
          </div>

          {/* iPhone Guide */}
          <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/[0.04] space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-on-surface">
              <Apple className="w-4 h-4 text-primary" />
              <span>{t("install.iphone")}</span>
            </div>
            <div className="text-[11px] font-semibold text-warning bg-warning-bg p-2 rounded-lg border border-warning-border">
              <AlertTriangle className="mr-1 inline h-4 w-4" aria-hidden="true" />{t("install.iphoneWarning")}
            </div>
            <ol className="list-decimal list-inside text-xs text-secondary space-y-1 pl-1">
              <li>
                {t("install.openSafari")}
              </li>
              <li>
                {t("install.share")}
              </li>
              <li>
                {t("install.scrollAdd")}
              </li>
              <li>
                {t("install.tapAdd")}
              </li>
            </ol>
          </div>

          {/* PC Guide */}
          <div className="p-3.5 rounded-xl border border-border-standard bg-surface-container-low space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-on-surface">
              <Monitor className="w-4 h-4 text-primary" />
              <span>{t("install.desktop")}</span>
            </div>
            <ol className="list-decimal list-inside text-xs text-secondary space-y-1 pl-1">
              <li>{t("install.addressBar")}</li>
              <li>
                {t("install.computerIcon")}
              </li>
              <li>{t("install.ownWindow")}</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-surface-container-low border-t border-border-standard flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-on-primary font-semibold text-xs rounded-xl shadow-xs transition-colors"
          >
            {t("install.gotIt")}
          </button>
        </div>
    </Modal>
  );
};
