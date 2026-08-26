/// <reference types="vite/client" />

declare module 'write-excel-file/browser' {
  type ExcelOutput = {
    toBlob: () => Promise<Blob>
    toFile: (fileName: string) => Promise<void>
  }
  const writeXlsxFile: (data: unknown[], options: Record<string, unknown>) => ExcelOutput
  export default writeXlsxFile
}
