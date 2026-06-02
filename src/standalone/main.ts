import { mount } from "svelte";
import StandaloneEditor from "./StandaloneEditor.svelte";

const editorRoot = document.querySelector<HTMLElement>("#standalone");
if (editorRoot === null) {
  throw new Error("main: Standalone editor root not found");
}

mount(StandaloneEditor, {
  target: editorRoot,
});
