import { z } from "zod";

interface ChunkMetadata {
  id: string;
  text: string;
  selector: string;
  type: string;
  attributes: Record<string, string>;
  isVisible: boolean;
  // clickableParents: string[];
}

class HTMLProcessor {
  private static instance: HTMLProcessor;
  private cleanedDocument: Document | null = null;
  private parser: DOMParser;

  private constructor() {
    this.parser = new DOMParser();
  }

  public static getInstance(): HTMLProcessor {
    if (!HTMLProcessor.instance) {
      HTMLProcessor.instance = new HTMLProcessor();
    }
    return HTMLProcessor.instance;
  }

  public initializeDocument(html: string): void {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    // Remove script tags
    tempDiv.querySelectorAll("script").forEach((el) => el.remove());
    // Remove style tags
    tempDiv.querySelectorAll("style").forEach((el) => el.remove());
    // Remove comments
    const removeComments = (node: Node) => {
      const walker = document.createTreeWalker(
        node,
        NodeFilter.SHOW_COMMENT,
        null,
      );
      const comments: Comment[] = [];
      let comment: Comment | null;

      while ((comment = walker.nextNode() as Comment)) {
        comments.push(comment);
      }

      comments.forEach((comment) => comment.remove());
    };

    removeComments(tempDiv);

    // Remove hidden elements
    tempDiv
      .querySelectorAll(
        '[hidden], [style*="display: none"], [style*="visibility: hidden"]',
      )
      .forEach((el) => el.remove());

    this.cleanedDocument = this.parser.parseFromString(
      tempDiv.innerHTML,
      "text/html",
    );
  }

  private getCleanedDocument(): Document {
    if (!this.cleanedDocument) {
      throw new Error(
        "Document not initialized. Call initializeDocument first.",
      );
    }
    return this.cleanedDocument;
  }

  public chunkifyHTML(): ChunkMetadata[] {
    if (typeof window === "undefined" || !document) {
      return [];
    }

    const chunks: ChunkMetadata[] = [];
    const doc = this.getCleanedDocument();

    const selector = `
      button, a, input, select, textarea,
      h1, h2, h3, h4, h5, h6,
      [role="button"],
      [data-state],
      [id]
    `;

    doc.querySelectorAll(selector).forEach((element, index) => {
      if (!element) {
        return;
      }

      let selector = this.generateSelector(element);
      if (!isValidSelector(selector)) {
        console.warn("Not a valid selector for: ", element.textContent?.trim());
        selector = this.generateCssSelector(element);
      }

      try {
        if (this.findElement(selector)) {
          const attributes: Record<string, string> = {};
          Array.from(element.attributes).forEach((attr) => {
            attributes[attr.name] = attr.value;
          });

          chunks.push({
            id: `chunk_${index}`,
            text: element.textContent?.trim() || "",
            selector,
            type: element.tagName.toLowerCase(),
            attributes,
            isVisible: this.isElementVisible(element),
          });
        }
      } catch (e) {
        console.error(`Invalid selector generated: ${selector}`);
      }
    });

    return chunks;
  }

  public buildElementIndex(chunks: ChunkMetadata[]): string {
    return chunks
      .map((chunk) => {
        const attrs = Object.entries(chunk.attributes)
          .map(([key, value]) => `${key}="${value}"`)
          .join(", ");

        return `Element \`${chunk.id}\`:
    Type: \`${chunk.type}\`;
    CSS Selector: \`${chunk.selector}\` ;
    Text Content: \`${chunk.text}\`;
    Attributes: \`${attrs}\`;
    Is Visible: \`${chunk.isVisible}\`;
    ----`;
      })
      .join("\n");
  }

  // -- Chunkify helpers --

  private isElementVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      parseFloat(style.opacity) > 0
    );
  }

  private isClickable(element: Element): boolean {
    return (
      ["button", "a"].includes(element.tagName.toLowerCase()) ||
      element.getAttribute("role") === "button" ||
      element.getAttribute("onclick") !== null
    );
  }

  private getClickableParents(element: Element | null): string[] {
    let parents: string[] = [];
    let current: Element | null = element;
    while (current && current !== document.body) {
      if (this.isClickable(current)) {
        parents.push(this.generateCssSelector(current));
      }
      current = current.parentElement;
    }
    return parents;
  }
  // ----

  public findElement(selector: string): Element | null {
    // const doc = this.getCleanedDocument();
    const doc = document;
    const isXPath = selector.trim().startsWith("/");
    if (!isXPath) {
      return doc.querySelector(selector);
    }
    const result = doc.evaluate(
      selector,
      doc,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    return result.singleNodeValue as Element | null;
  }

  public getElementXPath(element: Element): string {
    if (element.id) return `//*[@id="${element.id}"]`;
    const parts = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = element.previousElementSibling;
      while (sibling) {
        if (sibling.nodeName === element.nodeName) index++;
        sibling = sibling.previousElementSibling;
      }
      const tagName = element.nodeName.toLowerCase();
      parts.unshift(`${tagName}[${index}]`);
      element = element.parentElement!;
    }
    return `/${parts.join("/")}`;
  }

  private generateCssSelector(element: Element | null): string {
    if (!(element instanceof Element)) {
      return "";
    }

    const parts: string[] = [];

    while (element && element.nodeType === Node.ELEMENT_NODE) {
      let selectorPart = element.tagName.toLowerCase();

      if (element.id) {
        selectorPart = `#${element.id}`;
        parts.push(selectorPart);
        break;
      } else {
        if (element.parentNode) {
          const index =
            Array.from(element.parentNode.children).indexOf(element) + 1;
          selectorPart = `:nth-child(${index})`;
          parts.push(selectorPart);
        }
        element = element.parentElement;
      }
    }

    return parts.reverse().join(" > ");
  }

  private generateSelector(element: HTMLElement): string {
    if (!(element instanceof HTMLElement)) {
      return "";
    }

    const escapeSelector = (value: string) => CSS.escape(value);

    // --- 1. ID (Highest Priority) ---
    if (element.id) {
      return `#${escapeSelector(element.id)}`;
    }

    // --- Helper Function: Try Attribute Combinations ---
    function tryAttributeCombinations(el: HTMLElement): string | null {
      const attributes = [
        "data-test-id",
        "data-testid",
        "data-id",
        "data-state",
        "role",
        "aria-label",
        "name",
        "type",
        "alt",
        "title",
      ];
      const presentAttributes = attributes.filter((attr) =>
        el.hasAttribute(attr),
      );

      // Try single attributes first (prioritized order)
      for (const attr of presentAttributes) {
        const attrValue = escapeSelector(el.getAttribute(attr)!);
        const selector = `[${attr}="${attrValue}"]`;
        if (document.querySelectorAll(selector).length === 1) {
          return selector; // Unique single attribute!
        }
      }

      // Try combinations of two attributes
      if (presentAttributes.length > 1) {
        for (let i = 0; i < presentAttributes.length; i++) {
          for (let j = i + 1; j < presentAttributes.length; j++) {
            const attr1 = presentAttributes[i];
            const attr2 = presentAttributes[j];
            const attrValue1 = escapeSelector(el.getAttribute(attr1)!);
            const attrValue2 = escapeSelector(el.getAttribute(attr2)!);
            const combinedSelector = `[${attr1}="${attrValue1}"][${attr2}="${attrValue2}"]`;
            if (document.querySelectorAll(combinedSelector).length === 1) {
              return combinedSelector; // Unique combination!
            }
          }
        }
      }
      return null; // No unique combination found
    }

    // --- 2. Attribute Combinations (Early and Aggressive) ---
    const attributeCombinationSelector = tryAttributeCombinations(element);
    if (attributeCombinationSelector) {
      return attributeCombinationSelector;
    }

    // --- 3. Tag Name + Stable Classes ---
    let selector = element.tagName.toLowerCase();
    const classList = Array.from(element.classList);
    const stableClasses = classList.filter(
      (className) =>
        !/^(active|hovered|selected|focus|current|open|expanded|disabled|hidden)$/i.test(
          className,
        ),
    );
    for (const className of stableClasses) {
      selector += `.${escapeSelector(className)}`;
    }
    //Refine immediately
    selector = refineSelector(element, selector);

    // --- 4. Parent/Sibling Optimization (within refineSelector) ---
    return selector;

    // --- Refinement Function (Handles Duplicates and Optimizations) ---
    function refineSelector(el: HTMLElement, baseSelector: string): string {
      try {
        let matchingElements = Array.from(
          document.querySelectorAll(baseSelector),
        );

        if (matchingElements.length === 1) {
          return baseSelector; // Already unique
        }

        // Robust element comparison
        const elementAttributes = Array.from(el.attributes)
          .map((attr) => `${attr.name}="${attr.value}"`)
          .join(" ");
        const elementClasses = Array.from(el.classList).join(" ");
        const fullElementCompareString = `${el.tagName} ${elementClasses} ${elementAttributes}`;

        let positionInDocument = -1;
        for (let i = 0; i < matchingElements.length; i++) {
          const docElement = matchingElements[i];
          const docElementAttributes = Array.from(docElement.attributes)
            .map((attr) => `${attr.name}="${attr.value}"`)
            .join(" ");
          const docElementClasses = Array.from(docElement.classList).join(" ");
          const fullDocElementCompareString = `${docElement.tagName} ${docElementClasses} ${docElementAttributes}`;

          if (fullElementCompareString === fullDocElementCompareString) {
            positionInDocument = i + 1;
            break;
          }
        }

        if (positionInDocument !== -1) {
          // --- Build Parent Selector (Iterative) ---
          let parentSelector = "";
          let currentElement = el.parentElement;

          while (currentElement && currentElement !== document.body) {
            let currentSelector = "";

            if (currentElement.id) {
              currentSelector = `#${escapeSelector(currentElement.id)}`;
              parentSelector = currentSelector + " > " + parentSelector;
              break; // Stop at ID
            } else {
              const parentTagName = currentElement.tagName.toLowerCase();
              const parentClasses = Array.from(currentElement.classList)
                .filter(
                  (className) =>
                    !/^(active|hovered|selected|focus|current|open|expanded|disabled|hidden)$/i.test(
                      className,
                    ),
                )
                .map((cls) => `.${escapeSelector(cls)}`)
                .join("");
              currentSelector = parentClasses
                ? `${parentTagName}${parentClasses}`
                : parentTagName;

              // nth-child for Parent Uniqueness
              let siblings = Array.from(
                currentElement.parentElement
                  ? currentElement.parentElement.children
                  : [],
              );
              let sameSelectorSiblings = siblings.filter((sibling) => {
                try {
                  return (
                    currentElement.parentElement?.querySelector(
                      currentSelector,
                    ) === sibling
                  );
                } catch (e) {
                  return false;
                }
              });

              if (sameSelectorSiblings.length > 1) {
                let siblingPosition =
                  sameSelectorSiblings.indexOf(currentElement) + 1;
                currentSelector = `${currentSelector}:nth-child(${siblingPosition})`;
              }

              parentSelector = currentSelector + " > " + parentSelector;
            }
            currentElement = currentElement.parentElement;
          }

          //Try combining with parents.
          let combinedWithParent = `${parentSelector}${baseSelector}`;
          if (document.querySelectorAll(combinedWithParent).length === 1) {
            return combinedWithParent;
          }

          let finalSelector = `${parentSelector}${baseSelector}:nth-of-type(${positionInDocument})`;

          return finalSelector;
        }
        return baseSelector;
      } catch (e) {
        console.error("Error building selector:", e);
        // Fallback: Use tag name and all classes
        const tagName = element.tagName.toLowerCase();
        const classes = Array.from(element.classList)
          .map((cls) => `.${escapeSelector(cls)}`)
          .join("");
        return classes ? `${tagName}${classes}` : tagName;
      }
    }
  }

  // --END Class
}

// Export singleton instance methods
export const htmlProcessor = HTMLProcessor.getInstance();

// Export the clean HTML function for convenience
export function cleanHTML(html: string): void {
  htmlProcessor.initializeDocument(html);
}

// Export other functions that use the singleton
export function chunkifyHTML(html: string): ChunkMetadata[] {
  cleanHTML(html);
  return htmlProcessor.chunkifyHTML();
}

export function buildElementIndex(chunks: ChunkMetadata[]): string {
  return htmlProcessor.buildElementIndex(chunks);
}

export function findElement(selector: string): Element | null {
  return htmlProcessor.findElement(selector);
}

export function getElementXPath(element: Element): string {
  return htmlProcessor.getElementXPath(element);
}

export function isValidSelector(selector: string): boolean {
  try {
    document.querySelector(selector);
    return true;
  } catch (e) {
    console.error("Invalid selector:", selector);
    return false;
  }
}
