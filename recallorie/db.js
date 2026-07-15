const DB_NAME = 'RecallorieDB';
const DB_VERSION = 1;
const STORE_NAME = 'food_history';

let db = null;

// Initialize the database
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            // Create an object store using the UPC code as the unique key
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'upc' });
                // Index by description for quick text searching later
                store.createIndex('description', 'description', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => reject(event.target.error);
    });
}

// Save a food item to the local database
function saveFoodToLocalCache(upc, foodData) {
    if (!db) return;
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Merge UPC into the object data
    const itemToSave = { upc, ...foodData, timestamp: Date.now() };
    store.put(itemToSave);
}

// Get all previously saved items to display in the UI history list
function getAllCachedFoods() {
    return new Promise((resolve, reject) => {
        if (!db) return resolve([]);
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            // Sort by most recently used
            const sorted = request.result.sort((a, b) => b.timestamp - a.timestamp);
            resolve(sorted);
        };
        request.onerror = () => reject(request.error);
    });
}
