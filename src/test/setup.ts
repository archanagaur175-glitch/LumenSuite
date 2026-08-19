import { DOMParser } from "@xmldom/xmldom";

(globalThis as Record<string, unknown>).DOMParser = DOMParser;