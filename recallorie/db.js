const DB_NAME = 'RecallorieDB';
const DB_VERSION = 2; // Upgraded version to support logging
const STORE_NAME = 'food_history';
const LOG_STORE_NAME = 'daily_log';

let db = null;

// Initialize the database with both object stores
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            // 1. Barcode history store
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'upc' });
                store.createIndex('description', 'description', { unique: false });
            }

            // 2. New store to keep track of daily logged meals
            if (!database.objectStoreNames.contains(LOG_STORE_NAME)) {
                const logStore = database.createObjectStore(LOG_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                logStore.createIndex('dateStr', 'dateStr', { unique: false }); // Index by YYYY-MM-DD
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => reject(event.target.error);
    });
}

// Formats a Date as YYYY-MM-DD using LOCAL time components (not UTC, unlike
// toISOString()). Using toISOString() here would be a real bug: logging a
// meal in the evening in US timezones could get filed under tomorrow's date
// once converted to UTC.
function toLocalDateStr(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Save a scanned food item to the local barcode cache
function saveFoodToLocalCache(upc, foodData) {
    if (!db) return;
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const itemToSave = { upc, ...foodData, timestamp: Date.now() };
    store.put(itemToSave);
}

// Retrieve all barcode-cached foods
function getAllCachedFoods() {
    return new Promise((resolve, reject) => {
        if (!db) return resolve([]);
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const sorted = request.result.sort((a, b) => b.timestamp - a.timestamp);
            resolve(sorted);
        };
        request.onerror = () => reject(request.error);
    });
}

// Save an eaten meal log entry to IndexedDB. mealData.loggedAtMs is the
// epoch-ms timestamp the user chose for "when eaten" (defaults to now if
// not provided). This entry is never auto-deleted, so this store is
// effectively a permanent history of every food eaten - the "how much of X
// have I eaten over time" feature can later query this same store filtered
// by description, without needing any new plumbing.
function logMealToDB(mealData) {
    return new Promise((resolve, reject) => {
        if (!db) return reject("Database not ready");
        const transaction = db.transaction([LOG_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(LOG_STORE_NAME);

        const loggedAtMs = mealData.loggedAtMs || Date.now();
        const dateStr = toLocalDateStr(new Date(loggedAtMs));

        const entry = {
            ...mealData,
            dateStr: dateStr,
            timestamp: loggedAtMs // when the food was actually eaten, not when the record was saved
        };
        delete entry.loggedAtMs; // redundant with timestamp now that it's split out

        const request = store.add(entry);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Get log entries for a specific day
function getMealsLoggedForDate(dateStr) {
    return new Promise((resolve, reject) => {
        if (!db) return resolve([]);
        const transaction = db.transaction([LOG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(LOG_STORE_NAME);
        const index = store.index('dateStr');
        const request = index.getAll(IDBKeyRange.only(dateStr));

        request.onsuccess = () => {
            const sorted = request.result.sort((a, b) => a.timestamp - b.timestamp);
            resolve(sorted);
        };
        request.onerror = () => reject(request.error);
    });
}

// FUTURE FEATURE: full eating history across all dates, for "how much of
// food X have I eaten over time" type views. Not wired into the UI yet.
function getAllLoggedMeals() {
    return new Promise((resolve, reject) => {
        if (!db) return resolve([]);
        const transaction = db.transaction([LOG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(LOG_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const sorted = request.result.sort((a, b) => b.timestamp - a.timestamp);
            resolve(sorted);
        };
        request.onerror = () => reject(request.error);
    });
}

// Delete a logged entry from daily timeline
function deleteLoggedMealFromDB(id) {
    return new Promise((resolve, reject) => {
        if (!db) return reject();
        const transaction = db.transaction([LOG_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(LOG_STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
