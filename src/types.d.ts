declare module 'bundlesize/src/compressed-size' {
  function compressedSize(
    data: string,
    compression?: 'gzip' | 'brotli' | 'none',
  ): number;
  export = compressedSize;
}
