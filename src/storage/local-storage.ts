interface PageVisit {
    url: string;
    timestamp: number;
    vectorId?: string;  // Changed from indexedKeyName to vectorId
  }
  
  
  const SEEN_PAGES_KEY = "spotter_seen_pages";
  const PENDING_QUERY_KEY = "spotter_pending_query";
  
  export const localStorageHandler = {
    getSeenPages(): PageVisit[] {
      const storedData = localStorage.getItem("spotter_seen_pages");
      return storedData ? JSON.parse(storedData) : [];
    },
  
    addSeenPage(url: string, vectorId?: string): void {
      const seenPages = this.getSeenPages();
      const existingIndex = seenPages.findIndex(page => page.url === url);
  
      if (existingIndex >= 0) {
        seenPages[existingIndex].timestamp = Date.now();
        if (vectorId) {
          seenPages[existingIndex].vectorId = vectorId;
        }
      } else {
        seenPages.push({ 
          url, 
          timestamp: Date.now(),
          ...(vectorId && { vectorId })
        });
      }
  
      localStorage.setItem(SEEN_PAGES_KEY, JSON.stringify(seenPages));
    },
  
    hasSeenPage(url: string): boolean {
      const seenPages = this.getSeenPages();
      const pageVisit = seenPages.find(page => page.url === url);
  
      if (!pageVisit) return false;
  
      const dayInMs = 24 * 60 * 60 * 1000;
      return (Date.now() - pageVisit.timestamp) < dayInMs;
    },
  
    setPageTime(url: string): void {
      const seenPages = this.getSeenPages();
      const existingIndex = seenPages.findIndex(page => page.url === url);
  
      if (existingIndex >= 0) {
        seenPages[existingIndex].timestamp = Date.now();
        localStorage.setItem(SEEN_PAGES_KEY, JSON.stringify(seenPages));
      }
    },
  
    setVectorId(url: string, vectorId: string): void {
      const seenPages = this.getSeenPages();
      const existingIndex = seenPages.findIndex(page => page.url === url);
  
      if (existingIndex >= 0) {
        seenPages[existingIndex].vectorId = vectorId;
        localStorage.setItem(SEEN_PAGES_KEY, JSON.stringify(seenPages));
      }
    },
  
    setPendingQuery(query: string): void {
      localStorage.setItem(PENDING_QUERY_KEY, JSON.stringify({
        query,
        timestamp: Date.now()
      }));
    },
  
    getPendingQuery(): string | null {
      const stored = localStorage.getItem(PENDING_QUERY_KEY);
      if (!stored) return null;
      
      const data = JSON.parse(stored);
      console.log('data', data);
      localStorage.removeItem(PENDING_QUERY_KEY);
      return data.query;
    }
  };