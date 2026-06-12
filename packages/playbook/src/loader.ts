import { readFile } from "fs/promises";
import YAML from "yaml";
import { ConversionPlaybook, ConversionPlaybookSchema } from "./schema.js";

export function loadPlaybookFromString(input: string): ConversionPlaybook {
  const parsed = YAML.parse(input);
  return ConversionPlaybookSchema.parse(parsed);
}

export async function loadPlaybookFromFile(path: string): Promise<ConversionPlaybook> {
  const file = await readFile(path, "utf8");
  return loadPlaybookFromString(file);
}
