window.__ModuleLoader__.load({
	id: "dsh-desktop-kit",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
var __DshDesktopKitClientExports = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name2 in all)
      __defProp(target, name2, { get: all[name2], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/client/index.ts
  var index_exports = {};
  __export(index_exports, {
    apply: () => apply,
    name: () => name
  });
  var name = "dsh-desktop-kit";
  function apply() {
    const tauri = window.__TAURI__;
    if (!tauri?.core?.invoke) return;
    const invoke = (cmd, args) => {
      tauri.core.invoke(cmd, args).catch((error) => console.warn("dsh-desktop-kit:", cmd, error));
    };
    const isExternal = (href) => {
      try {
        const url = new URL(href, location.href);
        if (url.protocol === "mailto:") return true;
        if (url.protocol !== "http:" && url.protocol !== "https:") return false;
        return url.origin !== location.origin;
      } catch {
        return false;
      }
    };
    const openExternal = (href) => {
      try {
        invoke("kit_open_external", { url: new URL(href, location.href).href });
      } catch {
      }
    };
    document.addEventListener(
      "click",
      (event) => {
        const anchor = event.target?.closest?.("a[href]");
        if (!anchor) return;
        const href = anchor.getAttribute("href") ?? "";
        if (anchor.target === "_blank" || isExternal(href)) {
          event.preventDefault();
          event.stopPropagation();
          openExternal(href);
        }
      },
      true
    );
    const rawOpen = window.open.bind(window);
    window.open = ((url, target, features) => {
      const href = String(url ?? "");
      if (href !== "" && isExternal(href)) {
        openExternal(href);
        return null;
      }
      return rawOpen(url, target, features);
    });
    const ZOOM_KEY = "dsh-desktop-kit.zoom";
    let zoom = Number(localStorage.getItem(ZOOM_KEY) ?? "1") || 1;
    const applyZoom = () => {
      invoke("kit_set_zoom", { scaleFactor: zoom });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyZoom);
    else applyZoom();
    document.addEventListener(
      "keydown",
      (event) => {
        if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
        if (event.key === "=" || event.key === "+") zoom = Math.min(3, Math.round((zoom + 0.1) * 100) / 100);
        else if (event.key === "-") zoom = Math.max(0.3, Math.round((zoom - 0.1) * 100) / 100);
        else if (event.key === "0") zoom = 1;
        else return;
        event.preventDefault();
        localStorage.setItem(ZOOM_KEY, String(zoom));
        applyZoom();
      },
      true
    );
  }
  return __toCommonJS(index_exports);
})();
		Object.assign(module.exports, __DshDesktopKitClientExports);
		return module.exports;
	},
});
