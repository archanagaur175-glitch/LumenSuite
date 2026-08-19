export type ModuleKind = "writer" | "calc" | "impress";

export type DocKind = "writer" | "calc" | "impress";

export interface WriterBlock {
  id: string;
  type: "p" | "h1" | "h2" | "h3" | "ul";
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export interface WriterDoc {
  kind: "writer";
  blocks: WriterBlock[];
}

export interface CalcCell {
  v: string;
  f?: string;
}

export interface CalcSheet {
  name: string;
  cells: Record<string, CalcCell>;
}

export interface CalcDoc {
  kind: "calc";
  sheets: CalcSheet[];
}

export interface ImpressSlide {
  id: string;
  title: string;
  body: string;
  notes?: string;
}

export interface ImpressDoc {
  kind: "impress";
  slides: ImpressSlide[];
}

export type DocModel = WriterDoc | CalcDoc | ImpressDoc;

export interface Tab {
  id: string;
  title: string;
  kind: DocKind;
  path: string | null;
  dirty: boolean;
  sourceFormat: "odt" | "ods" | "odp" | "docx" | "xlsx" | "pptx" | "json";
}

export interface EngineStatus {
  running: boolean;
  pid: number | null;
  port: number | null;
  profileDir: string | null;
  loVersion: string | null;
  lastNetworkRequest: "none";
  engineAvailable: boolean;
  degraded: boolean;
  degradedReason: string | null;
}

export interface ConvertResult {
  path: string;
}

export interface FidelityNotice {
  docId: string;
  message: string;
}