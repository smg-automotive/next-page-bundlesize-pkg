export default {
  clearMocks: true,
  collectCoverage: false,
  errorOnDeprecated: true,
  moduleDirectories: ['node_modules', '<rootDir>'],
  preset: 'ts-jest/presets/js-with-ts',
  roots: ['<rootDir>/src'],
  testEnvironment: 'node',
  testRegex: '(/__tests__/.*|(\\.|/)test)\\.tsx?$',
};
