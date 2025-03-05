import { analyzePageContent, ElementAnalysisResult } from "./llm";
import "./styles.css";
import { isValidSelector } from "./html-processor";
import { BrowserAgent } from "./browser-agent";
import TurndownService from "turndown";
import { storage } from "./storage/db";
import { localStorageHandler } from "./storage/local-storage";


interface SpotterConfig {
  apiKey: string;
  apiUrl?: string;
  disabled?: boolean;
}

interface SpotterResult {
  page?: string;
  elementSelector: string;
  requiresInteraction?: boolean;
  interactionType?: "click" | "expand" | "none";
}

class SpotterSDK {
  private apiKey: string;
  private apiUrl: string;
  private disabled: boolean;
  private widget: HTMLElement | null;
  private popupOverlay: HTMLElement | null;
  private initialized: boolean;
  private minimizedBox: HTMLElement | null;
  private messagesContainer: HTMLElement | null;
  private loadingSpinner: HTMLElement | null;
  private isLoading: boolean;
  private browserAgent: BrowserAgent;
  private seenPages: Set<string> = new Set();
  private currentUrl: string = "";
  private turndownService: TurndownService = null;

  constructor(config: SpotterConfig) {
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl || "https://api.spotter.default.com";
    this.disabled = config.disabled || false;

    // Initialize marked
    console.log("reinitialized");
    this.widget = null;
    this.popupOverlay = null;
    this.initialized = false;
    this.minimizedBox = null;
    this.messagesContainer = null;
    this.loadingSpinner = null;
    this.isLoading = false;

    this.currentUrl = window.location.href;
    this.browserAgent = new BrowserAgent();
    this.turndownService = new TurndownService();
    this.turndownService.remove("style");
    this.handleURLChange();
    this.checkPendingQuery();
  }

  // spotter.init() method called when the component is mounted
  init(): void {
    this.checkPendingQuery();
    this.currentUrl = window.location.href;
    if (this.initialized) return;
    this.createChatWidget();
    this.createPopupOverlay();
    this.setupEventListeners();
    this.initialized = true;
  }

  // ---- UI elements ----
  private createChatWidget(): void {
    const widget = document.createElement("div");
    widget.className = "spotter-chat-widget";
    widget.innerHTML = `
        <div class="spotter-chat-header">
          <div class="spotter-header-content">
            <span>Spotter Assistant</span>
            <div class="lds-ripple">
              <div></div>
              <div></div>
            </div>
          </div>
          <button class="spotter-minimize">_</button>
        </div>
        <div class="spotter-chat-messages"></div>
        <div class="spotter-chat-input">
          <input type="text" placeholder="Ask about any element on the page...">
          <button class="spotter-send">Send</button>
        </div>
      `;

    const minimizedBox = document.createElement("div");
    minimizedBox.className = "spotter-minimized-box";
    minimizedBox.innerHTML = `
      <div class="spotter-header-content">
        <span>Spotter Assistant</span>
        <div class="lds-ripple">
          <div></div>
          <div></div>
        </div>
      </div>
    `;
    minimizedBox.addEventListener("click", () => this.toggleWidget(true));

    // Remove any existing styles and widgets
    document
      .querySelectorAll(".spotter-chat-widget, .spotter-minimized-box")
      .forEach((el) => el.remove());

    document.body.appendChild(widget);
    document.body.appendChild(minimizedBox);

    this.widget = widget;
    this.minimizedBox = minimizedBox;
    this.messagesContainer = widget.querySelector(".spotter-chat-messages");
    this.loadingSpinner = widget.querySelector(".lds-ripple");
  }

  private addMessage(
    message: string,
    type: "user" | "assistant" | "error",
  ): void {
    if (!this.messagesContainer) return;

    const messageElement = document.createElement("div");
    messageElement.className = `spotter-message spotter-${type}-message`;
    messageElement.textContent = message;
    this.messagesContainer.appendChild(messageElement);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

    if (type === "error") {
      this.toggleWidget(true);
    }
  }

  private createPopupOverlay(): void {
    const popup = document.createElement("div");
    popup.className = "spotter-popup";
    popup.style.display = "none";
    document.body.appendChild(popup);
    this.popupOverlay = popup;
  }

  private setLoading(loading: boolean): void {
    this.isLoading = loading;
    if (this.loadingSpinner) {
      console.log("loading", loading);
      this.loadingSpinner.classList.toggle("active", loading);
    }
    const minimizedSpinner = this.minimizedBox?.querySelector(".lds-ripple");
    if (minimizedSpinner) {
      minimizedSpinner.classList.toggle("active", loading);
    }
    if (loading) {
      this.toggleWidget(false);
    }
  }

  private toggleWidget(show: boolean): void {
    if (this.widget && this.minimizedBox) {
      this.widget.style.display = show ? "flex" : "none";
      this.minimizedBox.style.display = show ? "none" : "block";
    }
  }

  // ---- Chat Event Listeners ----
  private setupEventListeners(): void {
    const input = this.widget!.querySelector("input") as HTMLInputElement;
    const sendButton = this.widget!.querySelector(
      ".spotter-send",
    ) as HTMLButtonElement;
    const minimizeButton = this.widget!.querySelector(
      ".spotter-minimize",
    ) as HTMLButtonElement;

    sendButton.addEventListener("click", async () => {
      const query = input.value.trim();
      if (!query) return;
      const result = await storage.search(query);
      console.log("result", result[0]);
      if (result[0].url == this.currentUrl) {
        this.executeQuery(query);
      } else {
        this.addMessage(
          "I found a match on another page. Navigating there...",
          "assistant",
        );
        localStorageHandler.setPendingQuery(query);
        setTimeout(async () => {
          await this.browserAgent.executeAction({
            type: "navigate",
            target: result[0].url,
          });
          this.init();
        }, 750);
        
      }
      // this.executeQuery(query);
      input.value = "";
    });

    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        sendButton.click();
      }
    });

    minimizeButton.addEventListener("click", () => this.toggleWidget(false));

    document.addEventListener("click", (e) => {
      if (
        !this.widget!.contains(e.target as Node) &&
        !this.popupOverlay!.contains(e.target as Node)
      ) {
        this.clearHighlight();
      }
    });
  }

  private checkPendingQuery(): void {
    const pendingQuery = localStorageHandler.getPendingQuery();
    console.log("get pending query: ", pendingQuery);
    if (pendingQuery) {
      this.executeQuery(pendingQuery);
    }
  }

  // ---- Query related -----
  private executeQuery(query: string | null): void {
    if (!query) {
      return;
    }
    console.log("User query: ", query);
    this.addMessage(query, "user");
    this.clearHighlight();
    this.setLoading(true);
    try {
      this.getActionsFromLLM(query).then((result) => {
        if (result) {
          this.highlightElement(result);
        } else {
          this.addMessage(
            "I couldn't find a matching element on this page.",
            "error",
          );
        }
        this.setLoading(false);
      });
    } catch (error) {
      this.addMessage(
        "Sorry, I encountered an error while searching for the element.",
        "error",
      );
      console.error(error);
    }
  }

  private async getActionsFromLLM(
    query: string,
  ): Promise<ElementAnalysisResult | null> {
    try {
      const result = await analyzePageContent(
        query,
        document.documentElement.outerHTML,
      );

      // Validate all selectors before proceeding
      const allSelectorsValid = result.actions.every((action) =>
        isValidSelector(action.elementSelector),
      );
      console.log("All selectors valid:", allSelectorsValid);
      if (!allSelectorsValid) {
        console.error("Invalid selectors returned from OpenAI:", result);
        this.addMessage(
          "Sorry, I couldn't find a valid way to navigate there.",
          "error",
        );
        return null;
      }

      if (result.confidence > 0.7) {
        return result;
      }

      return null;
    } catch (error) {
      console.error("Error analyzing query:", error);
      return null;
    }
  }

  private async highlightElement(
    elementAnalysis: ElementAnalysisResult,
  ): Promise<void> {
    if (!elementAnalysis) {
      this.addMessage(
        "I couldn't determine how to get to that location.",
        "error",
      );
    }
    let actionIterator = 0;
    for (const action of elementAnalysis.actions) {
      // Execute each action in sequence
      // Announce the current step
      this.addMessage(action.description, "assistant");

      // Highlight the element first
      await this.browserAgent.executeAction({
        type: "highlight",
        target: action.elementSelector,
      });

      // Scroll to make sure it's visible
      await this.browserAgent.executeAction({
        type: "scroll",
        target: action.elementSelector,
      });

      // Wait after scrolling
      await this.browserAgent.executeAction({
        type: "wait",
        value: 2000,
      });

      // Perform the interaction if needed
      if (action.interactionType !== "none") {
        // This also closes the highlight because we click outside the highlight
        await this.browserAgent.executeAction({
          type:
            action.interactionType === "expand"
              ? "click"
              : action.interactionType,
          target: action.elementSelector,
        });
        // Highlight the element
        await this.browserAgent.executeAction({
          type: "highlight",
          target: action.elementSelector,
        });
      }

      if (actionIterator < elementAnalysis.actions.length - 1) {
        // Clear highlight before moving to next step
        console.log("Not the last step: clearHighlight");
        this.clearHighlight();
      }
      actionIterator += 1;
    }
    this.addMessage("We've reached your destination!", "assistant");
  }

  private clearHighlight(): void {
    const highlighted = document.querySelectorAll(".spotter-highlight");
    highlighted.forEach((el) => el.classList.remove("spotter-highlight"));
    if (this.popupOverlay) {
      this.popupOverlay.style.display = "none";
    }
  }

  // ---- When Page changes

  private lastProcessedUrl: string = "";
  private debounceTimer: any = null;

  private handleNavigationForMarkdown(newUrl: string) {
    this.currentUrl = newUrl;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    // Don't process if we just handled this URL
    if (this.lastProcessedUrl === newUrl) {
      console.log(`Skipping duplicate processing for ${newUrl}`);
      return;
    }
    this.debounceTimer = setTimeout(() => {
      this.storePageMarkdown(newUrl);
      this.lastProcessedUrl = newUrl;
      this.debounceTimer = null;
    }, 150); // 150ms debounce
  }

  private async storePageMarkdown(newUrl: string) {
    if (!this.turndownService) {
      console.error("turndownService not initialized");
      return;
    }
    console.log("Inside storePageMarkdown() service");
    try {
      const pageNeedsUpdate = !localStorageHandler.hasSeenPage(newUrl);
      if (pageNeedsUpdate) {
        // Convert HTML to Markdown
        const markdownContent = this.turndownService.turndown(
          document.body.innerHTML,
        );
        const vectorId = await storage.savePage(markdownContent, newUrl);
        localStorageHandler.addSeenPage(newUrl, vectorId);
        console.log(
          `Page ${newUrl} indexed and stored with embedding`,
          vectorId,
        );
      }
    } catch (error) {
      console.error("Error processing page:", error);
    }
  }

  private handleURLChange() {
    // Handle back/forward navigation
    window.addEventListener("popstate", () => {
      console.log("handleURLChange() popstate");
      this.handleNavigationForMarkdown(window.location.href);
    });

    // Create and dispatch a custom event for programmatic navigation
    const originalPushState = window.history.pushState;
    window.history.pushState = function (...args) {
      console.log("handleURLChange() history.pushState", args[2]);
      originalPushState.apply(this, args);
      window.dispatchEvent(new Event("locationchange"));
    };

    // Also intercept replaceState
    const originalReplaceState = window.history.replaceState;
    window.history.replaceState = function (...args) {
      console.log("handleURLChange() history.replaceState", args[2]);
      originalReplaceState.apply(this, args);
      window.dispatchEvent(new Event("locationchange"));
    };

    // Listen for our custom event
    window.addEventListener("locationchange", () => {
      console.log("handleURLChange() locationchange");
      this.handleNavigationForMarkdown(window.location.href);
    });

    // Handle initial page load
    this.storePageMarkdown(window.location.href);
  }
}

export default SpotterSDK;
