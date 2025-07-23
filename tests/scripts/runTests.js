// tests/scripts/runTests.js - Comprehensive test runner with coverage reporting
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class TestRunner {
  constructor() {
    this.testSuites = {
      unit: {
        name: 'Unit Tests',
        pattern: 'tests/unit/**/*.test.js',
        description: 'Tests individual components in isolation'
      },
      integration: {
        name: 'Integration Tests', 
        pattern: 'tests/integration/**/*.test.js',
        description: 'Tests API endpoints and component interactions'
      },
      e2e: {
        name: 'End-to-End Tests',
        pattern: 'tests/e2e/**/*.test.js', 
        description: 'Tests complete user workflows'
      },
      models: {
        name: 'Model Tests',
        pattern: 'tests/unit/models/*.test.js',
        description: 'Tests database models and business logic'
      },
      services: {
        name: 'Service Tests',
        pattern: 'tests/unit/services/*.test.js',
        description: 'Tests business logic services'
      },
      api: {
        name: 'API Tests',
        pattern: 'tests/integration/api/*.test.js',
        description: 'Tests REST API endpoints'
      },
      security: {
        name: 'Security Tests',
        pattern: 'tests/e2e/securityAndPerformance.test.js',
        description: 'Tests security and performance scenarios'
      }
    };
    
    this.results = {};
  }

  async runSuite(suiteName, options = {}) {
    const suite = this.testSuites[suiteName];
    if (!suite) {
      throw new Error(`Unknown test suite: ${suiteName}`);
    }

    console.log(`\n🧪 Running ${suite.name}`);
    console.log(`📝 ${suite.description}`);
    console.log(`🔍 Pattern: ${suite.pattern}\n`);

    const jestArgs = [
      suite.pattern,
      '--verbose',
      '--detectOpenHandles',
      '--forceExit'
    ];

    if (options.coverage) {
      jestArgs.push('--coverage');
      jestArgs.push('--coverageReporters=text');
      jestArgs.push('--coverageReporters=json-summary');
    }

    if (options.bail) {
      jestArgs.push('--bail');
    }

    if (options.maxWorkers) {
      jestArgs.push(`--maxWorkers=${options.maxWorkers}`);
    }

    return new Promise((resolve, reject) => {
      const jest = spawn('npx', ['jest', ...jestArgs], {
        stdio: 'inherit',
        cwd: process.cwd()
      });

      jest.on('close', (code) => {
        this.results[suiteName] = {
          name: suite.name,
          exitCode: code,
          passed: code === 0
        };

        if (code === 0) {
          console.log(`✅ ${suite.name} completed successfully\n`);
        } else {
          console.log(`❌ ${suite.name} failed with code ${code}\n`);
        }

        resolve({ passed: code === 0, exitCode: code });
      });

      jest.on('error', (error) => {
        console.error(`Error running ${suite.name}:`, error);
        reject(error);
      });
    });
  }

  async runAll(options = {}) {
    console.log('🚀 Starting Comprehensive Test Suite');
    console.log('=====================================\n');

    const startTime = Date.now();
    const suiteNames = Object.keys(this.testSuites);
    let totalPassed = 0;
    let totalFailed = 0;

    for (const suiteName of suiteNames) {
      try {
        const result = await this.runSuite(suiteName, options);
        if (result.passed) {
          totalPassed++;
        } else {
          totalFailed++;
          
          if (options.bail) {
            console.log('🛑 Bailing out due to test failure');
            break;
          }
        }
      } catch (error) {
        console.error(`❌ Failed to run ${suiteName}:`, error.message);
        totalFailed++;
        
        if (options.bail) {
          break;
        }
      }
    }

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    this.printSummary(totalPassed, totalFailed, duration);
    return { totalPassed, totalFailed, duration };
  }

  async runSelected(suiteNames, options = {}) {
    console.log(`🎯 Running Selected Test Suites: ${suiteNames.join(', ')}`);
    console.log('================================================\n');

    const startTime = Date.now();
    let totalPassed = 0;
    let totalFailed = 0;

    for (const suiteName of suiteNames) {
      if (!this.testSuites[suiteName]) {
        console.error(`❌ Unknown test suite: ${suiteName}`);
        totalFailed++;
        continue;
      }

      try {
        const result = await this.runSuite(suiteName, options);
        if (result.passed) {
          totalPassed++;
        } else {
          totalFailed++;
        }
      } catch (error) {
        console.error(`❌ Failed to run ${suiteName}:`, error.message);
        totalFailed++;
      }
    }

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    this.printSummary(totalPassed, totalFailed, duration);
    return { totalPassed, totalFailed, duration };
  }

  printSummary(passed, failed, duration) {
    console.log('\n📊 Test Suite Summary');
    console.log('====================');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%\n`);

    if (Object.keys(this.results).length > 0) {
      console.log('📋 Detailed Results:');
      Object.values(this.results).forEach(result => {
        const status = result.passed ? '✅' : '❌';
        console.log(`   ${status} ${result.name} (exit code: ${result.exitCode})`);
      });
      console.log();
    }
  }

  listSuites() {
    console.log('📚 Available Test Suites:');
    console.log('=========================\n');

    Object.entries(this.testSuites).forEach(([key, suite]) => {
      console.log(`🔸 ${key}: ${suite.name}`);
      console.log(`   📝 ${suite.description}`);
      console.log(`   🔍 ${suite.pattern}\n`);
    });
  }

  async generateCoverageReport() {
    console.log('📊 Generating Comprehensive Coverage Report');
    console.log('==========================================\n');

    const coverageArgs = [
      'tests/**/*.test.js',
      '--coverage',
      '--coverageReporters=text',
      '--coverageReporters=html',
      '--coverageReporters=json-summary',
      '--coverageDirectory=coverage'
    ];

    return new Promise((resolve, reject) => {
      const jest = spawn('npx', ['jest', ...coverageArgs], {
        stdio: 'inherit',
        cwd: process.cwd()
      });

      jest.on('close', (code) => {
        if (code === 0) {
          console.log('\n✅ Coverage report generated successfully');
          console.log('📂 Reports available in: ./coverage/');
          
          // Try to read coverage summary
          this.readCoverageSummary();
        } else {
          console.log(`❌ Coverage generation failed with code ${code}`);
        }
        resolve({ passed: code === 0, exitCode: code });
      });

      jest.on('error', reject);
    });
  }

  readCoverageSummary() {
    try {
      const summaryPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
      if (fs.existsSync(summaryPath)) {
        const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
        const total = summary.total;
        
        console.log('\n📈 Coverage Summary:');
        console.log('===================');
        console.log(`Lines: ${total.lines.pct}% (${total.lines.covered}/${total.lines.total})`);
        console.log(`Statements: ${total.statements.pct}% (${total.statements.covered}/${total.statements.total})`);
        console.log(`Functions: ${total.functions.pct}% (${total.functions.covered}/${total.functions.total})`);
        console.log(`Branches: ${total.branches.pct}% (${total.branches.covered}/${total.branches.total})`);
        
        // Check if coverage thresholds are met
        const thresholds = {
          lines: 70,
          statements: 70,
          functions: 70,
          branches: 70
        };
        
        const meetsThresholds = Object.entries(thresholds).every(([key, threshold]) => 
          total[key].pct >= threshold
        );
        
        if (meetsThresholds) {
          console.log('\n🎉 All coverage thresholds met!');
        } else {
          console.log('\n⚠️  Some coverage thresholds not met');
        }
      }
    } catch (error) {
      console.log('📊 Coverage summary not available');
    }
  }
}

// CLI interface
async function main() {
  const runner = new TestRunner();
  const args = process.argv.slice(2);
  
  const options = {
    coverage: args.includes('--coverage'),
    bail: args.includes('--bail'),
    maxWorkers: args.find(arg => arg.startsWith('--maxWorkers='))?.split('=')[1]
  };

  if (args.includes('--list')) {
    runner.listSuites();
    return;
  }

  if (args.includes('--coverage-only')) {
    await runner.generateCoverageReport();
    return;
  }

  const suiteArgs = args.filter(arg => 
    !arg.startsWith('--') && Object.keys(runner.testSuites).includes(arg)
  );

  try {
    let result;
    
    if (suiteArgs.length > 0) {
      result = await runner.runSelected(suiteArgs, options);
    } else {
      result = await runner.runAll(options);
    }

    if (options.coverage) {
      console.log('\n📊 Generating final coverage report...');
      await runner.generateCoverageReport();
    }

    process.exit(result.totalFailed > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Test runner failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = TestRunner;