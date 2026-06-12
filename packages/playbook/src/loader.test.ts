import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { loadPlaybookFromFile } from "./loader.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

describe("loadPlaybookFromFile", () => {
  it("loads real-estate-chongqing.yml correctly", async () => {
    const yamlPath = resolve(__dirname, "../../../playbooks/real-estate-chongqing.yml");
    const playbook = await loadPlaybookFromFile(yamlPath);

    expect(playbook.id).toBe("real-estate-chongqing");
    expect(playbook.primary_goals).toContain("get_wechat");
    expect(playbook.profile_fields.some((f) => f.key === "budget")).toBe(true);
    expect(playbook.conversation_rules.length).toBeGreaterThan(0);
  });
});
