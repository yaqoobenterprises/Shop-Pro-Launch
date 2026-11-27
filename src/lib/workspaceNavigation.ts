/** Browser history for the seven existing workspace views. No finance state is stored in URLs. */
export const WORKSPACE_VIEWS = ["dashboard", "chat", "sales", "accounts", "reports", "ai", "settings"] as const;
export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number];

export const readWorkspaceView = (pathname: string): WorkspaceView | null => {
  const segments = pathname.split("/");
  const view = segments[2] as WorkspaceView;
  const validLength = segments.length === 3 || (segments.length === 4 && segments[3] === "");
  return validLength && segments[0] === "" && segments[1] === "workspace" && WORKSPACE_VIEWS.includes(view)
    ? view
    : null;
};

export const workspacePath = (view: WorkspaceView) => `/workspace/${view}`;

/** Only clean application URLs (plus the accessible skip-link fragment) are rewritten. */
export const canNavigateWorkspace = (location: Pick<Location, "pathname" | "search" | "hash">): boolean =>
  !location.search && (!location.hash || location.hash === "#main-content") &&
  (location.pathname === "/" || readWorkspaceView(location.pathname) !== null);
