// External URLs the workbench links out to: the source-file pages of
// curated static print references.

import { staticPrintReferenceForPreset } from "@/domain/purifier/designPresets";
import type { LayoutResult } from "@/fabrication/purifierLayout";

export function staticReferenceFilesUrl(currentLayout: LayoutResult): string {
  const sourceUrl =
    staticPrintReferenceForPreset(currentLayout.configuration.printDesign)?.sourceUrl ??
    currentLayout.configuration.printDesign.sourceUrl;
  if (sourceUrl === undefined) {
    return "https://www.printables.com/";
  }
  return sourceUrl.endsWith("/files") ? sourceUrl : `${sourceUrl}/files`;
}
