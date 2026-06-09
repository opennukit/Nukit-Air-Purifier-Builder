// External URLs the workbench links out to: web searches for purchasable
// parts and the source-file pages of curated static print references.

import { staticPrintReferenceForPreset } from "@/domain/purifier/designPresets";
import type { LayoutResult } from "@/fabrication/purifierLayout";

export function webSearchUrl(query: string): string {
  const params = new URLSearchParams({ q: query });
  return `https://www.google.com/search?${params.toString()}`;
}

export function staticReferenceFilesUrl(currentLayout: LayoutResult): string {
  const sourceUrl =
    staticPrintReferenceForPreset(currentLayout.configuration.printDesign)?.sourceUrl ??
    currentLayout.configuration.printDesign.sourceUrl;
  if (sourceUrl === undefined) {
    return "https://www.printables.com/";
  }
  return sourceUrl.endsWith("/files") ? sourceUrl : `${sourceUrl}/files`;
}
