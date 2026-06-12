import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("LeadFlow Dashboard", () => {
  it("renders the dashboard shell", () => {
    render(<App />);
    expect(screen.getByText("LeadFlow Memory")).toBeInTheDocument();
    expect(screen.getByText("客户长期记忆")).toBeInTheDocument();
  });
});
