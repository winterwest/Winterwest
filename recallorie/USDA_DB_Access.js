// Configuration constants
const USDA_API_KEY = 'CVBeeTgj7ZdzecrAXOphkGbTSp41SEPwE1rxWcKn';
const USDA_API_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

/**
 * Looks up a food item by its UPC barcode using the USDA API.
 * @param {string} upc - The scanned or typed barcode string.
 */
async function lookupFoodByUPC(upc) {
    // 1. Clean the input to ensure it's just numbers
    const cleanUPC = upc.trim();

    try {
        // 2. Fetch data from USDA FoodData Central (restricting dataType to Branded items for speed)
        const response = await fetch(`${USDA_API_URL}?api_key=${USDA_API_KEY}&query=${cleanUPC}&dataType=Branded`);

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();

        // 3. Check if any matching foods were returned
        if (data.foods && data.foods.length > 0) {
            const foodItem = data.foods[0]; // Take the most relevant match

            // Extract the key nutritional information
            const parsedFood = extractNutritionData(foodItem);

            // 4. Save to your local database (IndexedDB or LocalStorage)
            saveFoodToLocalCache(cleanUPC, parsedFood);

            // 5. Populate your app UI with the results
            populateFormWithData(parsedFood);

        } else {
            // USDA API Gotcha Fallback: If barcode isn't found, open manual entry
            console.warn("UPC not found in USDA database. Redirecting to manual entry.");
            openManualEntryForm(cleanUPC);
        }

    } catch (error) {
        console.error("Failed to fetch food data:", error);
        // Fallback fallback: Network or API failure should also let them type it manually
        openManualEntryForm(cleanUPC);
    }
}

/**
 * Helper function to parse out the messy USDA nutrient array into a clean JSON object
 */
function extractNutritionData(foodItem) {
    const nutrients = foodItem.foodNutrients || [];

    // Helper to extract values based on the Swagger schema structure
    const findNutrientValue = (id) => {
        // Look up by standardized government nutrient IDs
        const match = nutrients.find(n => n.nutrientId === id || n.id === id);
        return match ? match.value : 0;
    };

    return {
        // Main Swagger root properties
        description: foodItem.description,
        brand: foodItem.brandOwner || 'Generic',
        fdcId: foodItem.fdcId,

        // Exact nutrient IDs as per USDA schema definitions
        calories: findNutrientValue(1008), // 1008 = Energy (KCAL)
        protein: findNutrientValue(1003),  // 1003 = Protein (G)
        carbs: findNutrientValue(1005),    // 1005 = Carbohydrate, by difference (G)
        fat: findNutrientValue(1004)       // 1004 = Total lipid (fat) (G)
    };
}