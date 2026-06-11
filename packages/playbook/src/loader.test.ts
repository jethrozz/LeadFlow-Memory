import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadPlaybookFromString } from "./loader.js";

describe("playbook loader", () => {
  it("loads the Chongqing real estate playbook", async () => {
    const yaml = await readFile(
      "../../playbooks/real-estate-chongqing.yml",
      "utf8",
    );
    const playbook = loadPlaybookFromString(yaml);

    expect(playbook.id).toBe("real-estate-chongqing");
    expect(playbook.primary_goals).toContain("get_wechat");
    expect(playbook.profile_fields.map((field) => field.key)).toContain(
      "budget",
    );
    expect(playbook.conversation_rules.length).toBeGreaterThan(0);
  });
});
