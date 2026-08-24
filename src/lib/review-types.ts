export type ReviewPeriodType = "daily" | "weekly";

export type CarryoverAction = "move_next_day" | "return_to_week";

export interface ReviewMetrics {
  periodStart: string;
  periodEnd: string;
  plannedCount: number;
  plannedDoneCount: number;
  completedCount: number;
  plannedMinutes: number;
  focusedMinutes: number;
  habitCompleted: number;
  habitTotal: number;
  habitRate: number;
  carryoverCount: number;
}

export interface ReviewRecord {
  id: string;
  periodType: ReviewPeriodType;
  periodStart: string;
  periodEnd: string;
  wins: string;
  blockers: string;
  nextAction: string;
  notes: string;
  metrics: ReviewMetrics;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewInput {
  periodType: ReviewPeriodType;
  periodStart: string;
  wins?: string;
  blockers?: string;
  nextAction?: string;
  notes?: string;
}

export interface DailyStats extends ReviewMetrics {
  date: string;
}

export interface StatsPayload {
  from: string;
  to: string;
  days: DailyStats[];
  totals: ReviewMetrics;
}

export interface CarryoverTask {
  id: string;
  title: string;
  priority: "P1" | "P2" | "P3";
  action: CarryoverAction;
}

export interface CarryoverResult {
  sourceDate: string;
  targetDate: string;
  moved: CarryoverTask[];
  returnedToWeek: CarryoverTask[];
  skipped: CarryoverTask[];
  alreadyApplied: boolean;
}

export interface StalledNextAction {
  id: string;
  title: string;
  priority: "P1" | "P2" | "P3";
  dueDate: string | null;
}

export interface StalledProject {
  id: string;
  name: string;
  description: string | null;
  dueDate: string | null;
  lastActivityAt: number;
  idleDays: number;
  openTaskCount: number;
  nextAction: StalledNextAction | null;
}

export interface MemoryValue {
  [key: string]: unknown;
}

export type MemoryCategory = "explicit" | "preference" | "behavior" | "context";
export type MemorySource = "user" | "inferred" | "system";

export interface AgentMemory {
  id: string;
  category: MemoryCategory;
  key: string;
  value: unknown;
  source: MemorySource;
  evidenceCount: number;
  confidence: number;
  confirmed: boolean;
  lastEvidenceAt: number;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryInput {
  category: MemoryCategory;
  key: string;
  value: unknown;
  source?: MemorySource;
  evidenceCount?: number;
  confidence?: number;
  confirmed?: boolean;
  expiresAt?: number | null;
}

export interface MemoryObservationCandidate {
  category: "behavior" | "preference";
  key: string;
  value: Record<string, unknown>;
  evidenceCount: number;
  confidence: number;
  confirmed: boolean;
}

export interface MemoryObservationResult {
  candidates: MemoryObservationCandidate[];
  skipped: {
    key: string;
    evidenceCount: number;
    requiredEvidence: number;
  }[];
}
