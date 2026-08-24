import { TaskItem } from "@/lib/mock-data";

export type ThemeKey = "neon" | "ocean" | "amber" | "rose";
export type AiProvider = "openai" | "anthropic" | "compatible";

export interface PublicSettings {
  theme: ThemeKey;
  aiProvider: AiProvider;
  aiModel: string;
  aiBaseUrl: string;
  defaultPriority: TaskItem["priority"];
  autoAddProjectTaskToWeek: boolean;
  autoScheduleConvertedIdea: boolean;
  hermesTokenLast4: string | null;
  hermesTokenCreatedAt: number | null;
  hermesTokenRotatedAt: number | null;
  hermesTokenRevokedAt: number | null;
  hermesTokenAvailable: boolean;
  aiKeyConfigured: boolean;
}

export const themeOptions: {
  key: ThemeKey;
  name: string;
  description: string;
  primary: string;
  secondary: string;
}[] = [
  {
    key: "neon",
    name: "荧光终端",
    description: "绿光与雾紫，保持当前控制台风格",
    primary: "#9cff6d",
    secondary: "#a5b4fc",
  },
  {
    key: "ocean",
    name: "深海蓝青",
    description: "冷静、清透，适合长时间阅读",
    primary: "#54e6d1",
    secondary: "#69a8ff",
  },
  {
    key: "amber",
    name: "琥珀夜航",
    description: "暖金与橙红，更柔和的夜间色调",
    primary: "#ffcb68",
    secondary: "#ff8e68",
  },
  {
    key: "rose",
    name: "玫红夜幕",
    description: "鲜明、偏创作状态的粉紫组合",
    primary: "#ff6fae",
    secondary: "#c79bff",
  },
];

export const defaultSettings: Pick<
  PublicSettings,
  | "theme"
  | "aiProvider"
  | "aiModel"
  | "aiBaseUrl"
  | "defaultPriority"
  | "autoAddProjectTaskToWeek"
  | "autoScheduleConvertedIdea"
> = {
  theme: "neon",
  aiProvider: "openai",
  aiModel: "gpt-4.1-mini",
  aiBaseUrl: "https://api.openai.com/v1/responses",
  defaultPriority: "P2",
  autoAddProjectTaskToWeek: false,
  autoScheduleConvertedIdea: true,
};
