import React from "react";
import { ArrowLeft, BookOpenText, ShieldCheck, PanelsTopLeft } from "lucide-react";

import { APP_NAME } from "../../config/app";

interface AuthFrameProps {
  children: React.ReactNode;
  onBack?: () => void;
}

export const AuthFrame: React.FC<AuthFrameProps> = ({ children, onBack }) => (
  <div className="auth-screen aq-auth">
    <aside className="aq-auth__story" aria-label={APP_NAME}>
      <div className="aq-auth__story-inner">
        <div className="aq-auth__brand">
          <PanelsTopLeft size={28} aria-hidden="true" />
          <strong>{APP_NAME}</strong>
        </div>
        <div className="aq-auth__story-copy">
          <span className="aq-auth__eyebrow">YOUR BUSINESS WORKSPACE</span>
          <h2>Clarity for every business day.</h2>
          <p>Your cashbook, accounts and reports. Together.</p>
          <div className="aq-auth__story-points">
            <span><BookOpenText size={18} aria-hidden="true" /> Organized transactions</span>
            <span><ShieldCheck size={18} aria-hidden="true" /> Account-level access controls</span>
          </div>
        </div>
        <span className="aq-auth__preview-note">{APP_NAME}</span>
      </div>
    </aside>
    <div className="aq-auth__main">
      <div className="aq-auth__mobile-brand">
        <PanelsTopLeft size={28} aria-hidden="true" />
        <strong>{APP_NAME}</strong>
      </div>
      <div className="aq-auth__main-inner">
        {onBack && (
          <button type="button" className="aq-auth__back" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" /> Back to home
          </button>
        )}
        {children}
      </div>
      <div className="aq-auth__main-footer">{APP_NAME}</div>
    </div>
  </div>
);
