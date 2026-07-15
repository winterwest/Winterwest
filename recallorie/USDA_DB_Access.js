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
    if (!cleanUPC) return;

    // We will try both the exact UPC typed, and its alternate variation (padding/depadding the leading zero)
    let upcFormatsToTry = [cleanUPC];
    
    if (cleanUPC.startsWith('0')) {
        upcFormatsToTry.push(cleanUPC.substring(1)); // Try without leading zero (11 digits)
    } else {
        upcFormatsToTry.push('0' + cleanUPC); // Try with a leading zero (12 digits)
    }

    let foundFood = null;
    let finalUPCUsed = cleanUPC;

    // 2. Loop through our format variations until we get a hit!
    for (let currentUPC of upcFormatsToTry) {
        try {
            console.log(`Trying USDA lookup with format: ${currentUPC}`);
            const getUrl = `${USDA_API_URL}?api_key=${USDA_API_KEY}&query=${currentUPC}`;
            const response = await fetch(getUrl);

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json();

            if (data.foods && data.foods.length > 0) {
                foundFood = data.foods[0];
                finalUPCUsed = currentUPC;
                break; // Exit the loop as soon as we find a match!
            }
        } catch (error) {
            console.error(`Error querying format ${currentUPC}:`, error);
        }
    }

    // 3. Process the found match or fallback to manual entry
    if (foundFood) {
        console.log("Success! Found item: ", foundFood.description);
        const parsedFood = extractNutritionData(foundFood);

        // Save to our local IndexedDB using the cleaned barcode
        saveFoodToLocalCache(cleanUPC, parsedFood);

        // Send to UI
        populateFormWithData(parsedFood);
    } else {
        console.warn("UPC not found in USDA database under any common format. Redirecting to manual entry.");
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
