import { cleanHTML, chunkifyHTML, findElement } from "./html-processor";

export interface BrowserAgentAction {
  type: "click" | "scroll" | "navigate" | "wait" | "highlight";
  target?: string;
  value?: any;
}

export interface BrowserAgentResult {
  success: boolean;
  error?: string;
  elementFound?: boolean;
}

export class BrowserAgent {
  private isMobileView(): boolean {
    return window.innerWidth < 768; // Match the md breakpoint from Tailwind
  }

  private async waitForElement(
    selector: string,
    timeout = 2000,
  ): Promise<Element | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return null;
  }

  private async handleClick(action: BrowserAgentAction): Promise<BrowserAgentResult> {
    if (!action.target) {
      return {
        success: false,
        error: "No target specified for click action",
      };
    }

    const element = await this.waitForElement(action.target);
    if (!element) {
      return {
        success: false,
        error: `Element not found: ${action.target}`,
        elementFound: false,
      };
    }

    (element as HTMLElement).click();
    return { success: true, elementFound: true };
  }

  private async handleScroll(action: BrowserAgentAction): Promise<BrowserAgentResult> {
    if (!action.target) {
      return {
        success: false,
        error: "No target specified for scroll action",
      };
    }

    const element = await findElement(action.target);
    if (!element) {
      return {
        success: false,
        error: `Element not found: ${action.target}`,
        elementFound: false,
      };
    }

    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    return { success: true, elementFound: true };
  }

  private async handleNavigate(action: BrowserAgentAction): Promise<BrowserAgentResult> {
    if (!action.target) {
      return { success: false, error: "No URL specified for navigation" };
    }

    // window.location.href = action.target;
    history.pushState({ spotterNavigation: true }, '', action.target);
    window.dispatchEvent(new Event('locationchange'));
    return { success: true };
  }

  private async handleWait(action: BrowserAgentAction): Promise<BrowserAgentResult> {
    const duration = action.value || 1000;
    await new Promise((resolve) => setTimeout(resolve, duration));
    return { success: true };
  }

  private async handleHighlight(action: BrowserAgentAction): Promise<BrowserAgentResult> {
    if (!action.target) {
      return {
        success: false,
        error: "No target specified for highlight action",
      };
    }

    const element = await findElement(action.target);
    console.log('browser Agent: handleHighlight():', element)
    if (!element) {
      return {
        success: false,
        error: `Element not found: ${action.target}`,
        elementFound: false,
      };
    }

    element.classList.add("spotter-highlight");
    return { success: true, elementFound: true };
  }

  async executeAction(action: BrowserAgentAction): Promise<BrowserAgentResult> {
    try {
      switch (action.type) {
        case "click":
          return await this.handleClick(action);
        case "scroll":
          return await this.handleScroll(action);
        case "navigate":
          return await this.handleNavigate(action);
        case "wait":
          return await this.handleWait(action);
        case "highlight":
          return await this.handleHighlight(action);
        default:
          return {
            success: false,
            error: `Unsupported action type: ${(action as BrowserAgentAction).type}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  async executeActions(
    actions: BrowserAgentAction[],
  ): Promise<BrowserAgentResult[]> {
    const results: BrowserAgentResult[] = [];

    for (const action of actions) {
      const result = await this.executeAction(action);
      results.push(result);

      // Stop if an action fails
      if (!result.success) break;

      // Add a small delay between actions
      if (action.type !== "wait") {
        await this.executeAction({ type: "wait", value: 300 });
      }
    }

    return results;
  }
}

export default BrowserAgent;