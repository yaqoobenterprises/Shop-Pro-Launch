import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "./Button";
export class WorkspaceErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("Workspace view could not render:", error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="page-content"><div className="empty-state" role="alert"><AlertCircle size={28} aria-hidden="true" /><h2>This screen could not load</h2><p>Reload the workspace to try again. Your saved entries and pending offline work are kept.</p><Button variant="outline" onClick={() => window.location.reload()}><RefreshCw size={16} />Reload workspace</Button></div></div>;
  }
}
