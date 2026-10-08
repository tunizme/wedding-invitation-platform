import { writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fileName = (file) => relative(root, resolve(file)).replaceAll('\\', '/');
const persist = (cases, complete) => {
  if (process.env.AUTH_TRANSITION_CASE_REPORT)
    writeFileSync(
      process.env.AUTH_TRANSITION_CASE_REPORT,
      JSON.stringify({ cases, complete }),
    );
};

/** Status-only evidence: never serializes errors, arguments, attachments or credentials. */
export default class EvidenceReporter {
  onTestRunEnd(modules, errors, reason) {
    const cases = modules.flatMap((module) =>
      [...module.children.allTests()].map((test) => ({
        file: fileName(module.moduleId),
        name: test.name,
        status: test.result().state,
      })),
    );
    persist(cases, reason === 'passed' && errors.length === 0);
  }
  onEnd(result) {
    // Playwright collects skipped cases too, so omissions cannot pass unnoticed.
    persist(
      this.suite.allTests().map((test) => ({
        file: fileName(test.location.file),
        name: test.title,
        project: test.parent.project().name,
        status:
          test.results.length === 1 ? test.results[0].status : 'interrupted',
      })),
      result.status === 'passed',
    );
  }
  onBegin(_config, suite) {
    this.suite = suite;
  }
}

/** Node test-runner reporter uses the same safe schema. */
export async function* nodeEvidence(source) {
  const cases = [];
  let complete = false;
  for await (const event of source) {
    if (['test:pass', 'test:fail'].includes(event.type)) {
      const data = event.data;
      cases.push({
        file: fileName(data.file),
        name: data.name,
        status: data.skip
          ? 'skipped'
          : data.todo
            ? 'todo'
            : event.type === 'test:pass'
              ? 'passed'
              : 'failed',
      });
    }
    if (
      event.type === 'test:summary' &&
      (event.data.nesting === undefined || event.data.nesting === 0)
    )
      complete = event.data.success;
  }
  persist(cases, complete);
}
