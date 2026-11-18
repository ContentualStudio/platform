import { Injectable } from "@nestjs/common";
import type { ContentEvent } from "../content-engine/content-event";
import type { ContentEventEvaluator } from "../content-engine/event-evaluator.port";
import { RuleEvaluatorService } from "../content-engine/rule-evaluator.service";
import { CompletionSuggestionResolver } from "./completion-suggestion-resolver";

@Injectable()
export class CompletionSuggestionEvaluator implements ContentEventEvaluator {
  constructor(
    private readonly rules: RuleEvaluatorService,
    private readonly suggestions: CompletionSuggestionResolver,
  ) {}
  async evaluate(event: ContentEvent): Promise<void> {
    await this.rules.evaluate(event);
    if (event.eventName === "programme.completed")
      await this.suggestions.resolve(event);
  }
}
