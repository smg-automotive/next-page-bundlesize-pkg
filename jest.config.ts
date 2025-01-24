export default {
  clearMocks: true,
  collectCoverage: false,
  errorOnDeprecated: true,
  moduleDirectories: ['node_modules', '<rootDir>'],
  preset: 'ts-jest',
  roots: ['<rootDir>/src'],
  testEnvironment: 'node',
  testRegex: '(/__tests__/.*|(\\.|/)test)\\.tsx?$',
  transform: {
    '^.+\\.(ts|tsx|)$': 'ts-jest',
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  transformIgnorePatterns: ['/node_modules/(?!gzip-size|duplexer)/'],
};
