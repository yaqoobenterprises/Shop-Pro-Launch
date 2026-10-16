import type { en } from "./en";
import { urdu as core } from "./ur/core";
import { urdu as financial } from "./ur/financial";
import { urdu as application } from "./ur/application";
import { urdu as publicCopy } from "./ur/public";

export const ur: Record<keyof typeof en, string> = { ...core, ...financial, ...application, ...publicCopy };
