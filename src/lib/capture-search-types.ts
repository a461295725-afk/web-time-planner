export type CaptureKind = "task" | "idea" | "reading";

export type SearchKind = CaptureKind | "project";

export type SearchType = "all" | SearchKind;

export type SearchStatus =
  | "all"
  | "open"
  | "done"
  | "unread"
  | "read"
  | "inbox";

export interface SearchResultMeta {
  priority?: "P1" | "P2" | "P3";
  done?: boolean;
  scheduledDate?: string | null;
  projectId?: string | null;
  isRead?: boolean;
  url?: string;
  source?: string;
}

export interface SearchResult {
  type: SearchKind;
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string;
  createdAt: number;
  updatedAt: number;
  href: string;
  meta: SearchResultMeta;
}

export interface SearchResponse {
  query: string;
  type: SearchType;
  status: SearchStatus;
  inbox: boolean;
  total: number;
  items: SearchResult[];
}

export interface InboxItem {
  type: CaptureKind;
  kind: CaptureKind;
  id: string;
  title: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  href: string;
  meta: SearchResultMeta;
}

export interface InboxResponse {
  type: "all" | CaptureKind;
  total: number;
  counts: Record<"all" | CaptureKind, number>;
  items: InboxItem[];
}

export interface CaptureInput {
  kind?: CaptureKind;
  type?: CaptureKind;
  title?: string;
  content?: string;
  url?: string;
  notes?: string;
  priority?: "P1" | "P2" | "P3";
}

export interface CapturedTask {
  id: string;
  title: string;
  description: string;
  priority: "P1" | "P2" | "P3";
  done: false;
  scheduledDate: null;
  projectId: null;
  createdAt: number;
  updatedAt: number;
}

export interface CapturedIdea {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface CapturedReading {
  id: string;
  url: string;
  normalizedUrl: string;
  title: string;
  notes: string;
  isRead: boolean;
  source: string;
  createdAt: number;
  updatedAt: number;
}

export interface CaptureResponse {
  kind: CaptureKind;
  type: CaptureKind;
  existed: boolean;
  item: CapturedTask | CapturedIdea | CapturedReading;
}

export interface TaskDetail {
  id: string;
  title: string;
  description: string;
  priority: "P1" | "P2" | "P3";
  status: "todo" | "done" | "overdue";
  done: boolean;
  scheduledDate: string | null;
  showInWeekPlan: boolean;
  projectId: string | null;
  dueDate: string | null;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}
