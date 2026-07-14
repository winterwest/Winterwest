// Configuration constants
const USDA_API_KEY = 'CVBeeTgj7ZdzecrAXOphkGbTSp41SEPwE1rxWcKn';
const USDA_API_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

/**
 * Looks up a food item by its UPC barcode using the USDA API.
 * @param {string} upc - The scanned or typed barcode string.
 */
async function lookupFoodByUPC(upc) {
    // 1. Clean the input to ensure it's just numbers
    let cleanUPC = upc.trim().replace(/\D/g, '');

    // Auto-pad to 12 digits if it's 11 digits (Standard US UPC-A)
    if (cleanUPC.length === 11) {
        cleanUPC = '0' + cleanUPC;
    }

    try {
        // 2. Fetch data from USDA using an explicit query filter for the barcode
        // Combining the api_key parameter in the URL with the POST body payload
        const response = await fetch(`${USDA_API_URL}?api_key=${USDA_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: cleanUPC,       // General query fallback
                dataType: ["Branded"], // Limits results to barcode consumer items
                pageSize: 1
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();

        // 3. Check if any matching foods were returned
        if (data.foods && data.foods.length > 0) {
            const foodItem = data.foods[0]; // Grab the most accurate match

            // Extract the key nutritional information
            const parsedFood = extractNutritionData(foodItem);

            // 4. Save to your local database (IndexedDB)
            saveFoodToLocalCache(cleanUPC, parsedFood);

            // 5. Populate your app UI with the results
            populateFormWithData(parsedFood);

        } else {
            // Let's do an alternate string fallback loop if the strict array array returned empty
            // This queries it via a direct GET string parameter just in case
            const getUrl = `${USDA_API_URL}?api_key=${USDA_API_KEY}&query=${cleanUPC}&dataType=Branded`;
            const getResponse = await fetch(getUrl);
            const getData = await getResponse.json();

            if (getData.foods && getData.foods.length > 0) {
                const parsedFood = extractNutritionData(getData.foods[0]);
                saveFoodToLocalCache(cleanUPC, parsedFood);
                populateFormWithData(parsedFood);
            } else {
                console.warn("UPC not found in USDA database. Redirecting to manual entry.");
                openManualEntryForm(cleanUPC);
            }
        }

    } catch (error) {
        console.error("Failed to fetch food data:", error);
        openManualEntryForm(cleanUPC);
    }
}

/**
 * Helper function to parse out the messy USDA nutrient array into a clean JSON object
 */
function extractNutritionData(foodItem) {
    const nutrients = foodItem.foodNutrients || [];

    // Helper to extract values based on the standardized nutrient IDs
    const findNutrientValue = (id) => {
        const match = nutrients.find(n => n.nutrientId === id || n.id === id);
        return match ? match.value : 0;
    };

    return {
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
