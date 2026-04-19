module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  clearMocks: true,
  restoreMocks: true,
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json",
      },
    ],
  },
  coverageDirectory: "coverage",
  coverageReporters: ["text-summary", "lcov", "cobertura", "html"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "reports/junit",
        outputName: "junit.xml",
        suiteNameTemplate: "{filepath}",
        classNameTemplate: "{classname}",
        titleTemplate: "{title}",
      },
    ],
  ],
  moduleFileExtensions: ["ts", "js", "json"],
};
