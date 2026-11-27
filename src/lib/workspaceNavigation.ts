/** Browser history for the seven existing workspace views. No finance state is stored in URLs. */
export const WORKSPACE_VIEWS = ["dashboard", "chat", "sales", "accounts", "reports", "ai", "settings"] as const;
export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number];

export const readWorkspaceView = (pathname: string): WorkspaceView | null => {
  const match = /^\\/workspace\\/([a-z]+)\\/?$/.exec(pathname);
  return match && WORKSPACE_VIEWS.includes(match[1] as WorkspaceView)
    ? match[1] as WorkspaceView
    : null;
};

export const workspacePath = (view: WorkspaceView) => `/workspace/${view}`;
