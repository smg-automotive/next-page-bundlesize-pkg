import fs from 'fs';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import check from '../check';

const validRunConfig = [
  'jest',
  './node_modules/.bin/jest',
  '--maxSize',
  '1 kB',
  '--buildDir',
  './src/__tests__/.next',
];

describe('cli', () => {
  const mockExit = jest
    .spyOn(process, 'exit')
    .mockImplementation(() => undefined as never);

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('produces config with correct files and sizes', () => {
    check(validRunConfig);

    const config = fs
      .readFileSync('./src/__tests__/.next/next-page-bundlesize.config.json')
      .toString();
    expect(config).toMatchSnapshot();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('produces concatenated bundle file', () => {
    check(validRunConfig);

    const page = fs
      .readFileSync('./src/__tests__/.next/.bundlesize_')
      .toString();
    expect(page).toMatchSnapshot();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('fails when bundles are larger than the limit', () => {
    check([
      'jest',
      './node_modules/.bin/jest',
      '--maxSize',
      '1 b',
      '--buildDir',
      './src/__tests__/.next',
    ]);
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('uses the previous config if defined', () => {
    check([
      ...validRunConfig,
      '--previousConfigFileName',
      'master-config.json',
    ]);

    const updatedConfig = fs
      .readFileSync('./src/__tests__/.next/bundlesize.json')
      .toString();
    expect(updatedConfig).toMatchSnapshot();
  });

  it('adds a delta to the new config if smaller than maxSize', () => {
    check([
      ...validRunConfig,
      '--previousConfigFileName',
      'master-config.json',
      '--delta',
      '5 kB',
    ]);

    const updatedConfig = fs
      .readFileSync('./src/__tests__/.next/bundlesize.json')
      .toString();
    expect(updatedConfig).toMatchSnapshot();
  });
});
