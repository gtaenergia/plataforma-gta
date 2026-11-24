declare module "pdfmake/build/pdfmake" {
  interface PdfDoc {
    getBlob(cb: (b: Blob) => void): void;
    download(nome?: string): void;
  }
  const pdfMake: {
    vfs: Record<string, string>;
    addVirtualFileSystem?: (vfs: Record<string, string>) => void;
    createPdf(def: unknown): PdfDoc;
  };
  export default pdfMake;
}

declare module "pdfmake/build/vfs_fonts" {
  const vfs: Record<string, string> & { pdfMake?: { vfs: Record<string, string> } };
  export default vfs;
}
