export interface BundleSizeConfigFile {
  path: string;
  maxSize: string;
}

export interface BundleSizeConfig {
  files: BundleSizeConfigFile[];
}

export interface MeasuredBundleSize extends BundleSizeConfigFile {
  sizeInBytes: number;
}

export interface BundleSizeReport {
  files: Array<
    BundleSizeConfigFile & {
      size: string;
    }
  >;
}
