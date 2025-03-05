import { EntityDB } from "./entity-db";

let db: EntityDB | null = null;


// Initialize function to be called when needed
const initDB = async (): Promise<EntityDB | null> => {
  if (!db) {
    db = new EntityDB({
      vectorPath: "spotter-db",
      model: "Xenova/all-MiniLM-L6-v2",
    });
    console.log("DB initialized:", db);
  }
  return db;
};

const ensureDB = async (): Promise<EntityDB> => {
  const database = await initDB();
  if (!database) {
    throw new Error("[SpotterDB] Database not initialized");
  }
  return database;
};

export const storage = {
  async savePage(text: string, url: string ): Promise<any> {
    const db = await ensureDB();
    const json_obj = {
      text: text,
      url,
      timestamp: new Date().toISOString(),
    };
    console.log("[SpotterDB] Saving page:", json_obj);
    try {
      if (!db) {
        console.error("[SpotterDB] DB NOT init()");
      }
      const key = await db.insert(json_obj);
      console.log("[SpotterDB] Page saved successfully");
      return key;
    } catch (error) {
      console.log("Error saving page:", error);
      throw error;
    }
  },

  async search(query: string, limit = 5): Promise<any[]> {
    const db = await ensureDB();
    console.log("[SpotterDB] Searching similar content");
    return await db.query(query, { limit });
  },

  async getPage(url: string): Promise<any> {
    const db = await ensureDB();
    console.log("[SpotterDB] Getting page:", url);
    const results = await db.query(url);
    return results[0];
  },
};
