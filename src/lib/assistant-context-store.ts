import { getFreebusyRange } from "@/lib/freebusy-store";
import { getMemories } from "@/lib/memory-store";
import { listReviews } from "@/lib/review-store";
import { getProjects, getTasks } from "@/lib/server-store";

export function getAssistantContext(userId: string, from: unknown, to: unknown) {
  const freebusy = getFreebusyRange(userId, from, to);
  return {
    generatedAt: Date.now(),
    timezone: "Asia/Shanghai" as const,
    range: { from: freebusy.from, to: freebusy.to },
    tasks: getTasks(userId),
    projects: getProjects(userId),
    freebusy,
    reviews: {
      daily: listReviews(userId, "daily", freebusy.from, freebusy.to),
      weekly: listReviews(userId, "weekly"),
    },
    confirmedMemories: getMemories(userId).filter((memory) => memory.confirmed),
  };
}
