import React from "react";

type Props = { children: React.ReactNode; onOverview: () => void };
type State = { failed: boolean };

/** A failed route must not be rendered as an empty financial workspace. */
export class WorkspaceErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="page-content flex min-h-48 flex-col items-start justify-center gap-3" aria-labelledby="workspace-error-title">
        <h1 id="workspace-error-title" className="text-xl font-semibold text-on-surface">This screen is unavailable</h1>
        <p role="alert" className="text-sm text-text-muted">Something prevented this screen from opening. No financial result is available. If you were saving an entry, check its status in Transactions before submitting again.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="button button-primary" onClick={() => this.setState({failed:false})}>Try again</button>
          <button type="button" className="button button-secondary" onClick={this.props.onOverview}>Go to Overview</button>
        </div>
      </section>
    );
  }
}
