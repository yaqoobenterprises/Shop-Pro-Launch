import { english as core } from "./en/core";
import { english as financial } from "./en/financial";
import { english as application } from "./en/application";
import { english as publicCopy } from "./en/public";

export const en = { ...core, ...financial, ...application, ...publicCopy } as const;
