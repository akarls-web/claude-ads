import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatScore(score: number): string {
  return Math.round(score).toString();
}

export function gradeColor(grade: string): string {
  const colors: Record<string, string> = {
    A: "text-emerald",
    B: "text-emerald",
    C: "text-harvest",
    D: "text-orange-500",
    F: "text-signal",
  };
  return colors[grade] ?? "text-text-secondary";
}

export function gradeBg(grade: string): string {
  const colors: Record<string, string> = {
    A: "bg-emerald/10 text-emerald",
    B: "bg-emerald/10 text-emerald",
    C: "bg-harvest/10 text-harvest",
    D: "bg-orange-400/10 text-orange-500",
    F: "bg-signal/10 text-signal",
  };
  return colors[grade] ?? "bg-brand-wash text-brand";
}

export function resultBadgeClasses(result: string): string {
  switch (result) {
    case "pass":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "warning":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "fail":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "skipped":
      return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    default:
      return "bg-gray-100 text-gray-600";
  }
}
