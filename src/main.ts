import "./app/styles.css";
import { mount } from "svelte";
import App from "./App.svelte";

const appRoot = document.querySelector<HTMLElement>("#app");
if (appRoot === null) {
  throw new Error("main: App root not found");
}

mount(App, {
  target: appRoot,
});
