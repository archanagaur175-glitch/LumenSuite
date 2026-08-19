import { describe, expect, it } from "vitest";
import { blankDoc, colIndex, parseOdf, serializeOdf } from "./odf";
import { collectCalcFormulaErrors, setCalcCell } from "./model";

describe("zip", () => {
  it("round-trips stored and deflated entries", async () => {
    const bytes = await serializeOdf(blankDoc("writer"), "odt");
    expect(bytes.length).toBeGreaterThan(100);
    const back = await parseOdf(bytes, "writer");
    expect(back.kind).toBe("writer");
  });
});

describe("writer round-trip", () => {
  it("preserves headings, paragraphs and lists", async () => {
    const doc = blankDoc("writer");
    if (doc.kind === "writer") doc.blocks.push(
      { id: "x1", type: "h2", text: "Section" },
      { id: "x2", type: "p", text: "Hello & <world>" },
      { id: "x3", type: "ul", text: "item" }
    );
    const bytes = await serializeOdf(doc, "odt");
    const back = (await parseOdf(bytes, "writer"));
    if (back.kind !== "writer") throw new Error("wrong kind");
    expect(back.blocks.map((b) => b.type)).toEqual(["h1", "p", "h2", "p", "ul"]);
    expect(back.blocks.find((b) => b.type === "p" && b.text.includes("Hello"))?.text).toContain("<world>");
    expect(back.blocks.find((b) => b.type === "ul")?.text).toBe("item");
  });
});

describe("calc", () => {
  it("colIndex converts A/Z/AA", () => {
    expect(colIndex("A")).toBe(0);
    expect(colIndex("Z")).toBe(25);
    expect(colIndex("AA")).toBe(26);
  });

  it("setCalcCell inserts and deletes", () => {
    let doc = blankDoc("calc");
    if (doc.kind !== "calc") throw new Error("wrong kind");
    doc = setCalcCell(doc, 0, 0, 0, "42");
    expect(doc.sheets[0].cells["A1"]).toEqual({ v: "42" });
    doc = setCalcCell(doc, 0, 0, 0, "");
    expect(doc.sheets[0].cells["A1"]).toBeUndefined();
  });

  it("detects broken references", () => {
    let doc = blankDoc("calc");
    if (doc.kind !== "calc") throw new Error("wrong kind");
    doc = setCalcCell(doc, 0, 0, 1, "x", "=A1+1");
    const errors = collectCalcFormulaErrors(doc);
    expect(errors).toEqual([]);
  });
});

describe("impress round-trip", () => {
  it("preserves slides and notes", async () => {
    const doc = blankDoc("impress");
    if (doc.kind !== "impress") throw new Error("wrong kind");
    doc.slides[0].title = "Intro";
    doc.slides[0].body = "Point one";
    doc.slides[0].notes = "say hello";
    const bytes = await serializeOdf(doc, "odp");
    const back = (await parseOdf(bytes, "impress"));
    if (back.kind !== "impress") throw new Error("wrong kind");
    expect(back.slides[0].title).toBe("Intro");
    expect(back.slides[0].body).toBe("Point one");
  });
});