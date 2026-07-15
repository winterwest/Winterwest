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

    // Standard US UPCs are 12 digits. Let's provide both the 12-digit padded and 11-digit depadded versions.
    let upcFormatsToTry = [cleanUPC];
    if (cleanUPC.length === 11) {
        upcFormatsToTry.unshift('0' + cleanUPC); // Try 12-digit first
    } else if (cleanUPC.length === 12 && cleanUPC.startsWith('0')) {
        upcFormatsToTry.push(cleanUPC.substring(1)); // Alternate: drop leading zero
    }

    let foundFood = null;

    // 2. Loop through format variations using a precise POST request
    for (let currentUPC of upcFormatsToTry) {
        try {
            console.log(`Querying USDA with strict barcode payload for: ${currentUPC}`);
            
            const response = await fetch(`${USDA_API_URL}?api_key=${USDA_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: currentUPC,
                    dataType: ["Branded"], // Required to search by UPC
                    pageSize: 1
                })
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json();

            if (data.foods && data.foods.length > 0) {
                // Confirm the matched product actually matches our UPC to prevent fuzzy matching errors
                const match = data.foods[0];
                if (match.gtinUpc && match.gtinUpc.replace(/\D/g, '').includes(currentUPC)) {
                    foundFood = match;
                    break;
                }
            }
        } catch (error) {
            console.error(`Error querying UPC ${currentUPC}:`, error);
        }
    }

    // 3. Update the UI or prompt manual entry
    if (foundFood) {
        console.log("Success! Found item: ", foundFood.description);
        const parsedFood = extractNutritionData(foundFood);

        // Save to our local IndexedDB using the barcode
        saveFoodToLocalCache(cleanUPC, parsedFood);

        // Send to UI
        populateFormWithData(parsedFood);
    } else {
        console.warn("UPC not found in USDA database. Redirecting to manual entry.");
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
