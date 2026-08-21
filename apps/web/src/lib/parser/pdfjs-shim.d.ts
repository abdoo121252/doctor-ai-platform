// The legacy pdfjs build includes the DOMMatrix/etc. polyfills required in
// Node. It has no bundled types, so re-export the main build's types.
declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export * from "pdfjs-dist";
}