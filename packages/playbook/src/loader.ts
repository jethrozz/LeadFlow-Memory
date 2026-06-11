import { readFile } from "node:fs/promises";
import YAML from "yaml";
import {
  ConversionPlaybookSchema,
  type ConversionPlaybook,
} from "./schema.js";

export function loadPlaybookFromString(input: string): ConversionPlaybook {
  const parsed = YAML.parse(input);
  return ConversionPlaybookSchema.parse(parsed);
}

export async function loadPlaybookFromFile(
  path: string,
): Promise<ConversionPlaybook> {
  const file = await readFile(path, "utf8");
  return loadPlaybookFromString(file);
}
