import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { RunnableConfig } from '@langchain/core/runnables';
import { AiDetection, detectionRubric, validateDetection } from './ai-detection';

export interface DetectionAssessment {
  rubric: typeof detectionRubric;
  detection: AiDetection;
}

export interface AssessmentProvider {
  assess(text: string, signal?: AbortSignal): Promise<unknown>;
}

export function validateAssessment(raw: unknown): DetectionAssessment {
  if (!raw || typeof raw !== 'object' || !('rubric' in raw) || raw.rubric !== detectionRubric || !('detection' in raw))
    throw new Error('Invalid assessment');
  return { rubric: detectionRubric, detection: validateDetection(raw.detection) };
}

const AssessmentState = Annotation.Root({
  text: Annotation<string>(),
  raw: Annotation<unknown>(),
  assessment: Annotation<DetectionAssessment>()
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
