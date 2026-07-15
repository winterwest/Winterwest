// Configuration constants
const USDA_API_KEY = 'CVBeeTgj7ZdzecrAXOphkGbTSp41SEPwE1rxWcKn';
const USDA_API_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

/**
 * Strips everything but digits, then strips leading zeros.
 * Used so "012345678905", "12345678905", and "0012345678905" all
 * compare equal regardless of how USDA or the scanner padded them.
 */
function normalizeDigits(str) {
    if (!str) return '';
    const digits = String(str).replace(/\D/g, '');
    const stripped = digits.replace(/^0+/, '');
    return stripped || '0';
}

/**
 * Looks up a food item by its UPC barcode using the USDA API.
 * @param {string} upc - The scanned or typed barcode string.
 */
async function lookupFoodByUPC(upc) {
    // 1. Clean the input to ensure it's just numbers
    let cleanUPC = upc.trim().replace(/\D/g, '');
    if (!cleanUPC) return;

    const targetNormalized = normalizeDigits(cleanUPC);

    // Standard US UPCs are 12 digits. Try both the 12-digit padded and
    // 11-digit depadded text variants, since the *text search* (not the
    // GTIN match itself) can behave differently depending on the exact
    // string sent.
    let upcFormatsToTry = [cleanUPC];
    if (cleanUPC.length === 11) {
        upcFormatsToTry.unshift('0' + cleanUPC);
    } else if (cleanUPC.length === 12 && cleanUPC.startsWith('0')) {
        upcFormatsToTry.push(cleanUPC.substring(1));
    }

    let foundFood = null;

    // 2. Loop through format variations
    for (let currentUPC of upcFormatsToTry) {
        try {
            console.log(`Querying USDA for barcode: ${currentUPC}`);

            const response = await fetch(`${USDA_API_URL}?api_key=${USDA_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: currentUPC,
                    dataType: ["Branded"], // Required to search by UPC
                    // IMPORTANT: pageSize was 1, which meant we only ever looked
                    // at the top text-search hit. The exact GTIN match is often
                    // NOT ranked first for a pure-digit query. Pull more
                    // candidates and scan them all for a real match.
                    pageSize: 25
                })
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json();

            if (data.foods && data.foods.length > 0) {
                // Scan ALL returned candidates for an exact normalized GTIN match,
                // rather than trusting that foods[0] is correct.
                const match = data.foods.find(f =>
                    f.gtinUpc && normalizeDigits(f.gtinUpc) === targetNormalized
                );
                if (match) {
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
 * Helper function to parse out the messy USDA nutrient array into a clean JSON object.
 *
 * NOTE ON SCALING: USDA's foodNutrients array for Branded foods is reported
 * PER 100g of product (this is the FDC standard basis), regardless of the
 * product's actual serving size. So we store everything as "...Per100g" and
 * compute the actual macros for a given portion as (per100g value * grams / 100)
 * at display/log time. That's what lets us reuse a cached food across
 * different portion sizes without ever hitting the network again.
 */
function extractNutritionData(foodItem) {
    const nutrients = foodItem.foodNutrients || [];

    const findNutrientValue = (id) => {
        const match = nutrients.find(n => n.nutrientId === id || n.id === id);
        return match ? match.value : 0;
    };

    // servingSize/servingSizeUnit come straight off the product label when present.
    const servingSize = foodItem.servingSize || null;
    const servingSizeUnit = foodItem.servingSizeUnit || null;

    return {
        description: foodItem.description,
        brand: foodItem.brandOwner || 'Generic',
        fdcId: foodItem.fdcId,

        // Per-100g baseline nutrient values (USDA's standard reporting basis)
        caloriesPer100g: findNutrientValue(1008), // Energy (KCAL)
        proteinPer100g: findNutrientValue(1003),  // Protein (G)
        carbsPer100g: findNutrientValue(1005),    // Carbohydrate, by difference (G)
        fatPer100g: findNutrientValue(1004),      // Total lipid (fat) (G)

        // Label info, used to pre-fill a sensible default portion weight
        servingSize: servingSize,
        servingSizeUnit: servingSizeUnit,
        householdServingText: foodItem.householdServingFullText || null
    };
}

/**
 * Given a cached food record (per-100g basis) and an actual portion weight
 * in grams, returns the scaled macros for that portion.
 */
function scaleFoodToGrams(food, grams) {
    const ratio = (Number(grams) || 0) / 100;
    return {
        calories: (food.caloriesPer100g || 0) * ratio,
        protein: (food.proteinPer100g || 0) * ratio,
        carbs: (food.carbsPer100g || 0) * ratio,
        fat: (food.fatPer100g || 0) * ratio
    };
}
