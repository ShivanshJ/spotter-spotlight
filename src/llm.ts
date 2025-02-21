import OpenAI from "openai";
import { cleanHTML, chunkifyHTML, buildElementIndex } from "./html-processor";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: "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",
  dangerouslyAllowBrowser: true, // Required for client-side usage
});

export interface ElementAnalysisResult {
  actions: Array<{
    elementSelector: string;
    interactionType: "click" | "expand" | "none";
    description: string;
  }>;
  confidence: number;
  explanation: string;
}

export async function analyzePageContent(
  query: string,
  rawHtml: string,
): Promise<ElementAnalysisResult> {
  try {
    // Clean and process the HTML using singleton
    cleanHTML(rawHtml); // This initializes the cleaned document in the singleton
    const chunks = chunkifyHTML(rawHtml);
    const elementIndex = buildElementIndex(chunks);

    console.log("Processed HTML chunks:", chunks);
    console.log("Generated element index:", elementIndex);

    // Send the processed data to OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert at analyzing webpage elements and determining the sequence of actions needed to achieve the user's navigation or search goal. You will receive chunks of HTML and a query. Your task is to determine the sequence of actions needed to navigate to the user's goal.

When analyzing navigation or search requirements:
1. First, see if elements are present / visible in DOM by looking at the text. (The element does not necessarily have to be clickable.)
2. If a confident answer is not found in (1), then see elements hidden behind menus or collapsible sections. Consider if the element being searched for may be behind those menus.
    * Determine the sequence of interactions needed (e.g., open menu first, then click link)
    * Look for data-state="closed" attributes indicating expandable content
    * Consider mobile-specific elements like hamburger menus

Note: Try not to select the #root element as that is very generalized.

Return a JSON object with:
- actions: array of sequential steps needed, if any, each containing:
  * elementSelector: elementSelector is a valid CSS selector inside chunk to find the element. Ensure the selector remains exactly as it appears in the HTML.
  * interactionType: "click", "expand", or "none"
  * description: human-readable description of this step
- confidence: number between 0-1 indicating confidence in the solution
- explanation: string explaining the navigation sequence`,
        },
        {
          role: "user",
          content: `
User Query: ${query}

Page Elements Index:
${elementIndex}
          `.trim(),
        },
      ],
      response_format: { type: "json_object"},
    });

    
    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No content in response");
    }
    
    
    
    const jsonParsedContent = JSON.parse(content);
    console.log("OpenAI original response:", jsonParsedContent);

    
    // Clean up selectors to remove extra escaping
    jsonParsedContent.actions.forEach((action: { elementSelector: string }) => {
      action.elementSelector = cleanSelector(action.elementSelector);
    });

    return jsonParsedContent;
  } catch (error) {
    console.error("Failed to analyze page content:", error);
    throw new Error("Failed to analyze page content");
  }
}


function cleanSelector(selector: string): string {
  return selector
    .replace(/\\\\/g, "\\") // Convert double backslashes to single
    .replace(/^```|```$/g, "") // Remove triple backticks if present
    .replace(/\[(&)/g, "[\\$1") // Adds backslash before '&' only inside brackets
    .replace(/(?<!\\)(?<!\\):/g, '\:'); // Adds backslash before ':' right outside a bracket if not present
}