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
