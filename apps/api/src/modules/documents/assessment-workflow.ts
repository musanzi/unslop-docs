import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { RunnableConfig } from '@langchain/core/runnables';
import { StyleAssessment, assessmentRubric, validateStyleAssessment } from './style-assessment';

export interface WritingAssessment {
  rubric: typeof assessmentRubric;
  style: StyleAssessment;
  findings: WritingFinding[];
}

export interface WritingFinding {
  sentenceId: string;
  ruleId: number;
  quote: string;
  explanation: string;
  severity: number;
}

export interface AssessmentProvider {
  assess(text: string, signal?: AbortSignal): Promise<unknown>;
}

export function validateAssessment(raw: unknown): WritingAssessment {
  if (!raw || typeof raw !== 'object' || !('rubric' in raw) || raw.rubric !== assessmentRubric || !('style' in raw))
    throw new Error('Invalid assessment');
  const style = validateStyleAssessment(raw.style);
  if (
    !('findings' in raw) ||
    !Array.isArray(raw.findings) ||
    raw.findings.length > style.sentenceCount * 12 ||
    !raw.findings.every(
      (f) =>
        f &&
        typeof f.sentenceId === 'string' &&
        /^s\d+$/.test(f.sentenceId) &&
        Number.isSafeInteger(f.ruleId) &&
        f.ruleId > 0 &&
        typeof f.quote === 'string' &&
        f.quote.trim() &&
        typeof f.explanation === 'string' &&
        f.explanation.trim() &&
        [1, 2, 3].includes(f.severity)
    )
  )
    throw new Error('Invalid assessment');
  return {
    rubric: assessmentRubric,
    style,
    findings: raw.findings.map((f) => ({
      sentenceId: f.sentenceId,
      ruleId: f.ruleId,
      quote: f.quote,
      explanation: f.explanation,
      severity: f.severity
    }))
  };
}

const AssessmentState = Annotation.Root({
  text: Annotation<string>(),
  raw: Annotation<unknown>(),
  assessment: Annotation<WritingAssessment>()
});

export function createAssessmentWorkflow(provider: AssessmentProvider) {
  return new StateGraph(AssessmentState)
    .addNode('assess', async (state, config: RunnableConfig) => ({
      raw: await provider.assess(state.text, config.signal)
    }))
    .addNode('validateAssessment', (state) => ({ assessment: validateAssessment(state.raw) }))
    .addEdge(START, 'assess')
    .addEdge('assess', 'validateAssessment')
    .addEdge('validateAssessment', END)
    .compile();
}
