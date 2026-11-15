/** Minimal response types for assertions; runtime shape is checked by contract tests. */
export interface Result {
  id: string;
  name: string;
  description: string | null;
  status: string;
  assigneeId: string | null;
  taskCount: number;
  position: string;
  body: string;
  author: { id: string; name: string } | null;
  commentCount: number;
  error: string;
  details: { path: string; message: string }[];
  refreshToken: string;
}
export interface Page {
  items: Result[];
  nextCursor: string | null;
}
export interface Board {
  columns: {
    status: string;
    tasks: Result[];
    total: number;
    hasMore: boolean;
    nextCursor: string | null;
  }[];
}
export function at<T>(rows: T[], index: number): T {
  const row = rows[index];
  if (row === undefined) throw new Error('Missing fixture');
  return row;
}
