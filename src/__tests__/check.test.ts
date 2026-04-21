import fs from 'fs';

import check from '@/src/check';

const validRunConfig = [
  'jest',
  './node_modules/.bin/jest',
  '--maxSize',
  '1 kB',
  '--buildDir',
];

describe('cli', () => {
  const mockExit = jest.spyOn(process, 'exit').mockImplementation();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('produces config with correct files and sizes', () => {
    check(validRunConfig.concat('./src/__tests__/.next'));

    const config = fs
      .readFileSync('./src/__tests__/.next/next-page-bundlesize.config.json')
      .toString();
    expect(config).toMatchSnapshot();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('produces concatenated bundle file', () => {
    check(validRunConfig.concat('./src/__tests__/.next'));

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
      ...validRunConfig.concat('./src/__tests__/.next'),
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
      ...validRunConfig.concat('./src/__tests__/.next'),
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

  it('produces route-specific bundles for next 16 app routes', () => {
    check(validRunConfig.concat('./src/__tests__/.next-next16'));

    const config = fs
      .readFileSync(
        './src/__tests__/.next-next16/next-page-bundlesize.config.json',
      )
      .toString();
    expect(config).toMatchSnapshot();

    const homePageBundle = fs
      .readFileSync('./src/__tests__/.next-next16/.bundlesize_-locale-')
      .toString();
    expect(homePageBundle).toMatchSnapshot();

    expect(
      fs.existsSync('./src/__tests__/.next-next16/.bundlesize__api_ready'),
    ).toBe(false);
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
